import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatPrice, formatDate, formatDateTime } from "@/lib/tours";
import { genderLabel } from "@/lib/shared";
import { COMPANY } from "@/lib/company";
import { ShieldIcon } from "@/components/Icons";
import RateUsCard from "@/components/RateUsCard";
import PrintButton from "@/components/PrintButton";

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
    include: {
      tour: { include: { bus: true } },
      departure: { include: { bus: true } },
      boardingPlace: { select: { name: true, boardingTime: true } },
      passengers: true,
    },
  });
  if (!booking) notFound();

  const seats = booking.passengers.map((p) => p.seatCode).filter(Boolean).join(", ");
  const ref = booking.id.slice(-8).toUpperCase();
  const isSeat = booking.tour.bookingType === "KOLTUK";
  const departureIso = (
    booking.departure?.departureDate ?? booking.tour.departureDate
  ).toISOString();
  // Araç sefere göre değişebilir: seferin otobüsü, yoksa turun otobüsü.
  const plate = (booking.departure?.bus ?? booking.tour.bus)?.plate ?? null;
  const boarding = booking.boardingPlace
    ? `${booking.boardingPlace.name}${
        booking.boardingPlace.boardingTime ? ` · ${booking.boardingPlace.boardingTime}` : ""
      }`
    : booking.boardingName;

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      {/* print-area: yazdırırken sayfadan YALNIZ bu bölüm basılır
          (bkz. globals.css @media print). Müşteri "PDF olarak kaydet" diyerek
          rezervasyon bilgilerini indirebilsin diye. */}
      <div className="print-area rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 print-hidden">
          <ShieldIcon width={32} height={32} />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-brand">
          Rezervasyonunuz Alındı
        </h1>
        {/* Yazdırılan belgede firma adı ve rez. no üstte dursun. */}
        <p className="mt-1 hidden text-xs text-slate-500 print:block">
          {COMPANY.name} · Rezervasyon No {ref}
        </p>
        <p className="mt-2 text-sm text-slate-500 print-hidden">
          Ödemeniz başarıyla tamamlandı. Bilet ve tur bilgileri{" "}
          <span className="font-medium text-slate-700">{booking.contactEmail}</span> adresine
          gönderilecektir.
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 p-5 text-left text-sm">
          <Row label="Rezervasyon No" value={ref} />
          <Row label="Tur" value={booking.tour.title} />
          {/* Tarih rezervasyonun seferinden okunur (tur birden çok sefer içerebilir). */}
          <Row label="Kalkış" value={formatDateTime(departureIso)} />
          {booking.departure?.returnDate && (
            <Row label="Dönüş" value={formatDate(booking.departure.returnDate.toISOString())} />
          )}
          {boarding && <Row label="Biniş" value={boarding} />}
          {plate && <Row label="Araç" value={plate} />}
          {isSeat ? (
            <Row label="Koltuklar" value={seats || "—"} />
          ) : (
            <Row label="Kişi" value={`${booking.quantity} kişi`} />
          )}
          <Row label="İletişim" value={`${booking.contactName} · ${booking.contactPhone}`} />
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 font-extrabold text-brand">
            <span>Ödenen</span>
            <span className="text-accent">
              {formatPrice(booking.totalAmount, booking.tour.currency)}
            </span>
          </div>
        </div>

        {/* Yolcu listesi — e-postayı beklemeden elinde olsun. */}
        <div className="mt-4 rounded-xl border border-slate-200 p-5 text-left text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Yolcular ({booking.passengers.length})
          </p>
          <ul className="space-y-1.5">
            {booking.passengers.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-slate-700">
                  {i + 1}. {p.firstName} {p.lastName}
                  {p.gender && (
                    <span className="text-slate-400"> · {genderLabel(p.gender)}</span>
                  )}
                </span>
                {p.seatCode && (
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {p.seatCode}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 print-hidden">
          <PrintButton className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-white transition hover:opacity-90">
            Bilgileri İndir (PDF)
          </PrintButton>
          <p className="mt-2 text-[11px] text-slate-400">
            Açılan pencereden &quot;PDF olarak kaydet&quot; seçeneğiyle indirebilir ya da
            yazdırabilirsiniz.
          </p>
        </div>
      </div>

      <div className="print-hidden">
        <RateUsCard />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}
