"use client";

import { useState } from "react";

export interface TourOption {
  slug: string;
  title: string;
}

// Hazır sayfa bağlantıları (elle URL yazmadan seçilebilsin).
const PRESETS: { label: string; value: string }[] = [
  { label: "Tüm Turlar", value: "/turlar" },
  { label: "Yurt İçi Turlar", value: "/turlar?kategori=YURT_ICI" },
  { label: "Yurt Dışı Turlar", value: "/turlar?kategori=YURT_DISI" },
];

export default function BannerLinkPicker({
  name,
  tours,
  defaultValue = "",
  label = "Tıklanınca gidilecek",
}: {
  name: string;
  tours: TourOption[];
  defaultValue?: string;
  label?: string;
}) {
  const tourValue = (slug: string) => `/turlar/${slug}`;

  // Başlangıçta gelen değer bir tura mı, presete mi, yoksa özel mi ait belirle.
  const matchedTour = tours.find((t) => tourValue(t.slug) === defaultValue);
  const matchedPreset = PRESETS.find((p) => p.value === defaultValue);
  const initialMode: "tour" | "preset" | "custom" | "none" = !defaultValue
    ? "none"
    : matchedTour
      ? "tour"
      : matchedPreset
        ? "preset"
        : "custom";

  const [mode, setMode] = useState<"tour" | "preset" | "custom" | "none">(initialMode);
  const [value, setValue] = useState(defaultValue);

  const select =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const labelCls = "block text-sm font-medium text-slate-600";

  return (
    <div>
      <span className={labelCls}>{label}</span>
      <input type="hidden" name={name} value={mode === "none" ? "" : value} />

      {/* Bağlantı türü seçimi */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {[
          { k: "tour", t: "Bir Tur" },
          { k: "preset", t: "Tur Listesi" },
          { k: "custom", t: "Özel Bağlantı" },
          { k: "none", t: "Bağlantı Yok" },
        ].map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => {
              const m = o.k as typeof mode;
              setMode(m);
              if (m === "tour") setValue(tours[0] ? tourValue(tours[0].slug) : "");
              else if (m === "preset") setValue(PRESETS[0].value);
              else if (m === "none") setValue("");
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mode === o.k ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {o.t}
          </button>
        ))}
      </div>

      {mode === "tour" && (
        <select
          className={select}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          {tours.length === 0 ? (
            <option value="">Önce tur ekleyin</option>
          ) : (
            tours.map((t) => (
              <option key={t.slug} value={tourValue(t.slug)}>
                {t.title}
              </option>
            ))
          )}
        </select>
      )}

      {mode === "preset" && (
        <select
          className={select}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      )}

      {mode === "custom" && (
        <input
          className={select}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://... veya /turlar/ornek-tur"
        />
      )}

      {mode === "none" && (
        <p className="mt-1.5 text-xs text-slate-400">Afişe tıklanınca hiçbir yere gitmez.</p>
      )}
    </div>
  );
}
