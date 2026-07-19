"use client";

import { useState } from "react";
import { mapEmbedUrl } from "@/lib/shared";

export interface PlaceRow {
  type: "DURAK" | "OTEL";
  name: string;
  address?: string;
  mapQuery?: string;
  nights?: number;
}

export default function PlacesEditor({
  name,
  initial,
}: {
  name: string;
  initial?: PlaceRow[];
}) {
  const [places, setPlaces] = useState<PlaceRow[]>(initial ?? []);
  const [preview, setPreview] = useState<number | null>(null);

  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  function add(type: "DURAK" | "OTEL") {
    setPlaces((p) => [...p, { type, name: "" }]);
  }
  function update(i: number, patch: Partial<PlaceRow>) {
    setPlaces((p) => p.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function remove(i: number) {
    setPlaces((p) => p.filter((_, idx) => idx !== i));
    setPreview(null);
  }
  function move(i: number, dir: -1 | 1) {
    setPlaces((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setPreview(null);
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(places)} />

      <div className="space-y-3">
        {places.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-400">
            Henüz durak veya konaklama eklenmedi. Aşağıdan ekleyebilirsiniz.
          </p>
        )}

        {places.map((row, i) => (
          <div key={i} className="rounded-xl border border-slate-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  row.type === "OTEL" ? "bg-accent/10 text-accent" : "bg-brand/10 text-brand"
                }`}
              >
                {row.type === "OTEL" ? "Konaklama (Otel)" : `Durak ${i + 1}`}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100" aria-label="Yukarı">↑</button>
                <button type="button" onClick={() => move(i, 1)} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100" aria-label="Aşağı">↓</button>
                <button type="button" onClick={() => remove(i)} className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Sil</button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder={
                  row.type === "OTEL"
                    ? "Otel adı — örn. Kapadokya Cave Otel, Göreme"
                    : "Durak adı — örn. Dudullu Terminal, İstanbul"
                }
                className={`${input} flex-1`}
              />
              {row.type === "OTEL" && (
                <input
                  type="number"
                  min={0}
                  value={row.nights ?? ""}
                  onChange={(e) => update(i, { nights: Number(e.target.value) || undefined })}
                  placeholder="Gece"
                  className={`${input} w-24`}
                />
              )}
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
              Yazdığınız isim haritada aranır. Doğru yeri görmek için “Haritada Gör”e tıklayın; gerekirse
              şehir/ilçe ekleyin (örn. “Dudullu Terminal, Ümraniye”).
            </p>

            {preview === i && row.name.trim() && (
              <div className="mt-2 overflow-hidden rounded-xl ring-1 ring-black/5">
                <iframe
                  key={row.name}
                  title={row.name}
                  src={mapEmbedUrl(row.name)}
                  className="h-56 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => add("DURAK")}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Durak Ekle
        </button>
        <button
          type="button"
          onClick={() => add("OTEL")}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          + Konaklama Ekle
        </button>
      </div>
    </div>
  );
}
