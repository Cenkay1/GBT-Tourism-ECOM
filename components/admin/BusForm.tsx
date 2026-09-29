"use client";

import { useState } from "react";
import Link from "next/link";
import { VEHICLES, type VehicleType, buildSeatGrid, type Tour } from "@/lib/shared";

export interface BusFormValues {
  name?: string;
  plate?: string;
  vehicleType?: string;
  seatRows?: number;
  doorAfterRow?: number;
  backRowFull?: boolean;
  notes?: string;
  active?: boolean;
}

// Otobüs tanım formu. Girilen düzen canlı önizlenir — böylece kapının yeri ve
// koltuk numaraları gerçek araçla birebir eşleşene kadar düzeltilebilir.
export default function BusForm({
  action,
  initial,
  submitLabel,
}: {
  action: (fd: FormData) => void;
  initial?: BusFormValues;
  submitLabel: string;
}) {
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    (initial?.vehicleType as VehicleType) ?? "OTOBUS"
  );
  const [seatRows, setSeatRows] = useState(initial?.seatRows ?? 12);
  const [doorAfterRow, setDoorAfterRow] = useState<string>(
    initial?.doorAfterRow != null ? String(initial.doorAfterRow) : ""
  );
  const [backRowFull, setBackRowFull] = useState(initial?.backRowFull ?? false);

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  const perRow = VEHICLES[vehicleType].left.length + VEHICLES[vehicleType].right.length;
  const seatCount = seatRows * perRow + (backRowFull ? 1 : 0);
  const door = Number(doorAfterRow) || 0;

  // Önizleme için sahte tur nesnesi (yalnız düzen alanları kullanılır).
  const previewTour = {
    bookingType: "KOLTUK",
    vehicleType,
    seatRows,
    backRowFull,
  } as unknown as Tour;
  const grid = buildSeatGrid(previewTour);

  return (
    <form action={action} className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">Araç Bilgileri</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Otobüs Adı *
            <input
              name="name"
              required
              defaultValue={initial?.name}
              placeholder="Örn. 45 Koltuk Mercedes"
              className={input}
            />
            <span className="mt-1 block text-xs text-slate-400">
              Yalnız sizin tanımanız için; müşteriye gösterilmez.
            </span>
          </label>
          <label className={label}>
            Plaka *
            <input
              name="plate"
              required
              defaultValue={initial?.plate}
              placeholder="34 ABC 123"
              className={`${input} uppercase`}
            />
            <span className="mt-1 block text-xs text-slate-400">
              Kalkıştan bir gün önce giden SMS ve e-postada bu plaka yazar.
            </span>
          </label>
        </div>

        <label className={`${label} mt-4`}>
          Not
          <textarea
            name="notes"
            rows={2}
            defaultValue={initial?.notes}
            placeholder="Örn. WC var, 2 kat bagaj"
            className={input}
          />
        </label>

        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-600">
          <input
            name="active"
            type="checkbox"
            defaultChecked={initial?.active ?? true}
            className="h-4 w-4"
          />
          Aktif (turlarda seçilebilir)
        </label>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-bold text-brand">Koltuk Düzeni</h2>
        <p className="mb-4 text-xs text-slate-400">
          Bu düzen, otobüsü seçtiğiniz turlarda birebir oluşturulur. Sağdaki önizleme
          gerçek araçla aynı olana kadar değerleri düzeltin.
        </p>

        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Araç Tipi
              <select
                name="vehicleType"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className={input}
              >
                <option value="OTOBUS">Otobüs — 2+2 (standart)</option>
                <option value="VIP">Lüks / VIP — 2+1</option>
                <option value="MINIBUS">Minibüs / Küçük — 1+1</option>
              </select>
            </label>
            <label className={label}>
              Sıra Sayısı
              <input
                name="seatRows"
                type="number"
                min={1}
                max={20}
                value={seatRows}
                onChange={(e) => setSeatRows(Math.max(1, Number(e.target.value) || 1))}
                className={input}
              />
            </label>
            <label className={label}>
              Orta Kapı Sırası
              <input
                name="doorAfterRow"
                type="number"
                min={1}
                max={seatRows}
                value={doorAfterRow}
                onChange={(e) => setDoorAfterRow(e.target.value)}
                placeholder="Örn. 7"
                className={input}
              />
              <span className="mt-1 block text-xs text-slate-400">
                Kapı bu sıradan sonra çizilir. Boş = kapı yok.
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 sm:col-span-2">
              <input
                name="backRowFull"
                type="checkbox"
                checked={backRowFull}
                onChange={(e) => setBackRowFull(e.target.checked)}
                className="h-4 w-4"
              />
              Son sırada koridorda da koltuk olsun (tam sıra)
            </label>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:col-span-2">
              Toplam <strong>{seatCount} koltuk</strong> · {VEHICLES[vehicleType].layout} düzen
              {door > 0 && ` · kapı ${door}. sıradan sonra`}
            </p>
          </div>

          {/* Canlı önizleme */}
          <div className="w-fit rounded-xl border-2 border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wide text-slate-400">
              Şoför 🚌
            </div>
            <div className="flex flex-col gap-1.5">
              {grid.map((row, r) => (
                <div key={r}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 text-right text-[10px] text-slate-400">{r + 1}</span>
                    {row.map((seat, c) =>
                      seat.code === "aisle" ? (
                        <div key={c} className="w-7" />
                      ) : (
                        <span
                          key={c}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-[9px] font-semibold text-emerald-800"
                        >
                          {seat.code}
                        </span>
                      )
                    )}
                  </div>
                  {door === r + 1 && (
                    <div className="my-1.5 flex items-center gap-1.5 text-[9px] font-semibold text-slate-400">
                      <span className="h-px flex-1 bg-slate-200" />🚪 Kapı
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-white hover:bg-accent-dark">
          {submitLabel}
        </button>
        <Link
          href="/admin/otobusler"
          className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Vazgeç
        </Link>
      </div>
    </form>
  );
}
