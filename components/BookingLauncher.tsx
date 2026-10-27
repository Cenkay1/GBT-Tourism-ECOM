"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Tour, TourDeparture } from "@/lib/shared";
import SeatMap from "@/components/SeatMap";
import CapacityBooking from "@/components/CapacityBooking";
import DepartureSelector from "@/components/DepartureSelector";

export default function BookingLauncher({
  tour,
  className,
  label,
}: {
  tour: Tour;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isSeat = tour.bookingType === "KOLTUK";
  const btnLabel = label ?? (isSeat ? "Koltuk Seç" : "Rezervasyon Yap");

  // Yalnız satışa açık seferler müşteriye gösterilir.
  const departures: TourDeparture[] = (tour.departures ?? []).filter(
    (d) => d.status === "AKTIF"
  );
  const [departureId, setDepartureId] = useState<string | null>(
    departures[0]?.id ?? null
  );
  const departure = departures.find((d) => d.id === departureId) ?? departures[0];

  // Portal yalnızca istemcide (mount sonrası) kullanılabilir.
  useEffect(() => setMounted(true), []);

  // Modal açıkken arka planı kilitle
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Modalı body'ye taşırız; aksi halde sticky/transform'lu ata öğelerin
  // stacking context'ine hapsolup harita gibi öğelerin altında kalır.
  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 sm:p-6"
      onClick={() => setOpen(false)}
    >
          <div
            className="min-h-full w-full max-w-4xl bg-slate-50 shadow-xl sm:min-h-0 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Başlık + sefer şeridi birlikte yapışkan: müşteri koltuk
                şemasını kaydırırken hangi seferi aldığını görmeye devam etsin
                ve seçici şemayı aşağı itmesin. */}
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white sm:rounded-t-2xl">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">
                    {isSeat ? "Koltuk Seçimi" : "Rezervasyon"}
                  </p>
                  <h3 className="truncate font-bold text-brand">{tour.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Kapat"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <DepartureSelector
                tour={tour}
                departures={departures}
                value={departure?.id ?? null}
                onChange={setDepartureId}
              />
            </div>

            {/* İçerik */}
            <div className="space-y-5 p-5">
              {!departure ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Bu tur için şu anda satışa açık sefer bulunmuyor.
                </p>
              ) : isSeat ? (
                // Sefer değişince koltuk seçimi sıfırlanmalı: key ile yeniden kur.
                <SeatMap key={departure.id} tour={tour} departure={departure} />
              ) : (
                <CapacityBooking key={departure.id} tour={tour} departure={departure} />
              )}
            </div>
          </div>
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {btnLabel}
      </button>

      {open && mounted && createPortal(modal, document.body)}
    </>
  );
}
