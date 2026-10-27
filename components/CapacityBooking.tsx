"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tour, TourDeparture, formatPrice, departureSeatsLeft } from "@/lib/shared";
import BoardingSelector from "@/components/BoardingSelector";

export default function CapacityBooking({
  tour,
  departure,
}: {
  tour: Tour;
  departure?: TourDeparture;
}) {
  // Kontenjan sefer bazlıdır; sefer verilmezse tur seviyesi sayıma düşülür.
  const left = departure
    ? departureSeatsLeft(tour, departure)
    : (tour.capacity ?? 0) - (tour.sold ?? 0);
  // Burada yalnız KİŞİ SAYISI seçilir. Konaklamalı turda oda dağılımı ve yaş
  // grupları bir sonraki adımda (yolcu formunda) doğum tarihinden belirlenir —
  // müşteri aynı bilgiyi iki kez girmez.
  const accommodation = Boolean(tour.hasAccommodation);
  const [qty, setQty] = useState(1);
  const max = Math.min(left, 9);
  const router = useRouter();

  const stops = (tour.places ?? []).filter((p) => p.type === "BINIS");
  const [boardingId, setBoardingId] = useState<string | null>(
    stops.length ? stops[0].id : null
  );
  const boardingStop = stops.find((s) => s.id === boardingId);
  const unitPrice = boardingStop?.price ?? tour.price;

  // Bu ekranda gösterilen tutar tam ücret üzerinden; yaş indirimleri ve tek
  // kişilik oda farkı yolcu bilgileri girildikten sonra kesinleşir.
  const total = qty * unitPrice;
  const overCapacity = qty > left;
  const blocked = left <= 0 || qty < 1 || overCapacity;

  function goToCheckout() {
    const params = new URLSearchParams({ tur: tour.slug, adet: String(qty) });
    if (departure) params.set("sefer", departure.id);
    if (boardingId) params.set("durak", boardingId);
    router.push(`/rezervasyon?${params}`);
  }

  return (
    <div className="space-y-4 md:max-w-md">
      {stops.length > 0 && (
        <BoardingSelector
          places={tour.places ?? []}
          value={boardingId}
          onChange={setBoardingId}
          basePrice={tour.price}
          currency={tour.currency}
        />
      )}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
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
        {boardingStop && (
          <div className="flex justify-between text-slate-500">
            <span>Biniş</span>
            <span className="font-medium text-slate-700">{boardingStop.name}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-500">
          <span>Kişi başı</span>
          <span className="font-medium text-slate-700">{formatPrice(unitPrice, tour.currency)}</span>
        </div>
        <div className="flex items-center justify-between pt-2 text-lg font-extrabold text-brand">
          <span>Toplam</span>
          <span className="text-accent">{formatPrice(total, tour.currency)}</span>
        </div>
      </div>

      {accommodation && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Konaklamalı tur: oda dağılımını bir sonraki adımda yaparsınız. 0-3 yaş
          ücretsiz, 4-6 yaş %50 indirimli (rezervasyonda en az 2 yetişkin olmak
          şartıyla) — yolcu doğum tarihlerine göre orada otomatik uygulanır.
        </p>
      )}

      {overCapacity && (
        <p className="mt-3 text-xs font-medium text-red-600">
          Kalan kontenjan {left} kişi; seçtiğiniz kişi sayısı bunu aşıyor.
        </p>
      )}

      <button
        onClick={goToCheckout}
        disabled={blocked}
        className="mt-5 w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {left <= 0 ? "Kontenjan Doldu" : "Devam Et"}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">Güvenli ödeme • iyzico</p>
      </div>
    </div>
  );
}
