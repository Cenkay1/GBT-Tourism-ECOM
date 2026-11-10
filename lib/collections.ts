// Tahsilat defteri — bir rezervasyon için alınan paranın tek doğru kaynağı.
//
// Booking.paidAmount bir ÖNBELLEKTİR: her değişiklikte Collection satırlarının
// toplamından yeniden hesaplanır. Böylece yanlış girilen bir tahsilat silinince
// bakiye kendiliğinden düzelir ve "artır/azalt" mantığının kaçırabileceği
// tutarsızlık (çift sayma, eksik düşme) hiç oluşmaz.
import { prisma } from "@/lib/db";
import { balanceOf } from "@/lib/shared";
import { randomBytes } from "node:crypto";

export type CollectionMethod = "NAKIT" | "HAVALE" | "KREDI_KARTI" | "ONLINE";

const METHODS: CollectionMethod[] = ["NAKIT", "HAVALE", "KREDI_KARTI", "ONLINE"];

export function isCollectionMethod(v: string): v is CollectionMethod {
  return (METHODS as string[]).includes(v);
}

// Kalan ödeme bağlantısı için gizli anahtar. Rezervasyon id'si e-postalarda ve
// adres çubuğunda göründüğü için ayrı bir sır kullanılır.
export async function ensureBalanceToken(bookingId: string): Promise<string> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { balanceToken: true },
  });
  if (!booking) throw new Error("Rezervasyon bulunamadı.");
  if (booking.balanceToken) return booking.balanceToken;

  const token = randomBytes(24).toString("base64url");
  await prisma.booking.update({
    where: { id: bookingId },
    data: { balanceToken: token },
  });
  return token;
}

// paidAmount'u defterden yeniden hesapla ve yaz. Dönen değer yeni bakiyedir.
export async function syncPaidAmount(bookingId: string): Promise<number> {
  const sum = await prisma.collection.aggregate({
    where: { bookingId },
    _sum: { amount: true },
  });
  const paidAmount = Math.max(0, sum._sum.amount ?? 0);
  await prisma.booking.update({ where: { id: bookingId }, data: { paidAmount } });
  return paidAmount;
}

export interface RecordCollectionInput {
  bookingId: string;
  amount: number;
  method: CollectionMethod;
  note?: string;
  // İlgili iyzico ödeme kaydının id'si. Verilirse MÜKERRER KORUMASI devreye
  // girer: aynı ödeme için ikinci kez tahsilat yazılmaz (callback iki kez
  // gelebilir). Elden tahsilatlarda boş bırakılır.
  paymentId?: string;
  // Tahsilat sonucu bakiye kapandıysa müşteriye bilgi e-postası gider.
  // Testlerde ve toplu işlemlerde kapatılabilir.
  notify?: boolean;
}

export type RecordCollectionResult =
  | { ok: true; paidAmount: number; balance: number; duplicate: boolean }
  | { ok: false; error: string };

// Tahsilat kaydet. amount negatif olabilir (yanlış girilen tutarın düzeltmesi).
export async function recordCollection(
  input: RecordCollectionInput
): Promise<RecordCollectionResult> {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount === 0)
    return { ok: false, error: "Tahsilat tutarı 0 olamaz." };

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, totalAmount: true, paidAmount: true },
  });
  if (!booking) return { ok: false, error: "Rezervasyon bulunamadı." };

  // Negatif düzeltme toplamı eksiye düşürmesin.
  if (amount < 0 && booking.paidAmount + amount < 0)
    return {
      ok: false,
      error: `Düzeltme tutarı tahsil edilenden büyük olamaz (tahsil edilen: ${booking.paidAmount}).`,
    };

  // Aynı iyzico ödemesi daha önce işlendiyse hiçbir şey yapma.
  if (input.paymentId) {
    const existing = await prisma.collection.findUnique({
      where: { paymentId: input.paymentId },
      select: { id: true },
    });
    if (existing) {
      const paidAmount = await syncPaidAmount(booking.id);
      return {
        ok: true,
        paidAmount,
        balance: balanceOf(booking.totalAmount, paidAmount),
        duplicate: true,
      };
    }
  }

  const wasOpen = balanceOf(booking.totalAmount, booking.paidAmount) > 0;

  try {
    await prisma.collection.create({
      data: {
        bookingId: booking.id,
        amount,
        method: input.method,
        note: input.note?.trim() || "",
        paymentId: input.paymentId ?? null,
      },
    });
  } catch (e) {
    // paymentId UNIQUE çakışması: callback'in iki kez gelmesi normal bir durum,
    // hata değil — defter zaten doğru.
    const paidAmount = await syncPaidAmount(booking.id);
    if (input.paymentId) {
      return {
        ok: true,
        paidAmount,
        balance: balanceOf(booking.totalAmount, paidAmount),
        duplicate: true,
      };
    }
    console.error("[tahsilat kaydedilemedi]", { bookingId: booking.id, error: e });
    return { ok: false, error: "Tahsilat kaydedilemedi. Lütfen tekrar deneyin." };
  }

  const paidAmount = await syncPaidAmount(booking.id);
  const balance = balanceOf(booking.totalAmount, paidAmount);

  // Bakiye bu tahsilatla kapandı: puanı yaz ve müşteriye bildir.
  if (wasOpen && balance === 0) {
    try {
      const { awardLoyaltyForBooking } = await import("@/lib/loyalty");
      await awardLoyaltyForBooking(booking.id);
    } catch (e) {
      console.error("[tahsilat: sadakat puanı hatası]", e);
    }
    if (input.notify !== false) {
      try {
        const { sendBalanceCompleted } = await import("@/lib/notifications");
        await sendBalanceCompleted(booking.id);
      } catch (e) {
        console.error("[tahsilat: tamamlandı bildirimi hatası]", e);
      }
    }
  } else if (balance > 0 && input.notify !== false) {
    // Bakiye açık kaldı: müşteriye ne kadar ödediğini, ne kadar kaldığını ve
    // son ödeme tarihini bildir. Görevli panelden tahsilat girdiğinde
    // müşterinin bilgilendirilmesi bu satıra bağlı.
    try {
      const { sendBalanceStatement } = await import("@/lib/notifications");
      await sendBalanceStatement(booking.id);
    } catch (e) {
      console.error("[tahsilat: bakiye bildirimi hatası]", e);
    }
  }

  return { ok: true, paidAmount, balance, duplicate: false };
}

// Yanlış girilen tahsilat satırını sil (yalnız elden kayıtlar silinebilir —
// iyzico ile eşlenmiş bir tahsilat gerçekten tahsil edilmiş paradır, defterden
// silinmesi mutabakatı bozar; o para için iade akışı kullanılmalı).
export async function deleteCollection(
  id: string
): Promise<{ ok: boolean; error?: string; bookingId?: string }> {
  const row = await prisma.collection.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Tahsilat kaydı bulunamadı." };
  if (row.paymentId)
    return {
      ok: false,
      error:
        "Bu tahsilat iyzico ödemesiyle eşlenmiş; defterden silinemez. Parayı geri vermek için iade işlemini kullanın.",
    };

  await prisma.collection.delete({ where: { id } });
  await syncPaidAmount(row.bookingId);
  return { ok: true, bookingId: row.bookingId };
}
