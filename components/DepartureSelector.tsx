"use client";

import { Tour, TourDeparture, departureSeatsLeft } from "@/lib/shared";

// Sefer (kalkış tarihi) seçici. Bir turun birden çok seferi olabilir; müşteri
// satın alırken hangi seferi aldığını burada seçer. Tek sefer varsa gösterilmez.
//
// Kompakt bir ŞERİT olarak çizilir ve koltuk seçiminin hemen üstüne yapışır.
// Eskiden dikey bir kart listesiydi: mobilde ekranın tamamını doldurup koltuk
// şemasını katlama altına itiyordu ve müşteri "Koltuk Seç"e bastığında koltuk
// göremiyordu. Yatay şeritte hem seferler hem şema aynı anda görünür.
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

// Şerit için kısa etiket: "Pzt 13 Kas · 08:00"
function formatChip(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
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

  const active = departures.find((d) => d.id === value);

  return (
    <div className={`px-5 pb-3 ${className}`}>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Kalkış tarihi — {departures.length} sefer
      </p>

      {/* Yatay kaydırılabilir: çok seferli turda satır taşmasın, şerit
          yüksekliği sabit kalsın. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {departures.map((d) => {
          const isActive = value === d.id;
          const left =
            tour.bookingType === "KONTENJAN" ? departureSeatsLeft(tour, d) : null;
          const full = left !== null && left <= 0;
          return (
            <button
              key={d.id}
              type="button"
              disabled={full}
              aria-pressed={isActive}
              title={formatDeparture(d.departureDate)}
              onClick={() => onChange(d.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? "border-accent bg-accent text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-accent hover:text-accent"
              } ${full ? "cursor-not-allowed opacity-50 hover:border-slate-200 hover:text-slate-600" : ""}`}
            >
              {formatChip(d.departureDate)}
              {left !== null && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    isActive
                      ? "bg-white/20 text-white"
                      : full
                      ? "bg-slate-100 text-slate-400"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {full ? "Doldu" : `${left} yer`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Seçili seferin ayrıntısı: şeritte yer olmayan dönüş ve araç bilgisi
          kaybolmasın diye tek satırda altta. */}
      {active && (active.returnDate || active.bus) && (
        <p className="mt-1 text-[11px] text-slate-400">
          {active.returnDate && <>Dönüş: {formatShort(active.returnDate)}</>}
          {active.returnDate && active.bus && " · "}
          {active.bus && <>Araç: {active.bus.plate}</>}
        </p>
      )}
    </div>
  );
}
