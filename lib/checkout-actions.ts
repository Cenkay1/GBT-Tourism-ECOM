"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { createPendingBooking, PassengerInput } from "@/lib/booking";
import { startPayment } from "@/lib/payment";

function s(fd: FormData, k: string): string {
  return (fd.get(k) as string | null)?.trim() ?? "";
}

// Yolcu formunu işle → rezervasyon oluştur → ödemeye yönlendir.
export async function submitCheckout(fd: FormData) {
  const tourId = s(fd, "tourId");
  const bookingType = s(fd, "bookingType");
  const boardingPlaceId = s(fd, "boardingPlaceId") || undefined;
  const seatCodes = s(fd, "seatCodes")
    ? s(fd, "seatCodes").split(",").map((c) => c.trim()).filter(Boolean)
    : [];
  const quantity = Number(s(fd, "quantity")) || 0;

  const count = bookingType === "KOLTUK" ? seatCodes.length : quantity;

  const passengers: PassengerInput[] = [];
  for (let i = 0; i < count; i++) {
    const g = s(fd, `p_${i}_gender`);
    passengers.push({
      firstName: s(fd, `p_${i}_first`),
      lastName: s(fd, `p_${i}_last`),
      idNumber: s(fd, `p_${i}_id`),
      seatCode: bookingType === "KOLTUK" ? seatCodes[i] : undefined,
      gender: g === "K" ? "K" : g === "E" ? "E" : undefined,
    });
  }

  const result = await createPendingBooking({
    tourId,
    contactName: s(fd, "contactName"),
    contactPhone: s(fd, "contactPhone"),
    contactEmail: s(fd, "contactEmail"),
    passengers,
    seatCodes: bookingType === "KOLTUK" ? seatCodes : undefined,
    quantity: bookingType === "KONTENJAN" ? quantity : undefined,
    boardingPlaceId,
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
