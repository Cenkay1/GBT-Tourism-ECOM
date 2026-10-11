"use client";

import { useMemo, useState } from "react";
import {
  Tour,
  TourDeparture,
  Gender,
  buildSeatGrid,
  formatPrice,
  genderLabel,
  departureSeatsLeft,
} from "@/lib/shared";

interface PassRow {
  seatCode?: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  gender: Gender | "";
}

const emptyRow = (seatCode?: string): PassRow => ({
  seatCode,
  firstName: "",
  lastName: "",
  idNumber: "",
  gender: "",
});

export default function AdminSaleForm({
  tour,
  action,
}: {
  tour: Tour;
  action: (fd: FormData) => void;
}) {
  const isKoltuk = tour.bookingType === "KOLTUK";

  // Elden satışta da sefer seçilir: koltuklar/kontenjan sefer bazlıdır.
  const departures: TourDeparture[] = tour.departures ?? [];
  const [departureId, setDepartureId] = useState<string>(
    departures.find((d) => d.status === "AKTIF")?.id ?? departures[0]?.id ?? ""
  );
  const departure = departures.find((d) => d.id === departureId);

  const grid = useMemo(
    () =>
      isKoltuk
        ? buildSeatGrid(
            tour,
            departure
              ? {
                  soldSeats: departure.soldSeats,
                  blockedSeats: departure.blockedSeats,
                  seatGenders: departure.seatGenders,
                  // Araç sefere göre değişebilir: düzen seçili seferden gelir.
                  vehicleType: departure.vehicleType,
                  seatRows: departure.seatRows,
                  doorAfterRow: departure.doorAfterRow,
                  backRowFull: departure.backRowFull,
                  seatMap: departure.seatMap,
                }
              : undefined
          )
        : [],
    [tour, isKoltuk, departure]
  );

  // KOLTUK: her seçilen koltuk bir yolcu satırı. KONTENJAN: quantity kadar satır.
  const [rows, setRows] = useState<PassRow[]>(isKoltuk ? [] : [emptyRow()]);
  const [quantity, setQuantity] = useState(isKoltuk ? 0 : 1);
  const [totalTouched, setTotalTouched] = useState(false);
  const [total, setTotal] = useState(tour.price);

  const count = isKoltuk ? rows.length : quantity;
  const autoTotal = tour.price * count;
  const shownTotal = totalTouched ? total : autoTotal;

  const capacityLeft =
    tour.bookingType === "KONTENJAN"
      ? departure
        ? departureSeatsLeft(tour, departure)
        : Math.max(0, (tour.capacity ?? 0) - (tour.sold ?? 0))
      : undefined;

  function toggleSeat(code: string, status: string) {
    if (status === "SATILDI") return;
    setRows((prev) => {
      const exists = prev.find((r) => r.seatCode === code);
      if (exists) return prev.filter((r) => r.seatCode !== code);
      return [...prev, emptyRow(code)];
    });
  }

  function setQty(q: number) {
    const safe = Math.max(1, Math.min(q, capacityLeft ?? q));
    setQuantity(safe);
    setRows((prev) => {
      const next = [...prev];
      while (next.length < safe) next.push(emptyRow());
      return next.slice(0, safe);
    });
  }

  function updateRow(i: number, patch: Partial<PassRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const seatCodes = isKoltuk ? rows.map((r) => r.seatCode!).filter(Boolean) : [];

  function seatClass(code: string, status: string) {
    if (status === "SATILDI") return "bg-slate-300 text-slate-500 cursor-not-allowed";
    const picked = rows.find((r) => r.seatCode === code);
    if (picked) return "bg-accent text-white ring-2 ring-accent";
    // Kapalı (BLOKE) koltuk: online satışa kapalı ama acente elden satabilir.
    if (status === "BLOKE") return "bg-red-100 text-red-700 ring-1 ring-red-300 hover:bg-red-200";
    return "bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
  }

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";
  const label = "block text-xs font-medium text-slate-500";

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tourId" value={tour.id} />
      <input type="hidden" name="departureId" value={departureId} />
      <input type="hidden" name="passengers" value={JSON.stringify(rows)} />
      <input type="hidden" name="seatCodes" value={JSON.stringify(seatCodes)} />
      <input type="hidden" name="quantity" value={String(count)} />
      <input type="hidden" name="totalAmount" value={String(shownTotal)} />

      {/* Sefer seçimi — koltuk/kontenjan sefere göre değişir */}
      {departures.length > 1 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 font-bold text-brand">Sefer</h2>
          <p className="mb-4 text-xs text-slate-400">
            Bu turun birden çok kalkış tarihi var. Satışın hangi sefere yazılacağını seçin.
          </p>
          <div className="flex flex-wrap gap-2">
            {departures.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDepartureId(d.id);
                  setRows(isKoltuk ? [] : [emptyRow()]);
                  if (!isKoltuk) setQuantity(1);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  d.id === departureId
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {new Date(d.departureDate).toLocaleString("tr-TR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {d.bus && ` · ${d.bus.plate}`}
                {d.status === "KAPALI" && " · kapalı"}
                {d.isPast && " · arşiv"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Koltuk / kontenjan seçimi */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">
          {isKoltuk ? "Koltuk Seçimi" : "Kişi Sayısı"}
        </h2>

        {isKoltuk ? (
          <div className="space-y-2">
            {grid.map((row, ri) => (
              <div key={ri} className="flex items-center justify-center gap-1.5">
                {row.map((seat, ci) =>
                  seat.code === "aisle" ? (
                    <span key={ci} className="w-4" />
                  ) : (
                    <button
                      key={ci}
                      type="button"
                      disabled={seat.status === "SATILDI"}
                      onClick={() => toggleSeat(seat.code, seat.status)}
                      className={`h-8 w-8 rounded-md text-[10px] font-semibold transition ${seatClass(
                        seat.code,
                        seat.status
                      )}`}
                      title={seat.status === "SATILDI" ? "Dolu" : seat.code}
                    >
                      {seat.code}
                    </button>
                  )
                )}
              </div>
            ))}
            <p className="pt-2 text-center text-xs text-slate-400">
              Yeşil: boş · Turuncu: seçili · Kırmızı: kapalı (elden satılabilir) · Gri: dolu
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={capacityLeft}
              value={quantity}
              onChange={(e) => setQty(Number(e.target.value) || 1)}
              className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <span className="text-sm text-slate-500">
              kişi{capacityLeft != null ? ` (kalan kontenjan: ${capacityLeft})` : ""}
            </span>
          </div>
        )}
      </div>

      {/* İletişim */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">İletişim Bilgileri</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Ad Soyad *
            <input name="contactName" required className={input} />
          </label>
          <label className={label}>
            Telefon *
            <input name="contactPhone" required className={input} placeholder="5xx xxx xx xx" />
          </label>
          <label className={label}>
            E-posta
            <input name="contactEmail" type="email" className={input} />
          </label>
        </div>
      </div>

      {/* Yolcular */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">Yolcular ({count})</h2>
        {count === 0 ? (
          <p className="text-sm text-slate-400">
            {isKoltuk ? "Yukarıdan koltuk seçin." : "Kişi sayısı girin."}
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div
                key={r.seatCode ?? i}
                className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto]"
              >
                <span className="flex items-center text-xs font-semibold text-slate-400">
                  {r.seatCode ? `Koltuk ${r.seatCode}` : `#${i + 1}`}
                </span>
                <input
                  placeholder="Ad"
                  value={r.firstName}
                  onChange={(e) => updateRow(i, { firstName: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  placeholder="Soyad"
                  value={r.lastName}
                  onChange={(e) => updateRow(i, { lastName: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  placeholder={tour.category === "YURT_DISI" ? "TC / Pasaport" : "TC Kimlik No"}
                  value={r.idNumber}
                  onChange={(e) => updateRow(i, { idNumber: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <select
                  value={r.gender}
                  onChange={(e) => updateRow(i, { gender: e.target.value as Gender | "" })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="">Cinsiyet</option>
                  <option value="E">{genderLabel("E")}</option>
                  <option value="K">{genderLabel("K")}</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tutar */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">Toplam Tutar</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            value={shownTotal}
            onChange={(e) => {
              setTotalTouched(true);
              setTotal(Number(e.target.value) || 0);
            }}
            className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <span className="text-sm text-slate-500">
            Otomatik: {formatPrice(autoTotal, tour.currency)} ({count} × {formatPrice(tour.price, tour.currency)})
          </span>
          {totalTouched && (
            <button
              type="button"
              onClick={() => setTotalTouched(false)}
              className="text-xs text-brand hover:underline"
            >
              Otomatiğe dön
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          disabled={count === 0}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-white hover:bg-accent-dark disabled:opacity-50"
        >
          Elden Satışı Kaydet ({formatPrice(shownTotal, tour.currency)})
        </button>
        <a
          href="/admin/rezervasyonlar"
          className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Vazgeç
        </a>
      </div>
    </form>
  );
}
