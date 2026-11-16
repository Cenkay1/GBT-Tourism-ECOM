// Hesabım sayfaları için müşteri verisi sorguları.
import { prisma } from "@/lib/db";
import type { BookingRowData } from "@/components/account/BookingRow";
import { TRANSFER_CUTOFF_HOURS } from "@/lib/transfer";

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
      transfersOut: { select: { id: true, createdAt: true, ownershipMoved: true } },
      departure: { select: { departureDate: true, returnDate: true } },
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

  // Devir uygunluğu: aynı kurallar lib/transfer.ts'te. Burada yalnız liste
  // için hafif bir ön kontrol yapılıyor — asıl doğrulama devir anında.
  const now = Date.now();

  return rows.map((b) => {
    const departureDate = b.departure?.departureDate ?? b.tour.departureDate;
    const hoursLeft = (departureDate.getTime() - now) / 3600000;
    const paidInFull = b.totalAmount - b.paidAmount <= 0;
    const canTransfer =
      b.status === "ODENDI" && paidInFull && hoursLeft >= TRANSFER_CUTOFF_HOURS;
    const transferBlockReason = !canTransfer
      ? hoursLeft < TRANSFER_CUTOFF_HOURS
        ? `kalkışa ${TRANSFER_CUTOFF_HOURS} saatten az kaldı`
        : !paidInFull
        ? "açık bakiye var"
        : "rezervasyon durumu uygun değil"
      : undefined;

    return {
    id: b.id,
    status: b.status,
    canTransfer,
    transferBlockReason,
    // ownerSince sonrası devredilen yolcu sayısı (kısmi devir bilgisi).
    transferredCount: b.transfersOut.filter(
      (t) => !t.ownershipMoved && t.createdAt > (b.ownerSince ?? b.createdAt)
    ).length,
    totalAmount: b.totalAmount,
    paidAmount: b.paidAmount,
    balanceDueAt: b.balanceDueAt,
    balanceToken: b.balanceToken,
    quantity: b.quantity,
    createdAt: b.createdAt,
    loyaltyAwardedAt: b.loyaltyAwardedAt,
    // Kalkış tarihi rezervasyonun seferinden gelir (tur birden çok sefer içerebilir).
    tour: {
      ...b.tour,
      departureDate: b.departure?.departureDate ?? b.tour.departureDate,
    },
    seatCodes: b.passengers
      .map((p) => p.seatCode)
      .filter((c): c is string => Boolean(c)),
    };
  });
}

// Puan hareketleri (en yeni önce).
export async function getPointsLedger(userId: string) {
  return prisma.pointsLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
