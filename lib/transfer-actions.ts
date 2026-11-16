"use server";

// Devir server action'ları — müşteri tarafı.
//
// İş mantığı lib/transfer.ts'te; burada yetki, form okuma, bildirim ve
// önbellek tazeleme var.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/consent";
import { transferPassenger, canTransferBooking, type TransferTarget } from "@/lib/transfer";
import type { FormState } from "@/lib/form-state";

// Devir sonrası gönderilecek üç bildirim. Best-effort: gitmezse devir yine
// geçerli, kayıt panelde duruyor.
async function notifyTransfer(transferId: string) {
  try {
    const { sendTransferReceived, sendTransferSent, sendTransferAdminNotice } = await import(
      "@/lib/notifications"
    );
    await sendTransferReceived(transferId);
    await sendTransferSent(transferId);
    await sendTransferAdminNotice(transferId);
  } catch (e) {
    console.error("[Devir bildirimi gönderilemedi]", { transferId, error: e });
  }
}

function targetFromForm(fd: FormData): TransferTarget {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const nat = s("nationality") === "FOREIGN" ? "FOREIGN" : "TC";
  return {
    firstName: s("firstName"),
    lastName: s("lastName"),
    email: s("email"),
    phone: s("phone"),
    gender: s("gender") === "K" ? "K" : "E",
    idNumber: s("idNumber"),
    nationality: nat,
    country: nat === "FOREIGN" ? s("country") : "Türkiye",
    birthDate: s("birthDate") || undefined,
  };
}

// Devir sonucunu forma taşıyan tip: cinsiyet çakışmasında önerilen koltuklar
// da döndürülüyor, müşteri koltuk değiştirip devam edebilsin.
export interface TransferFormState extends FormState {
  suggestedSeats?: string[];
  priceDifference?: number;
  differenceToken?: string | null;
}

export async function submitTransfer(
  _prev: TransferFormState,
  fd: FormData
): Promise<TransferFormState> {
  const user = await requireUser("/hesabim/rezervasyonlarim");

  const bookingId = String(fd.get("bookingId") ?? "").trim();
  const passengerId = String(fd.get("passengerId") ?? "").trim();
  if (!bookingId || !passengerId)
    return { ok: false, error: "Rezervasyon ve yolcu seçilmeli." };

  // Rezervasyon bu müşterinin mi? Aksi halde kimse başkasının yolcusunu
  // devredebilirdi.
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: user.id },
    select: { id: true },
  });
  if (!booking)
    return { ok: false, error: "Bu rezervasyon hesabınıza bağlı değil." };

  const ip = clientIpFrom(await headers()) ?? "bilinmiyor";
  if (!rateLimit(`devir:${ip}`, 10, 60 * 60 * 1000))
    return {
      ok: false,
      error: "Çok fazla devir denemesi yapıldı. Lütfen bir süre sonra tekrar deneyin.",
    };

  const res = await transferPassenger({
    bookingId,
    passengerId,
    to: targetFromForm(fd),
    newSeatCode: String(fd.get("newSeatCode") ?? "").trim() || undefined,
    actor: "MUSTERI",
    actorEmail: user.email,
  });

  if (!res.ok)
    return { ok: false, error: res.error, suggestedSeats: res.suggestedSeats };

  await notifyTransfer(res.transferId);

  revalidatePath("/hesabim/rezervasyonlarim");
  revalidatePath("/hesabim");
  revalidatePath("/admin/rezervasyonlar");
  revalidatePath("/turlar", "layout");

  return {
    ok: true,
    message:
      "Devir tamamlandı. Devredilen kişiye bilet bilgileri e-posta ile gönderildi.",
    priceDifference: res.priceDifference,
    differenceToken: res.differenceToken,
  };
}

// "Devret" butonunun görünüp görünmeyeceği + görünmüyorsa sebebi.
export async function transferEligibility(
  bookingId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await canTransferBooking(bookingId);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

// --- Fiyat farkı ödeme sayfası (/devir-odeme/<token>) --------------------
//
// Başka tura devirde oluşan borç müşteriye gizli bir bağlantıyla gönderilir.
// Rezervasyon id'si e-postalarda görünüyor; tahmin edilebilir bir adres
// üzerinden başkasının borcu görüntülenmemeli, bu yüzden ayrı bir sır.

export interface TransferDifferenceView {
  transferId: string;
  tourTitle: string;
  departureDate: string;
  contactName: string;
  amount: number;
  currency: string;
  status: string;
  bookingId: string;
  bookingRef: string;
}

export async function getTransferDifferenceView(
  token: string
): Promise<TransferDifferenceView | null> {
  if (!token?.trim()) return null;
  const t = await prisma.bookingTransfer.findUnique({
    where: { differenceToken: token.trim() },
    include: {
      targetBooking: { include: { tour: true, departure: true } },
      booking: { include: { tour: true, departure: true } },
    },
  });
  if (!t) return null;

  const active = t.targetBooking ?? t.booking;
  const dep = active.departure?.departureDate ?? active.tour.departureDate;

  return {
    transferId: t.id,
    tourTitle: active.tour.title,
    departureDate: dep.toISOString(),
    contactName: `${t.toFirstName} ${t.toLastName}`,
    amount: t.priceDifference,
    currency: active.tour.currency,
    status: t.differenceStatus,
    bookingId: active.id,
    bookingRef: active.id.slice(-8).toUpperCase(),
  };
}

// Farkı iyzico ile öde. Ödeme başarılı dönünce fark ODENDI olur ve tahsilat
// defterine yazılır (callback akışı mevcut bakiye ödemesiyle aynı mantık).
export async function payTransferDifference(fd: FormData) {
  const token = String(fd.get("token") ?? "").trim();
  const view = await getTransferDifferenceView(token);
  if (!view) {
    redirect("/");
  }
  if (view.status !== "BEKLIYOR") {
    redirect(`/devir-odeme/${token}?hata=${encodeURIComponent("Bu fark zaten kapatılmış.")}`);
  }

  const { startPayment } = await import("@/lib/payment");
  const booking = await prisma.booking.findUnique({
    where: { id: view.bookingId },
    select: { contactName: true, contactEmail: true, contactPhone: true },
  });
  if (!booking) redirect("/");

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";

  const { redirectUrl } = await startPayment({
    bookingId: view.bookingId,
    amount: view.amount,
    currency: view.currency,
    contactName: booking.contactName,
    contactEmail: booking.contactEmail,
    contactPhone: booking.contactPhone,
    tourTitle: `${view.tourTitle} — devir fiyat farkı`,
    baseUrl: `${proto}://${host}`,
  });
  redirect(redirectUrl);
}
