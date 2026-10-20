"use client";

import { Tour, TourDeparture, departureSeatsLeft } from "@/lib/shared";

// Sefer (kalkış tarihi) seçici. Bir turun birden çok seferi olabilir; müşteri
// satın alırken hangi seferi aldığını burada seçer. Tek sefer varsa gösterilmez.
export function formatDeparture(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShort(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DepartureSelector({
  tour,
  departures,
  value,
  onChange,
  className = "",
}: {
  tour: Tour;
  departures: TourDeparture[];
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
}) {
  if (departures.length < 2) return null;

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${className}`}>
      <h3 className="font-bold text-brand">Hangi seferi almak istiyorsunuz?</h3>
      <p className="mt-0.5 text-xs text-slate-400">
        Bu turun birden çok kalkış tarihi var. Her seferin koltuk düzeni ayrıdır.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {departures.map((d) => {
          const active = value === d.id;
          const left =
            tour.bookingType === "KONTENJAN" ? departureSeatsLeft(tour, d) : null;
          const full = left !== null && left <= 0;
          return (
            <button
              key={d.id}
              type="button"
              disabled={full}
              onClick={() => onChange(d.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? "border-accent bg-accent/10"
                  : "border-slate-200 hover:bg-slate-50"
              } ${full ? "cursor-not-allowed opacity-50 hover:bg-transparent" : ""}`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active ? "border-accent" : "border-slate-300"
                  }`}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-700">
                    {formatDeparture(d.departureDate)}
                  </span>
                  {d.returnDate && (
                    <span className="block text-xs text-slate-400">
                      Dönüş: {formatShort(d.returnDate)}
                    </span>
                  )}
                  {d.bus && (
                    <span className="block text-xs text-slate-400">
                      Araç: {d.bus.plate}
                    </span>
                  )}
                </span>
              </span>
              {left !== null && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    full ? "bg-slate-100 text-slate-400" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {full ? "Doldu" : `${left} yer`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
