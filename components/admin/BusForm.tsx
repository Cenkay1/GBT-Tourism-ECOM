"use client";

import { useState } from "react";
import Link from "next/link";
import {
  VEHICLES,
  type VehicleType,
  type SeatMapRows,
  SEAT_MAP_MAX_COLS,
  SEAT_MAP_MAX_ROWS,
  legacySeatMap,
  renumberSeatMap,
  seatMapCodes,
  seatMapLayoutLabel,
} from "@/lib/shared";

export interface BusFormValues {
  name?: string;
  plate?: string;
  vehicleType?: string;
  seatRows?: number;
  doorAfterRow?: number;
  backRowFull?: boolean;
  seatMap?: SeatMapRows;
  notes?: string;
  active?: boolean;
}

// Şablon: 2+2 / 2+1 / 1+1 düzenini verilen sıra sayısıyla çizer, 1'den numaralar.
function templateMap(vt: VehicleType, rows: number): SeatMapRows {
  return renumberSeatMap(legacySeatMap(vt, rows));
}

// Otobüs tanım formu. Koltuk planı elle çizilir: her hücreye istediğiniz koltuk
// numarasını yazın, boş bıraktığınız hücre koridor/boşluk olur. Çizdiğiniz plan
// müşterinin ve acentenin göreceği şemayla birebir aynıdır.
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
  // Eski (harfli) araç açılırsa mevcut yerleşim sayılara çevrilmiş olarak gelir.
  const wasLegacy = Boolean(initial?.vehicleType) && !initial?.seatMap;
  const [rows, setRows] = useState<SeatMapRows>(() => {
    if (initial?.seatMap) return initial.seatMap;
    if (wasLegacy) {
      return renumberSeatMap(
        legacySeatMap(
          (initial?.vehicleType as VehicleType) ?? "OTOBUS",
          initial?.seatRows ?? 12,
          initial?.backRowFull ?? false
        )
      );
    }
    return templateMap("OTOBUS", 12);
  });
  const [doorAfterRow, setDoorAfterRow] = useState<string>(
    initial?.doorAfterRow != null ? String(initial.doorAfterRow) : ""
  );

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  const cols = rows[0]?.length ?? 0;
  const codes = seatMapCodes(rows);
  const counts = new Map<string, number>();
  for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  const door = Number(doorAfterRow) || 0;
  const invalid = codes.length === 0 || duplicates.length > 0;

  function setCell(r: number, c: number, raw: string) {
    // Yalnız rakam; başındaki sıfırlar atılır, en fazla 3 hane.
    const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 3);
    setRows((prev) =>
      prev.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? digits : v)) : row))
    );
  }

  function setRowCount(n: number) {
    const count = Math.max(1, Math.min(SEAT_MAP_MAX_ROWS, n || 1));
    setRows((prev) => {
      if (count <= prev.length) return prev.slice(0, count);
      // Yeni sıralar son sıranın yerleşimini kopyalar; numaralar kaldığı yerden devam eder.
      const template = prev[prev.length - 1] ?? Array(cols || 4).fill("1");
      let next = Math.max(0, ...prev.flat().map((v) => Number(v) || 0));
      const added: SeatMapRows = [];
      for (let i = prev.length; i < count; i++) {
        added.push(template.map((v) => (v ? String(++next) : "")));
      }
      return [...prev, ...added];
    });
  }

  function setColCount(n: number) {
    const count = Math.max(1, Math.min(SEAT_MAP_MAX_COLS, n || 1));
    setRows((prev) =>
      prev.map((row) =>
        count <= row.length ? row.slice(0, count) : [...row, ...Array(count - row.length).fill("")]
      )
    );
  }

  function applyTemplate(vt: VehicleType) {
    setVehicleType(vt);
    setRows(templateMap(vt, rows.length));
  }

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
        <h2 className="mb-1 font-bold text-brand">Koltuk Planı</h2>
        <p className="mb-4 text-xs text-slate-400">
          Kutulara istediğiniz koltuk numarasını yazın. Boş bıraktığınız kutu koridor
          (boşluk) olur. Aşağıdaki çizim, müşterinin ve acentenin göreceği şemayla birebir
          aynıdır. Koltuk kodu yalnızca bu numaradır.
        </p>

        {wasLegacy && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Bu otobüs eski harfli düzendeydi (1A, 1B…). Kaydederseniz koltuklar sayıya
            çevrilir. Bu otobüsü kullanan bir seferde satılmış koltuk varsa numaraları
            değiştirmenize izin verilmez — o durumda yeni bir otobüs ekleyin.
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className={label}>
                Araç Tipi
                <select
                  name="vehicleType"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  className={input}
                >
                  <option value="OTOBUS">Otobüs</option>
                  <option value="VIP">Lüks / VIP</option>
                  <option value="MINIBUS">Minibüs / Küçük</option>
                </select>
              </label>
              <label className={label}>
                Sıra Sayısı
                <input
                  type="number"
                  min={1}
                  max={SEAT_MAP_MAX_ROWS}
                  value={rows.length}
                  onChange={(e) => setRowCount(Number(e.target.value))}
                  className={input}
                />
              </label>
              <label className={label}>
                Sütun Sayısı
                <input
                  type="number"
                  min={1}
                  max={SEAT_MAP_MAX_COLS}
                  value={cols}
                  onChange={(e) => setColCount(Number(e.target.value))}
                  className={input}
                />
              </label>
            </div>

            <label className={label}>
              Orta Kapı Sırası
              <input
                name="doorAfterRow"
                type="number"
                min={1}
                max={rows.length}
                value={doorAfterRow}
                onChange={(e) => setDoorAfterRow(e.target.value)}
                placeholder="Örn. 7"
                className={input}
              />
              <span className="mt-1 block text-xs text-slate-400">
                Kapı bu sıradan sonra çizilir. Boş = kapı yok.
              </span>
            </label>

            <div>
              <p className="text-sm font-medium text-slate-600">Hızlı şablon</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {(Object.keys(VEHICLES) as VehicleType[]).map((vt) => (
                  <button
                    key={vt}
                    type="button"
                    onClick={() => applyTemplate(vt)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {VEHICLES[vt].layout}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setRows((prev) => renumberSeatMap(prev))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Baştan numarala (1, 2, 3…)
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Şablon, mevcut sıra sayısıyla yerleşimi baştan çizer. Sonra kutuları
                istediğiniz gibi düzenleyin.
              </p>
            </div>

            <p
              className={`rounded-lg px-3 py-2 text-xs ${
                invalid ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"
              }`}
            >
              {codes.length === 0 ? (
                <>En az bir koltuk numarası yazın.</>
              ) : duplicates.length > 0 ? (
                <>
                  Aynı numara birden fazla kutuda: <strong>{duplicates.join(", ")}</strong>.
                  Her koltuğun numarası benzersiz olmalı.
                </>
              ) : (
                <>
                  Toplam <strong>{codes.length} koltuk</strong> · {seatMapLayoutLabel(rows)} düzen
                  {door > 0 && ` · kapı ${door}. sıradan sonra`}
                </>
              )}
            </p>
          </div>

          {/* Çizim = düzenleme alanı */}
          <div className="w-fit max-w-full overflow-x-auto rounded-xl border-2 border-slate-200 p-3">
            <div className="mb-2 text-left text-[10px] uppercase tracking-wide text-slate-400">
              Şoför
            </div>
            <div className="flex flex-col gap-1.5">
              {rows.map((row, r) => (
                <div key={r}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 text-right text-[10px] text-slate-400">{r + 1}</span>
                    {row.map((cell, c) => {
                      const dup = cell !== "" && (counts.get(cell) ?? 0) > 1;
                      return (
                        <input
                          key={c}
                          value={cell}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          inputMode="numeric"
                          maxLength={3}
                          placeholder="·"
                          aria-label={`${r + 1}. sıra ${c + 1}. kutu`}
                          className={`h-8 w-9 rounded-md text-center text-[11px] font-semibold outline-none focus:ring-2 focus:ring-brand/40 ${
                            dup
                              ? "bg-red-100 text-red-700 ring-1 ring-red-300"
                              : cell
                              ? "bg-emerald-100 text-emerald-800"
                              : "border border-dashed border-slate-300 bg-white text-slate-300"
                          }`}
                        />
                      );
                    })}
                  </div>
                  {door === r + 1 && (
                    <div className="my-1.5 flex items-center gap-1.5 text-[9px] font-semibold text-slate-400">
                      <span className="h-px flex-1 bg-slate-200" />Kapı
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <input type="hidden" name="seatMap" value={JSON.stringify(rows)} />
      </div>

      <div className="flex gap-3">
        <button
          disabled={invalid}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
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
