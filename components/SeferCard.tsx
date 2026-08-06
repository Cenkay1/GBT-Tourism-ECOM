import Link from "next/link";
import { Tour, formatPrice, formatDate, orderedStops } from "@/lib/shared";
import BookingLauncher from "@/components/BookingLauncher";

export default function SeferCard({
  sefer,
  fromId = null,
  toId = null,
}: {
  sefer: Tour;
  fromId?: string | null;
  toId?: string | null;
}) {
  const stops = orderedStops(sefer.places ?? []);
  const from = fromId ? stops.find((s) => s.id === fromId) : stops[0];
  const to = toId ? stops.find((s) => s.id === toId) : stops[stops.length - 1];
  const routeLabel = from && to ? `${from.name} → ${to.name}` : sefer.destination;

  const seats = sefer.availableSeats;
  const showSeatBadge = typeof seats === "number" && seats > 0 && seats <= 5;

  const cover = sefer.coverImage || (sefer.images?.[0] ?? "/logo.png");

  return (
    <div className="flex overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      {/* Görsel — 4:5 Instagram formatı */}
      <Link href={`/turlar/${sefer.slug}`} className="relative w-28 shrink-0 sm:w-40">
        <div className="aspect-[4/5] h-full w-full overflow-hidden bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt={sefer.title} className="h-full w-full object-cover" />
        </div>
        {showSeatBadge && (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            Son {seats} koltuk
          </span>
        )}
      </Link>

      {/* Bilgi */}
      <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
        <div className="min-w-0">
          <Link href={`/turlar/${sefer.slug}`} className="hover:underline">
            <h3 className="truncate font-bold text-brand">{sefer.title}</h3>
          </Link>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-600">{routeLabel}</p>
          <p className="mt-1 text-xs text-slate-400">Kalkış: {formatDate(sefer.departureDate)}</p>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <span className="text-[11px] text-slate-400">Kişi başı</span>
            <p className="text-lg font-extrabold text-accent">
              {formatPrice(sefer.price, sefer.currency)}
            </p>
          </div>
          <BookingLauncher
            tour={sefer}
            label="Satın Al"
            initialFrom={fromId}
            initialTo={toId}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark"
          />
        </div>
      </div>
    </div>
  );
}
