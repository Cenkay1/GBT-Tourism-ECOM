// Hesabım sayfaları için müşteri verisi sorguları.
import { prisma } from "@/lib/db";
import type { BookingRowData } from "@/components/account/BookingRow";

// Bir kullanıcının rezervasyonları (en yeni önce). limit verilirse o kadarını döndürür.
export async function getUserBookings(
  userId: string,
  limit?: number
): Promise<BookingRowData[]> {
  const rows = await prisma.booking.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      passengers: { select: { seatCode: true } },
      tour: {
        select: {
          slug: true,
          title: true,
          destination: true,
          departureDate: true,
          currency: true,
          bookingType: true,
        },
      },
    },
  });

  return rows.map((b) => ({
    id: b.id,
    status: b.status,
    totalAmount: b.totalAmount,
    quantity: b.quantity,
    createdAt: b.createdAt,
    loyaltyAwardedAt: b.loyaltyAwardedAt,
    tour: b.tour,
    seatCodes: b.passengers
      .map((p) => p.seatCode)
      .filter((c): c is string => Boolean(c)),
  }));
}

// Puan hareketleri (en yeni önce).
export async function getPointsLedger(userId: string) {
  return prisma.pointsLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
