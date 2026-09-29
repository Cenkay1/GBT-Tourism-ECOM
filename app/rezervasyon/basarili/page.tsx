import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/tours";
import { ShieldIcon } from "@/components/Icons";
import RateUsCard from "@/components/RateUsCard";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const { no } = await searchParams;
  if (!no) notFound();
  const booking = await prisma.booking.findUnique({
    where: { id: no },
    include: { tour: true, departure: true, passengers: true },
  });
  if (!booking) notFound();

  const seats = booking.passengers.map((p) => p.seatCode).filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <ShieldIcon width={32} height={32} />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-brand">
          Rezervasyonunuz Alındı
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Ödemeniz başarıyla tamamlandı. Bilet ve tur bilgileri{" "}
          <span className="font-medium text-slate-700">{booking.contactEmail}</span> adresine
          gönderilecektir.
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 p-5 text-left text-sm">
          <Row label="Rezervasyon No" value={booking.id.slice(-8).toUpperCase()} />
          <Row label="Tur" value={booking.tour.title} />
          {/* Tarih rezervasyonun seferinden okunur (tur birden çok sefer içerebilir). */}
          <Row
            label="Kalkış"
            value={formatDate(
              (booking.departure?.departureDate ?? booking.tour.departureDate).toISOString()
            )}
          />
          {booking.departure?.returnDate && (
            <Row label="Dönüş" value={formatDate(booking.departure.returnDate.toISOString())} />
          )}
          {booking.tour.bookingType === "KOLTUK" ? (
            <Row label="Koltuklar" value={seats || "—"} />
          ) : (
            <Row label="Kişi" value={`${booking.quantity} kişi`} />
          )}
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 font-extrabold text-brand">
            <span>Ödenen</span>
            <span className="text-accent">
              {formatPrice(booking.totalAmount, booking.tour.currency)}
            </span>
          </div>
        </div>

      </div>

      <RateUsCard />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
