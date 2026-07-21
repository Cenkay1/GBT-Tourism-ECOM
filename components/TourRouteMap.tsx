"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TourPlace, mapLinkUrl } from "@/lib/shared";
import { MapPinIcon, BusIcon } from "@/components/Icons";
import { loadGoogleLib, GOOGLE_MAPS_KEY } from "@/lib/googleMaps";

const BRAND = "#22306a";
const ACCENT = "#6a1f34";
const API_KEY = GOOGLE_MAPS_KEY;

type Point = {
  id: string;
  kind: "KALKIS" | "DURAK" | "OTEL";
  name: string;
  address?: string;
  nights?: number;
  query: string;
};

// --- Yedek geocoder (Directions API kapalıysa Nominatim ile konum bul) ---
async function geocode(query: string): Promise<google.maps.LatLngLiteral | null> {
  const cacheKey = `gbt:geo:${query}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    /* yoksay */
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { "Accept-Language": "tr" } },
    );
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    const geo = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    try {
      localStorage.setItem(cacheKey, JSON.stringify(geo));
    } catch {
      /* yoksay */
    }
    return geo;
  } catch {
    return null;
  }
}

// Numaralı, renkli SVG işaretçi ikonu (mapId gerektirmez).
function pinIcon(label: string, hotel: boolean, active: boolean): google.maps.Icon {
  const size = active ? 40 : 32;
  const bg = hotel ? ACCENT : BRAND;
  const fs = active ? 16 : 13;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><circle cx='${size / 2}' cy='${size / 2}' r='${size / 2 - 2}' fill='${bg}' stroke='white' stroke-width='2'/><text x='50%' y='50%' dy='.35em' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-size='${fs}' font-weight='700'>${label}</text></svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

// Akıcı (kademeli) yakınlaşma — Google Maps'te "flyTo" benzeri his.
function smoothZoom(map: google.maps.Map, target: number, current: number) {
  if (current >= target) return;
  const listener = google.maps.event.addListenerOnce(map, "zoom_changed", () => {
    smoothZoom(map, target, current + 1);
  });
  window.setTimeout(() => {
    void listener;
    map.setZoom(current + 1);
  }, 220);
}

export default function TourRouteMap({
  places,
  departure,
}: {
  places: TourPlace[];
  departure?: string;
}) {
  const points = useMemo<Point[]>(() => {
    const list: Point[] = [];
    if (departure) {
      list.push({ id: "kalkis", kind: "KALKIS", name: departure, query: departure });
    }
    for (const p of places) {
      list.push({
        id: p.id,
        kind: p.type,
        name: p.name,
        address: p.address,
        nights: p.nights,
        query: p.mapQuery || p.address || p.name,
      });
    }
    return list;
  }, [places, departure]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<(google.maps.Marker | null)[]>([]);
  const positionsRef = useRef<(google.maps.LatLngLiteral | null)[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);

  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (points.length === 0) return;
    if (!API_KEY) {
      setError("Google Maps API anahtarı eksik (.env → NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).");
      setLoading(false);
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    (async () => {
      let mapsLib: google.maps.MapsLibrary;
      let routesLib: google.maps.RoutesLibrary;
      try {
        mapsLib = (await loadGoogleLib("maps")) as google.maps.MapsLibrary;
        routesLib = (await loadGoogleLib("routes")) as google.maps.RoutesLibrary;
      } catch {
        if (!cancelled) {
          setError("Google Maps yüklenemedi. API anahtarını ve etkin API'leri kontrol edin.");
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;

      const map = new mapsLib.Map(container, {
        center: { lat: 39, lng: 35 },
        zoom: 5,
        gestureHandling: "cooperative", // sayfa scroll'unu ele geçirmez
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      mapRef.current = map;
      infoRef.current = new google.maps.InfoWindow();

      const addMarkers = (positions: (google.maps.LatLngLiteral | null)[]) => {
        positionsRef.current = positions;
        markersRef.current = points.map((p, i) => {
          const pos = positions[i];
          if (!pos) return null;
          const marker = new google.maps.Marker({
            position: pos,
            map,
            icon: pinIcon(String(i + 1), p.kind === "OTEL", i === 0),
            title: p.name,
            zIndex: i === 0 ? 1000 : 1,
          });
          marker.addListener("click", () => {
            setActive(i);
            infoRef.current?.setContent(
              `<strong style="color:#0f172a">${p.name}</strong>${p.address ? `<br/><span style="color:#64748b">${p.address}</span>` : ""}`,
            );
            infoRef.current?.open({ map, anchor: marker });
          });
          return marker;
        });
      };

      const runIntro = (positions: (google.maps.LatLngLiteral | null)[]) => {
        const valid = positions.filter(Boolean) as google.maps.LatLngLiteral[];
        if (!valid.length) return;
        // 1) Önce tüm rotayı uzaktan göster.
        const bounds = new google.maps.LatLngBounds();
        valid.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 60);
        // 2) Kısa bekleyiş, 3) sonra başlangıç noktasına uçup yakınlaş.
        window.setTimeout(() => {
          if (cancelled) return;
          map.panTo(valid[0]);
          smoothZoom(map, 11, map.getZoom() ?? 6);
          setActive(0);
        }, 1700);
      };

      // --- Önce Directions ile yol takip eden rota dene ---
      const ds = new routesLib.DirectionsService();
      const renderer = new routesLib.DirectionsRenderer({
        map,
        suppressMarkers: true, // kendi numaralı işaretçilerimizi koyacağız
        preserveViewport: true, // kamerayı biz yöneteceğiz
        polylineOptions: { strokeColor: BRAND, strokeWeight: 5, strokeOpacity: 0.85 },
      });

      const runFallback = async () => {
        // Directions olmadan: Nominatim ile konumla + düz (geodesic) çizgi.
        const positions: (google.maps.LatLngLiteral | null)[] = [];
        for (const p of points) {
          if (cancelled) return;
          positions.push(await geocode(p.query));
        }
        if (cancelled) return;
        const valid = positions.filter(Boolean) as google.maps.LatLngLiteral[];
        if (valid.length >= 2) {
          new google.maps.Polyline({
            path: valid,
            map,
            geodesic: true,
            strokeColor: BRAND,
            strokeOpacity: 0.85,
            strokeWeight: 4,
          });
        }
        addMarkers(positions);
        setLoading(false);
        runIntro(positions);
      };

      ds.route(
        {
          origin: points[0].query,
          destination: points[points.length - 1].query,
          waypoints: points.slice(1, -1).map((p) => ({ location: p.query, stopover: true })),
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (cancelled) return;
          if (status === "OK" && result) {
            renderer.setDirections(result);
            const legs = result.routes[0].legs;
            const positions: google.maps.LatLngLiteral[] = [
              legs[0].start_location.toJSON(),
              ...legs.map((l) => l.end_location.toJSON()),
            ];
            addMarkers(positions);
            setLoading(false);
            runIntro(positions);
          } else {
            // Directions API kapalı/erişilemez → yedek yola geç.
            void runFallback();
          }
        },
      );
    })();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m?.setMap(null));
      markersRef.current = [];
      mapRef.current = null;
      if (container) container.innerHTML = "";
    };
  }, [points]);

  // Aktif nokta değişince işaretçileri güncelle (aktif olan büyür).
  useEffect(() => {
    markersRef.current.forEach((m, i) => {
      if (!m) return;
      m.setIcon(pinIcon(String(i + 1), points[i].kind === "OTEL", i === active));
      m.setZIndex(i === active ? 1000 : 1);
    });
  }, [active, points]);

  if (points.length === 0) return null;

  const goTo = (i: number) => {
    setActive(i);
    const map = mapRef.current;
    const pos = positionsRef.current[i];
    const marker = markersRef.current[i];
    if (map && pos) {
      map.panTo(pos);
      smoothZoom(map, 14, map.getZoom() ?? 10);
      if (marker) {
        infoRef.current?.setContent(
          `<strong style="color:#0f172a">${points[i].name}</strong>${points[i].address ? `<br/><span style="color:#64748b">${points[i].address}</span>` : ""}`,
        );
        infoRef.current?.open({ map, anchor: marker });
      }
    }
  };

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
                onClick={() => goTo(i)}
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

      {/* Harita — `isolate` ile kendi stacking context'ine kapatılır ki
          içindeki katmanlar modal gibi üst öğelerin üzerine taşmasın. */}
      <div className="relative isolate overflow-hidden rounded-2xl ring-1 ring-black/5">
        <div
          ref={containerRef}
          className="h-72 w-full md:h-full md:min-h-[380px]"
          style={{ background: "#e5e7eb" }}
        />
        {loading && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand shadow">
              Rota çiziliyor…
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-6 text-center">
            <span className="text-sm font-medium text-accent">{error}</span>
          </div>
        )}
        <a
          href={mapLinkUrl(points[active].query)}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-3 right-3 z-10 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white shadow-lg hover:bg-brand-dark"
        >
          Haritada Aç
        </a>
      </div>
    </div>
  );
}
