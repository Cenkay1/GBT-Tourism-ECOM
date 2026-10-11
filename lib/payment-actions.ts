"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSessionEmail } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { markBookingPaid, cancelBooking, cancelBookingByAdmin } from "@/lib/booking";
import { cancelPayment, refundPayment, IyzicoError } from "@/lib/iyzico";
import { isIyzicoConfigured } from "@/lib/payment";

// Simülasyon: "ödeme başarılı" — iyzico anahtarları tanımlı değilken
// /odeme/<id> test ekranından çağrılır.
export async function simulateSuccess(bookingId: string) {
  const res = await markBookingPaid(bookingId, `SIM-${Date.now()}`);
  if (!res.ok) {
    redirect(`/odeme/${bookingId}?hata=${encodeURIComponent(res.error ?? "Ödeme tamamlanamadı.")}`);
  }
  // Elden satışta görevli kartla öderken (KREDI_KARTI) sonuç panele döner.
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { paymentMethod: true },
  });
  if (booking?.paymentMethod === "KREDI_KARTI") {
    redirect(`/admin/rezervasyonlar/${bookingId}?odeme=ok`);
  }
  redirect(`/rezervasyon/basarili?no=${bookingId}`);
}

// Simülasyon: "ödeme iptal" — koltukları serbest bırak.
export async function simulateCancel(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  await cancelBooking(bookingId);
  const tour = booking
    ? await prisma.tour.findUnique({ where: { id: booking.tourId } })
    : null;
  redirect(tour ? `/turlar/${tour.slug}?iptal=1` : "/turlar");
}

// ── Admin iade ──────────────────────────────────────────────────────────────

