"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Tour } from "@/lib/shared";
import SeatMap from "@/components/SeatMap";
import CapacityBooking from "@/components/CapacityBooking";

export default function BookingLauncher({
  tour,
  className,
  label,
  initialFrom = null,
  initialTo = null,
}: {
  tour: Tour;
  className?: string;
  label?: string;
  initialFrom?: string | null;
  initialTo?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isSeat = tour.bookingType === "KOLTUK";
  const btnLabel = label ?? (isSeat ? "Koltuk Seç / Satın Al" : "Rezervasyon Yap");

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
            {/* Başlık */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:rounded-t-2xl">
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

            {/* İçerik */}
            <div className="p-5">
              {isSeat ? (
                <SeatMap tour={tour} initialFrom={initialFrom} initialTo={initialTo} />
              ) : (
                <CapacityBooking tour={tour} />
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
