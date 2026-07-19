"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { markBookingPaid, cancelBooking } from "@/lib/booking";

// Simülasyon: "ödeme başarılı" — gerçek iyzico bağlanınca callback bu işi yapacak.
export async function simulateSuccess(bookingId: string) {
  const res = await markBookingPaid(bookingId, `SIM-${Date.now()}`);
  if (!res.ok) {
    redirect(`/odeme/${bookingId}?hata=${encodeURIComponent(res.error ?? "Ödeme tamamlanamadı.")}`);
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
