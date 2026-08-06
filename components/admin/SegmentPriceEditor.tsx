"use client";

import type { PlaceRow } from "@/components/admin/PlacesEditor";
import type { SegmentPrice } from "@/lib/shared";

// Sefer için nereden→nereye fiyat matrisi. from/to = DURAK'ların (dizideki) 0-tabanlı indeksi.
export default function SegmentPriceEditor({
  name,
  places,
  value,
  onChange,
}: {
  name: string;
  places: PlaceRow[];
  value: SegmentPrice[];
  onChange: (v: SegmentPrice[]) => void;
}) {
  // Yalnız DURAK'lar, dizi sırası = sortOrder (kayıtta böyle yazılır).
  const stops = places
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.type === "DURAK");

  function priceFor(from: number, to: number): number | "" {
    const seg = value.find((s) => s.from === from && s.to === to);
    return seg ? seg.price : "";
  }

  function setPrice(from: number, to: number, raw: string) {
    const price = Number(raw);
    const rest = value.filter((s) => !(s.from === from && s.to === to));
    if (raw.trim() === "" || !Number.isFinite(price) || price < 0) {
      onChange(rest);
    } else {
      onChange([...rest, { from, to, price: Math.round(price) }]);
    }
  }

  const input =
    "w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      {stops.length < 2 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-400">
          Segment fiyatı girmek için en az 2 durak ekleyin (yukarıdaki Rota bölümünden).
        </p>
      ) : (
        <div className="space-y-2">
          <p className="mb-2 text-xs text-slate-400">
            Her biniş→iniş çifti için kişi başı fiyat girin. Boş bırakılan segment, tur taban
            fiyatını kullanır.
          </p>
          {stops.map((from, i) =>
            stops.slice(i + 1).map((to) => (
              <div
                key={`${from.idx}-${to.idx}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
              >
                <span className="text-sm font-medium text-slate-700">
                  {from.name || `Durak ${from.idx + 1}`} → {to.name || `Durak ${to.idx + 1}`}
                </span>
                <input
                  type="number"
                  min={0}
                  value={priceFor(from.idx, to.idx)}
                  onChange={(e) => setPrice(from.idx, to.idx, e.target.value)}
                  placeholder="Fiyat ₺"
                  className={input}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
