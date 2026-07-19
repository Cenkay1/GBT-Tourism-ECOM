"use client";

import { useState } from "react";
import { TourPlace, mapEmbedUrl, mapLinkUrl } from "@/lib/shared";
import { MapPinIcon, BusIcon } from "@/components/Icons";

type Point = {
  id: string;
  kind: "KALKIS" | "DURAK" | "OTEL";
  name: string;
  address?: string;
  nights?: number;
  query: string;
};

export default function TourRouteMap({
  places,
  departure,
}: {
  places: TourPlace[];
  departure?: string;
}) {
  const points: Point[] = [];
  if (departure) {
    points.push({ id: "kalkis", kind: "KALKIS", name: departure, query: departure });
  }
  for (const p of places) {
    points.push({
      id: p.id,
      kind: p.type,
      name: p.name,
      address: p.address,
      nights: p.nights,
      query: p.mapQuery || p.address || p.name,
    });
  }

  const [active, setActive] = useState(0);
  if (points.length === 0) return null;

  const current = points[active];
  const query = current.query;

  let durakNo = 0;

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* Kalkış / durak / otel listesi */}
      <ol className="space-y-2">
        {points.map((p, i) => {
          const kindLabel =
            p.kind === "KALKIS"
              ? "Kalkış Yeri"
              : p.kind === "OTEL"
                ? "Konaklama" + (p.nights ? ` · ${p.nights} gece` : "")
                : `Durak ${++durakNo}`;
          return (
            <li key={p.id || i}>
              <button
                onClick={() => setActive(i)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                  i === active
                    ? "border-brand bg-brand/5"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${
                    p.kind === "OTEL" ? "bg-accent" : "bg-brand"
                  }`}
                >
                  {p.kind === "OTEL" ? (
                    <MapPinIcon width={15} height={15} />
                  ) : (
                    <BusIcon width={15} height={15} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {kindLabel}
                  </span>
                  <span className="block text-sm font-semibold text-slate-800">{p.name}</span>
                  {p.address && (
                    <span className="block text-xs text-slate-500">{p.address}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Harita */}
      <div className="overflow-hidden rounded-2xl ring-1 ring-black/5">
        <iframe
          key={query}
          title={current.name}
          src={mapEmbedUrl(query)}
          className="h-72 w-full md:h-full md:min-h-[320px]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="flex items-center justify-between bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{current.name}</p>
            {current.address && (
              <p className="truncate text-xs text-slate-500">{current.address}</p>
            )}
          </div>
          <a
            href={mapLinkUrl(query)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            Haritada Aç
          </a>
        </div>
      </div>
    </div>
  );
}
