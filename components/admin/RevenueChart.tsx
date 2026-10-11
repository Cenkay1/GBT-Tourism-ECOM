"use client";

import { useState } from "react";
import type { RevenuePoint } from "@/lib/revenue";

const W = 720;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 30, left: 60 };

// Eksen için "güzel" üst sınır ve 4 aralık: 0 – 250 – 500 – 750 – 1000 gibi.
function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * pow;
  return { top: step * 4, step };
}

const dec = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
// Eksen etiketi: 1.500 → "1,5 bin", 2.000.000 → "2 Mn" ("B" harfi kafa karıştırıyordu).
function axisLabel(v: number): string {
  if (v >= 1_000_000) return `${dec.format(v / 1_000_000)} Mn`;
  if (v >= 1_000) return `${dec.format(v / 1_000)} bin`;
  return dec.format(v);
}
const full = new Intl.NumberFormat("tr-TR");

// Seçili aralığın cirosu: çubuk grafik. Üzerine gelince (ya da dokununca) o günün/ayın
// cirosu ve satış sayısı görünür. Bağımlılık yok, saf SVG.
export default function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(0, ...points.map((p) => p.value));
  const { top, step } = niceScale(max);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(points.length, 1);
  const barW = Math.min(Math.max(slot * 0.62, 2), 56);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  // Etiketler sığacak kadar seyreltilir (en çok ~9 etiket).
  const labelEvery = Math.max(1, Math.ceil(points.length / 9));
  const empty = max === 0;
  const shown = active != null ? points[active] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Ciro grafiği"
        onMouseLeave={() => setActive(null)}
      >
        {/* Yatay kılavuz çizgileri + değer etiketleri */}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = step * i;
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="#e2e8f0"
                strokeDasharray={i === 0 ? undefined : "3 4"}
              />
              <text x={PAD.left - 8} y={y(v) + 3} textAnchor="end" fontSize="11" fill="#94a3b8">
                {empty ? "" : axisLabel(v)}
              </text>
            </g>
          );
        })}

        {points.map((p, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const h = Math.max(0, innerH - (y(p.value) - PAD.top));
          const on = active === i;
          return (
            <g key={p.key}>
              {/* Geniş, görünmez dokunma alanı */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={innerH + PAD.bottom}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(on ? null : i)}
              />
              {p.value > 0 && (
                <rect
                  x={cx - barW / 2}
                  y={y(p.value)}
                  width={barW}
                  height={h}
                  rx={Math.min(4, barW / 2)}
                  fill={on ? "var(--accent)" : "var(--brand)"}
                  opacity={active != null && !on ? 0.45 : 1}
                  pointerEvents="none"
                />
              )}
              {p.value === 0 && (
                <rect
                  x={cx - barW / 2}
                  y={y(0) - 2}
                  width={barW}
                  height={2}
                  rx={1}
                  fill="#cbd5e1"
                  pointerEvents="none"
                />
              )}
              {i % labelEvery === 0 && (
                <text
                  x={cx}
                  y={H - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fill={on ? "var(--accent)" : "#94a3b8"}
                  fontWeight={on ? 700 : 400}
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-8">
          <p className="rounded-lg bg-white/90 px-3 py-2 text-sm text-slate-400">
            Bu aralıkta ödenmiş satış yok.
          </p>
        </div>
      )}

      {/* İpucu: grafiğin üstünde, seçili çubuğun bilgisi */}
      <div className="mt-1 min-h-[2.5rem] text-center text-xs text-slate-500" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-slate-700">{shown.title}</span>
            {" · "}
            <span className="font-bold text-accent">{full.format(shown.value)} ₺</span>
            {" · "}
            {shown.count} satış
          </>
        ) : (
          "Ayrıntı için çubukların üzerine gelin."
        )}
      </div>
    </div>
  );
}
