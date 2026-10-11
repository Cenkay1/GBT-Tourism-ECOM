"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { createPendingBooking, PassengerInput } from "@/lib/booking";
import { startPayment } from "@/lib/payment";
import { getCurrentUser } from "@/lib/session";
import { checkConsent, clientIpFrom } from "@/lib/consent";

function s(fd: FormData, k: string): string {
  return (fd.get(k) as string | null)?.trim() ?? "";
}

// Yolcu formunu işle → rezervasyon oluştur → ödemeye yönlendir.
export async function submitCheckout(fd: FormData) {
  const tourId = s(fd, "tourId");
  const bookingType = s(fd, "bookingType");
  const boardingPlaceId = s(fd, "boardingPlaceId") || undefined;
  const departureId = s(fd, "departureId") || undefined;
  const seatCodes = s(fd, "seatCodes")
    ? s(fd, "seatCodes").split(",").map((c) => c.trim()).filter(Boolean)
    : [];
  const quantity = Number(s(fd, "quantity")) || 0;

  const count = bookingType === "KOLTUK" ? seatCodes.length : quantity;

  const passengers: PassengerInput[] = [];
  for (let i = 0; i < count; i++) {
    const g = s(fd, `p_${i}_gender`);
    const room = s(fd, `p_${i}_room`);
    passengers.push({
      firstName: s(fd, `p_${i}_first`),
      lastName: s(fd, `p_${i}_last`),
      idNumber: s(fd, `p_${i}_id`),
      seatCode: bookingType === "KOLTUK" ? seatCodes[i] : undefined,
      gender: g === "K" ? "K" : g === "E" ? "E" : undefined,
      birthDate: s(fd, `p_${i}_birth`) || undefined,
      nationality: s(fd, `p_${i}_nat`) === "FOREIGN" ? "FOREIGN" : "TC",
      country: s(fd, `p_${i}_country`) || undefined,
      // Yaş grubu gönderilmez: sunucu doğum tarihinden hesaplar.
      roomIndex: room === "" ? undefined : Number(room),
      idDocument: s(fd, `p_${i}_doc`) || undefined,
    });
  }

  // Rıza (KVKK + mesafeli satış) — SUNUCUDA zorunlu. İstemcideki `required`
  // niteliği elle hazırlanmış bir istekle atlanabilir; rıza alınmadan satış
  // yapılmamalı, bu yüzden burada reddediyoruz.
  const reqHeaders = await headers();
  const consentCheck = checkConsent(fd, clientIpFrom(reqHeaders));
  if (!consentCheck.ok) {
    const t = await prisma.tour.findUnique({ where: { id: tourId } });
    redirect(
      `${t ? `/turlar/${t.slug}` : "/turlar"}?hata=${encodeURIComponent(consentCheck.error)}`
    );
  }

  // Oturumdaki müşteri (varsa) — userId istemciden DEĞİL, sunucudan alınır.
  const currentUser = await getCurrentUser();

  const result = await createPendingBooking({
    tourId,
    departureId,
    contactName: s(fd, "contactName"),
    contactPhone: s(fd, "contactPhone"),
    contactEmail: s(fd, "contactEmail"),
    passengers,
    seatCodes: bookingType === "KOLTUK" ? seatCodes : undefined,
    quantity: bookingType === "KONTENJAN" ? quantity : undefined,
    boardingPlaceId,
    userId: currentUser?.id,
    rooms: s(fd, "rooms") || undefined,
    consent: consentCheck.consent,
  });

  if (!result.ok) {
    const tour = await prisma.tour.findUnique({ where: { id: tourId } });
    const back = tour ? `/turlar/${tour.slug}` : "/turlar";
    redirect(`${back}?hata=${encodeURIComponent(result.error)}`);
  }

  const tour = await prisma.tour.findUnique({ where: { id: tourId } });
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const baseUrl = `${proto}://${host}`;

  const { redirectUrl } = await startPayment({
    bookingId: result.bookingId,
    amount: result.amount,
    currency: tour?.currency ?? "TRY",
    contactName: s(fd, "contactName"),
    contactEmail: s(fd, "contactEmail"),
    contactPhone: s(fd, "contactPhone"),
    tourTitle: tour?.title ?? "Tur",
    baseUrl,
  });

  redirect(redirectUrl);
}
