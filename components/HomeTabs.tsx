"use client";

// Ana sayfa sekmeleri: Yurt İçi · Yurt Dışı · Tatil & Otel.
//
// Sekme içerikleri sunucuda hazırlanıp children olarak geçer (tur kartları
// sunucu bileşeni); burada yalnız hangisinin görüneceği tutulur. Seçilmeyen
// sekme DOM'da kalır ama gizlenir: sekme değiştirmek ağ isteği gerektirmesin
// ve geri dönüşte kaydırma konumu bozulmasın.

import { useState } from "react";

export type HomeTabKey = "YURT_ICI" | "YURT_DISI" | "TATIL_OTEL";

const TABS: { key: HomeTabKey; label: string; hint: string }[] = [
  { key: "YURT_ICI", label: "Yurt İçi", hint: "Türkiye'nin en güzel rotaları" },
  { key: "YURT_DISI", label: "Yurt Dışı", hint: "Vizeli ve vizesiz yurt dışı rotaları" },
  { key: "TATIL_OTEL", label: "Tatil & Otel", hint: "Size özel tatil ve otel planlaması" },
];

export default function HomeTabs({
  yurtIci,
  yurtDisi,
  tatilOtel,
  initial = "YURT_ICI",
}: {
  yurtIci: React.ReactNode;
  yurtDisi: React.ReactNode;
  tatilOtel: React.ReactNode;
  initial?: HomeTabKey;
}) {
  const [active, setActive] = useState<HomeTabKey>(initial);
  const activeTab = TABS.find((t) => t.key === active)!;

  const panels: Record<HomeTabKey, React.ReactNode> = {
    YURT_ICI: yurtIci,
    YURT_DISI: yurtDisi,
    TATIL_OTEL: tatilOtel,
  };

  return (
    <section className="mt-14">
      {/* Sekme şeridi — mobilde yatay kaydırılır */}
      <div
        role="tablist"
        aria-label="Tur kategorileri"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {TABS.map((t) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`home-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`home-panel-${t.key}`}
              onClick={() => setActive(t.key)}
              className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition ${
                selected
                  ? "bg-brand text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-slate-500">{activeTab.hint}</p>

      <div className="mt-5">
        {TABS.map((t) => (
          <div
            key={t.key}
            role="tabpanel"
            id={`home-panel-${t.key}`}
            aria-labelledby={`home-tab-${t.key}`}
            hidden={t.key !== active}
          >
            {panels[t.key]}
          </div>
        ))}
      </div>
    </section>
  );
}
