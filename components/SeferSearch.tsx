"use client";

import { useMemo, useState } from "react";
import { Tour, orderedStops } from "@/lib/shared";
import SeferCard from "@/components/SeferCard";
import { SearchIcon } from "@/components/Icons";

export default function SeferSearch({ seferler }: { seferler: Tour[] }) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // Tüm seferlerdeki durak adlarının birleşimi (nereden seçenekleri).
  const fromOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of seferler) {
      const stops = orderedStops(s.places ?? []);
      // Son durak biniş noktası olamaz.
      stops.slice(0, Math.max(0, stops.length - 1)).forEach((st) => set.add(st.name));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [seferler]);

  // Nereye: seçilen nereden'den sonra en az bir seferde gelen duraklar.
  const toOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of seferler) {
      const names = orderedStops(s.places ?? []).map((st) => st.name);
      const i = from ? names.indexOf(from) : 0;
      const startAfter = from ? i + 1 : 1;
      if (from && i < 0) continue;
      names.slice(startAfter).forEach((n) => set.add(n));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [seferler, from]);

  // Filtre: from/to varsa rota yönünde (i<j) içeren seferler.
  const results = useMemo(() => {
    return seferler
      .map((s) => {
        const stops = orderedStops(s.places ?? []);
        const names = stops.map((st) => st.name);
        const i = from ? names.indexOf(from) : -1;
        const j = to ? names.indexOf(to) : -1;
        if (from && to) {
          if (i < 0 || j < 0 || i >= j) return null;
        } else if (from) {
          if (i < 0) return null;
        } else if (to) {
          if (j < 0) return null;
        }
        return {
          sefer: s,
          fromId: i >= 0 ? stops[i].id : null,
          toId: j >= 0 ? stops[j].id : null,
        };
      })
      .filter(
        (x): x is { sefer: Tour; fromId: string | null; toId: string | null } => x !== null
      );
  }, [seferler, from, to]);

  const select =
    "w-full rounded-xl border border-transparent bg-slate-50 px-4 py-3.5 text-base text-slate-800 outline-none transition focus:border-brand focus:bg-white";

  return (
    <div className="rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5">
      {/* Row 1 — tur adı / destinasyon (turlar) */}
      <form action="/turlar" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <SearchIcon width={20} height={20} />
          </span>
          <input
            name="q"
            placeholder="Tur adı veya destinasyon ara (örn. Kapadokya, Balkan)"
            className="w-full rounded-xl border border-transparent bg-slate-50 py-3.5 pl-12 pr-4 text-base text-slate-800 outline-none transition focus:border-brand focus:bg-white"
          />
        </div>
        <button className="flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-8 py-3.5 text-base font-semibold text-white transition hover:bg-accent-dark">
          <SearchIcon width={18} height={18} />
          Tur Ara
        </button>
      </form>

      {/* Row 2 — nereden / nereye (seferler) */}
      {seferler.length > 0 && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <label className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                Nereden
              </span>
              <select
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setTo("");
                }}
                className={`${select} pl-24`}
              >
                <option value="">Tümü</option>
                {fromOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                Nereye
              </span>
              <select
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={`${select} pl-20`}
              >
                <option value="">Tümü</option>
                {toOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {(from || to) && (
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                Temizle
              </button>
            )}
          </div>

          {/* Sonuçlar — yatay sefer kartları */}
          <div className="mt-4 grid gap-3">
            {results.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                Seçtiğiniz güzergâhta sefer bulunamadı.
              </p>
            ) : (
              results.map(({ sefer, fromId, toId }) => (
                <SeferCard key={sefer.id} sefer={sefer} fromId={fromId} toId={toId} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
