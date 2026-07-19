"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tour, formatPrice } from "@/lib/shared";

export default function CapacityBooking({ tour }: { tour: Tour }) {
  const left = (tour.capacity ?? 0) - (tour.sold ?? 0);
  const [qty, setQty] = useState(1);
  const total = qty * tour.price;
  const max = Math.min(left, 9);
  const router = useRouter();

  function goToCheckout() {
    const params = new URLSearchParams({ tur: tour.slug, adet: String(qty) });
    router.push(`/rezervasyon?${params}`);
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 md:max-w-md">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-brand">Kontenjan Rezervasyonu</h3>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {left} kişilik yer var
        </span>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">Kişi sayısı</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="h-9 w-9 rounded-lg border border-slate-200 text-lg font-bold text-brand transition hover:bg-slate-50"
          >
            −
          </button>
          <span className="w-8 text-center text-lg font-bold">{qty}</span>
          <button
            onClick={() => setQty((q) => Math.min(max, q + 1))}
            className="h-9 w-9 rounded-lg border border-slate-200 text-lg font-bold text-brand transition hover:bg-slate-50"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-1 border-t border-slate-100 pt-4 text-sm">
        <div className="flex justify-between text-slate-500">
          <span>Kişi başı</span>
          <span className="font-medium text-slate-700">{formatPrice(tour.price, tour.currency)}</span>
        </div>
        <div className="flex items-center justify-between pt-2 text-lg font-extrabold text-brand">
          <span>Toplam</span>
          <span className="text-accent">{formatPrice(total, tour.currency)}</span>
        </div>
      </div>

      <button
        onClick={goToCheckout}
        disabled={left <= 0}
        className="mt-5 w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {left <= 0 ? "Kontenjan Doldu" : "Devam Et"}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">Güvenli ödeme • iyzico</p>
    </div>
  );
}
