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
    .filter((p) => p.type === "DURAK")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (stops.length === 0) return null;

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${className}`}>
      <h3 className="font-bold text-brand">Nereden bineceksiniz?</h3>
      <p className="mt-0.5 text-xs text-slate-400">
        Biniş noktanıza göre kişi başı fiyat değişebilir.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {stops.map((s) => {
          const active = value === s.id;
          const price = s.price ?? basePrice;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                active
                  ? "border-accent bg-accent/10"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    active ? "border-accent" : "border-slate-300"
                  }`}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <span className="text-sm font-medium text-slate-700">{s.name}</span>
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
