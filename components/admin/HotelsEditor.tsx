"use client";

import { useState } from "react";
import { mapEmbedUrl } from "@/lib/shared";
import PlaceAutocomplete from "@/components/admin/PlaceAutocomplete";
import type { PlaceRow } from "@/components/admin/placeTypes";

// Konaklama (otel) editörü. Gezilecek yerlerden ve biniş noktalarından ayrıdır.
export default function HotelsEditor({
  value,
  onChange,
}: {
  value: PlaceRow[];
  onChange: (rows: PlaceRow[]) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const rows = value;
  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  const update = (i: number, patch: Partial<PlaceRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { type: "OTEL", name: "" }]);
  const remove = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i));
    setPreview(null);
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-400">
          Konaklama eklenmedi. Konaklamalı turlarda oteli buraya ekleyin.
        </p>
      )}

      {rows.map((row, i) => (
        <div key={i} className="rounded-xl border border-slate-100 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-md bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
              Konaklama {i + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Sil
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <PlaceAutocomplete
              value={row.name}
              onTextChange={(t) => update(i, { name: t })}
              onSelect={(sel) =>
                update(i, { name: sel.name, address: sel.address, mapQuery: sel.mapQuery })
              }
              placeholder="Otel adı — örn. Kapadokya Cave Otel"
              className="min-w-0 flex-1"
              inputClassName={input}
            />
            <input
              type="number"
              min={0}
              value={row.nights ?? ""}
              onChange={(e) => update(i, { nights: Number(e.target.value) || undefined })}
              placeholder="Gece"
              title="Bu otelde kaç gece konaklanacak"
              className={`${input} w-24`}
            />
            <button
              type="button"
              onClick={() => setPreview(preview === i ? null : i)}
              disabled={!row.name.trim()}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-brand transition hover:bg-slate-50 disabled:opacity-40"
            >
              {preview === i ? "Gizle" : "Haritada Gör"}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {row.mapQuery ? (
              <span className="font-semibold text-green-600">
                ✓ Konum seçildi{row.address ? ` — ${row.address}` : ""}
              </span>
            ) : (
              "Yazmaya başlayın, çıkan Google önerilerinden konumu seçin."
            )}
          </p>

          {preview === i && (row.mapQuery || row.name.trim()) && (
            <div className="mt-2 overflow-hidden rounded-xl ring-1 ring-black/5">
              <iframe
                key={row.mapQuery || row.name}
                title={row.name}
                src={mapEmbedUrl(row.mapQuery || row.name)}
                className="h-56 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
      >
        + Konaklama Ekle
      </button>
    </div>
  );
}
