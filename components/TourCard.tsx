import Link from "next/link";
import { Tour, formatPrice, formatDate, categoryLabel } from "@/lib/shared";
import { CalendarIcon, ClockIcon, MapPinIcon } from "@/components/Icons";

export default function TourCard({ tour }: { tour: Tour }) {
  const seatsLeft =
    tour.bookingType === "KONTENJAN" && tour.capacity != null
      ? tour.capacity - (tour.sold ?? 0)
      : null;

  return (
    <Link
      href={`/turlar/${tour.slug}`}
      className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tour.coverImage}
          alt={tour.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 rounded-full bg-brand/90 px-3 py-1 text-xs font-semibold text-white">
          {categoryLabel(tour.category)}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-brand">
          {tour.bookingType === "KOLTUK" ? "Koltuk Seçimli" : "Kontenjanlı"}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-bold text-brand">{tour.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{tour.destination}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <CalendarIcon width={14} height={14} className="text-slate-400" />
            {formatDate(tour.departureDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <ClockIcon width={14} height={14} className="text-slate-400" />
            {tour.durationDays} gün
          </span>
          <span className="flex items-center gap-1.5">
            <MapPinIcon width={14} height={14} className="text-slate-400" />
            {tour.departureLocation}
          </span>
        </div>
        {seatsLeft != null && seatsLeft <= 10 && (
          <p className="mt-2 text-xs font-semibold text-accent">
            Son {seatsLeft} kontenjan!
          </p>
        )}
        <div className="mt-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400">Kişi başı</span>
            <p className="text-xl font-extrabold text-accent">
              {formatPrice(tour.price, tour.currency)}
            </p>
          </div>
          <span className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-brand-dark">
            İncele
          </span>
        </div>
      </div>
    </Link>
  );
}
