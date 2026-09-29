"use client";

import { TourPlace, formatPrice } from "@/lib/shared";

// Biniş (kalkış durağı) seçici. Durağa göre kişi başı fiyat değişebilir.
// DURAK tipi yer yoksa hiçbir şey göstermez (null döner).
export default function BoardingSelector({
  places,
  value,
  onChange,
  basePrice,
  currency,
  className = "",
}: {
  places: TourPlace[];
  value: string | null;
  onChange: (id: string) => void;
  basePrice: number;
  currency: string;
  className?: string;
}) {
  const stops = places
    .filter((p) => p.type === "BINIS")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (stops.length === 0) return null;

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${className}`}>
      <h3 className="font-bold text-brand">Nereden bineceksiniz?</h3>
      <p className="mt-0.5 text-xs text-slate-400">
        Biniş noktanızı seçin — fiyat biniş noktasına göre değişebilir. Saat, otobüsün
        o noktada olacağı zamandır.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {stops.map((s) => {
          const active = value === s.id;
          const price = s.price ?? basePrice;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? "border-accent bg-accent/10"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active ? "border-accent" : "border-slate-300"
                  }`}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-700">{s.name}</span>
                  {s.boardingTime && (
                    <span className="block text-xs text-slate-500">
                      Otobüs burada: <strong>{s.boardingTime}</strong>
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold text-accent">
                {formatPrice(price, currency)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