// Ödenmiş bir rezervasyonun parasını iyzico üzerinden geri verir, rezervasyonu
// iptale çeker ve koltukları boşa alır.
//
// iyzico'da iki ayrı işlem var:
//   - cancel: aynı gün, banka mutabakatından önce → ekstreye hiç düşmez
//   - refund: sonraki günler (365 güne kadar) → ekstrede iade satırı görünür
// Hangisi uygunsa onu deniyoruz; cancel reddedilirse refund'a düşüyoruz.
// useActionState imzası: (önceki durum, form verisi). bookingId forma gizli
// alan olarak gömülür.
export async function refundBooking(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const bookingId = String(fd.get("bookingId") ?? "").trim();
  if (!bookingId) return { ok: false, error: "Rezervasyon belirtilmedi." };

  const email = await getSessionEmail();
  if (!email) return { ok: false, error: "Yetkisiz." };

  if (!isIyzicoConfigured()) {
    return { ok: false, error: "iyzico yapılandırılmamış — iade yapılamaz." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });
  if (!booking) return { ok: false, error: "Rezervasyon bulunamadı." };
  if (booking.status !== "ODENDI") {
    return { ok: false, error: "Yalnızca ödenmiş rezervasyonlar iade edilebilir." };
  }

  const payment = await prisma.payment.findFirst({
    where: { bookingId, status: "BASARILI", paymentId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!payment?.paymentId) {
    return {
      ok: false,
      error:
        "Bu rezervasyon için iyzico ödeme kaydı yok (elden satış olabilir). İade iyzico panelinden yapılmalı.",
    };
  }
  if (payment.refundedAt) {
    return { ok: false, error: "Bu ödeme zaten iade edilmiş." };
  }

  const amount = payment.paidAmount ?? payment.amount;

  // Önce cancel (aynı gün), olmazsa refund.
  let ref: string | undefined;
  try {
    const res = await cancelPayment({
      paymentId: payment.paymentId,
      conversationId: bookingId,
    });
    ref = res.cancelHostReference ?? res.hostReference ?? res.paymentId;
  } catch (cancelErr) {
    // Aynı gün iptal mümkün değilse (mutabakat geçmiş) normal akış; ağ
    // hatasında ise nedeni iz bırakmak için kaydet.
    console.warn("[iyzico cancel reddedildi, refund deneniyor]", {
      bookingId,
      error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
      errorCode: cancelErr instanceof IyzicoError ? cancelErr.errorCode : undefined,
    });
    try {
      const res = await refundPayment({
        paymentId: payment.paymentId,
        price: amount.toFixed(1),
        currency: payment.currency,
        conversationId: bookingId,
      });
      ref = res.refundHostReference ?? res.hostReference ?? res.paymentId;
    } catch (refundErr) {
      const err = refundErr instanceof IyzicoError ? refundErr : null;
      console.error("[iyzico iade hatası]", { cancelErr, refundErr });
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          errorCode: err?.errorCode ?? null,
          errorMessage: (refundErr instanceof Error
            ? refundErr.message
            : String(refundErr)
          ).slice(0, 500),
        },
      });
      return {
        ok: false,
        error: `iyzico iadeyi reddetti: ${
          refundErr instanceof Error ? refundErr.message : "bilinmeyen hata"
        }`,
      };
    }
  }

  // iyzico parayı geri verdi — ödeme kaydını kapat.
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "IADE",
      refundedAt: new Date(),
      refundRef: ref ?? null,
      errorCode: null,
      errorMessage: null,
    },
  });

  // Para artık GERİ ALINAMAZ biçimde iyzico'dan geri verildi. Ödeme kaydı
  // zaten "IADE" — bu bilgi ne olursa olsun kalıcı, listeyi hemen tazeleyelim.
  revalidatePath("/admin/rezervasyonlar");
  revalidatePath(`/admin/rezervasyonlar/${bookingId}`);

  // Rezervasyonu iptale çek: koltuk boşaltma, puan geri alımı ve müşteri
  // bildirimi tek yerde (lib/booking.ts) toplandı.
  //
  // Bu adım parayı geri vermekten AYRI bir işlem ve başarısız olabilir
  // (örn. geçici veritabanı hatası, ya da rezervasyon bu arada silinmiş
  // olabilir — bkz. admin-actions.ts deleteBooking, korumasız). Dönüş
  // değerini kontrol etmeden ve try/catch'siz "İade tamamlandı" demek iki
  // şekilde yanıltıcı olurdu:
  //   1) Görevli koltukların hâlâ dolu olduğunu fark etmez.
  //   2) Görevli ikinci kez "İade Et"e basarsa, bu fonksiyonun en üstündeki
  //      `payment.findFirst(... status: "BASARILI" ...)` artık bu kaydı
  //      bulamaz (status zaten "IADE") ve "iyzico ödeme kaydı yok, panelden
  //      yapın" gibi YANLIŞ bir mesaj verir — oysa iade iyzico tarafında
  //      zaten başarıyla yapıldı, panelden tekrar aranmamalı.
  // Bu yüzden `ok: true` döndürüp RefundButton'daki formu (ki yalnız
  // state.ok === true olunca gizleniyor) kapatıyoruz — görevli bir daha
  // "İade Et"e basamasın — ama mesajı `error` alanına koyup kırmızı/uyarı
  // kutusunda gösteriyoruz ki görevli "her şey yolunda" zannetmesin ve elle
  // iptal etmesi gerektiğini net görsün.
  try {
    const cancelRes = await cancelBookingByAdmin(
      bookingId,
      "Ödemeniz tarafımızca iade edilmiştir.",
      { refundAmount: amount }
    );
    if (!cancelRes.ok) {
      console.error("[iyzico iade hatası] cancelBookingByAdmin başarısız döndü", {
        bookingId,
        error: cancelRes.error,
      });
      return {
        ok: true,
        error: `ÖNEMLİ: iyzico'dan ${amount} ${payment.currency} tutarında iade BAŞARIYLA alındı — bu iade için TEKRAR işlem yapmayın. Ancak rezervasyon iptale alınamadı (${cancelRes.error ?? "bilinmeyen hata"}): koltuklar hâlâ SATILDI görünüyor, sadakat puanı geri alınmadı ve müşteriye bildirim gönderilmedi. Bu sayfadaki "İptal et" düğmesiyle rezervasyonu ELLE iptale alın.`,
      };
    }
  } catch (e) {
    console.error("[iyzico iade hatası] cancelBookingByAdmin istisna fırlattı", {
      bookingId,
      error: e,
    });
    return {
      ok: true,
      error: `ÖNEMLİ: iyzico'dan ${amount} ${payment.currency} tutarında iade BAŞARIYLA alındı — bu iade için TEKRAR işlem yapmayın. Ancak rezervasyonu iptale alma işlemi sırasında beklenmeyen bir hata oluştu: koltuklar hâlâ SATILDI görünüyor, sadakat puanı geri alınmadı ve müşteriye bildirim gönderilmedi. Bu sayfadaki "İptal et" düğmesiyle rezervasyonu ELLE iptale alın.`,
    };
  }

  return {
    ok: true,
    message: `İade tamamlandı (${amount} ${payment.currency}). Rezervasyon iptale alındı, koltuklar serbest bırakıldı.`,
  };
}
