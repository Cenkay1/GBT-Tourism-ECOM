"use client";

import { useState } from "react";
import { busSeatCount, type Bus } from "@/lib/shared";

// Bir turun seferleri (kalkış/dönüş çiftleri). Aynı tur birden çok sefer içerebilir:
// örn. ayın 12'si → 17'si ve 18'i → 24'ü, ya da "her hafta Salı".
export interface DepartureRow {
  id?: string; // mevcut sefer (düzenleme); yeni satırlarda boş
  departureDate: string; // yyyy-MM-ddTHH:mm
  returnDate: string; // yyyy-MM-ddTHH:mm | ""
  capacity?: number; // yalnız KONTENJAN turlarında
  status: "AKTIF" | "KAPALI";
  hasBookings?: boolean; // rezervasyon/satış var → silinemez, yalnız kapatılabilir
  busId?: string; // sefere özel otobüs ("" / undefined = turun varsayılanı)
  bookingCount?: number; // bu seferdeki rezervasyon sayısı (bilgi amaçlı)
}

const WEEKDAYS = [
  { value: 1, label: "Pazartesi" },
  { value: 2, label: "Salı" },
  { value: 3, label: "Çarşamba" },
  { value: 4, label: "Perşembe" },
  { value: 5, label: "Cuma" },
  { value: 6, label: "Cumartesi" },
  { value: 0, label: "Pazar" },
];

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fmt(v: string): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Kalkış tarihi geçmiş sefer = arşiv. Satışa kapalıdır, silinmez; rezervasyonları
// kendi seferinde durur. Aynı turu tekrar yapmak için yeni sefer eklenir —
// yeni seferin koltukları boş gelir, eski satışlarla karışmaz.
function isPast(v: string): boolean {
  if (!v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d < new Date();
}

export default function DeparturesEditor({
  value,
  onChange,
  bookingType,
  buses = [],
  defaultBusId = "",
}: {
  value: DepartureRow[];
  onChange: (rows: DepartureRow[]) => void;
  bookingType: string;
  buses?: Bus[];
  defaultBusId?: string;
}) {
  const [genOpen, setGenOpen] = useState(false);
  const rows = value;
  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  function update(i: number, patch: Partial<DepartureRow>) {
    onChange(
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        // Dönüş kalkıştan önce olamaz.
        if (next.departureDate && next.returnDate && next.returnDate < next.departureDate) {
          next.returnDate = next.departureDate;
        }
        return next;
      })
    );
  }

  function add() {
    onChange([
      ...rows,
      { departureDate: "", returnDate: "", status: "AKTIF" },
    ]);
  }

  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  const defaultBus = buses.find((b) => b.id === defaultBusId);

  const sorted = [...rows]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.departureDate || "").localeCompare(b.r.departureDate || ""));

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-3 text-xs text-amber-800">
          En az bir sefer eklemelisiniz. Turun kalkış/dönüş tarihi buradan belirlenir.
        </p>
      )}

      {sorted.map(({ r: row, i }, pos) => {
        const past = isPast(row.departureDate);
        return (
        <div
          key={row.id ?? `new-${i}`}
          className={`rounded-xl border p-3 ${
            past
              ? "border-slate-200 bg-slate-100"
              : row.status === "KAPALI"
              ? "border-slate-200 bg-slate-50"
              : "border-slate-100"
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span className="rounded-md bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">
                {pos + 1}. Sefer
              </span>
              {past && (
                <span className="rounded-md bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600">
                  Geçti · arşiv
                </span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              {row.hasBookings && (
                <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                  {row.bookingCount ? `${row.bookingCount} rez.` : "Satış var"}
                </span>
              )}
              {!past && (
                <button
                  type="button"
                  onClick={() =>
                    update(i, { status: row.status === "AKTIF" ? "KAPALI" : "AKTIF" })
                  }
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    row.status === "AKTIF"
                      ? "text-amber-700 hover:bg-amber-50"
                      : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {row.status === "AKTIF" ? "Satışı Kapat" : "Satışı Aç"}
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={row.hasBookings}
                title={
                  row.hasBookings
                    ? "Bu seferde rezervasyon var; silemezsiniz, yalnızca satışı kapatabilirsiniz."
                    : undefined
                }
                className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
              >
                Sil
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-500">
              Kalkış Tarihi/Saati *
              <input
                type="datetime-local"
                value={row.departureDate}
                onChange={(e) => update(i, { departureDate: e.target.value })}
                className={`mt-1 ${input}`}
              />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Dönüş Tarihi/Saati
              <input
                type="datetime-local"
                value={row.returnDate}
                min={row.departureDate || undefined}
                onChange={(e) => update(i, { returnDate: e.target.value })}
                className={`mt-1 ${input}`}
              />
            </label>
            {bookingType === "KONTENJAN" && (
              <label className="block text-xs font-medium text-slate-500">
                Bu Seferin Kontenjanı
                <input
                  type="number"
                  min={1}
                  value={row.capacity ?? ""}
                  onChange={(e) =>
                    update(i, { capacity: Number(e.target.value) || undefined })
                  }
                  placeholder="Boş = turun kontenjanı"
                  className={`mt-1 ${input}`}
                />
              </label>
            )}
            {bookingType === "KOLTUK" && buses.length > 0 && (
              <label className="block text-xs font-medium text-slate-500">
                Bu Seferin Otobüsü
                <select
                  value={row.busId ?? ""}
                  onChange={(e) => update(i, { busId: e.target.value || undefined })}
                  className={`mt-1 ${input}`}
                >
                  <option value="">
                    {defaultBus
                      ? `Turun varsayılanı — ${defaultBus.plate}`
                      : "Turun varsayılanı"}
                  </option>
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.plate} — {busSeatCount(b)} koltuk ({b.seatLayout})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {fmt(row.departureDate)} → {fmt(row.returnDate)}
            {row.status === "KAPALI" && " · satışa kapalı"}
            {past && " · arşiv (sitede görünmez)"}
          </p>
          {row.hasBookings && row.busId && (
            <p className="mt-1 text-[11px] text-amber-700">
              Bu seferde satış var; otobüsü değiştirirseniz koltuk şeması korunur (yalnız
              plaka bilgisi güncellenir).
            </p>
          )}
        </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={add}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Sefer Ekle
        </button>
        <button
          type="button"
          onClick={() => setGenOpen((v) => !v)}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-brand transition hover:bg-slate-50"
        >
          ⟳ Haftalık Üret
        </button>
      </div>

      {genOpen && (
        <WeeklyGenerator
          onGenerate={(generated) => {
            // Aynı kalkış anına sahip sefer varsa tekrar eklenmez.
            const existing = new Set(rows.map((r) => r.departureDate));
            const fresh = generated.filter((g) => !existing.has(g.departureDate));
            onChange([...rows, ...fresh]);
            setGenOpen(false);
          }}
          onCancel={() => setGenOpen(false)}
        />
      )}
    </div>
  );
}

// Haftanın belirli günü için tarih aralığında sefer satırları üretir.
function WeeklyGenerator({
  onGenerate,
  onCancel,
}: {
  onGenerate: (rows: DepartureRow[]) => void;
  onCancel: () => void;
}) {
  const [weekday, setWeekday] = useState(2); // Salı
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [time, setTime] = useState("20:00");
  const [nights, setNights] = useState(1);
  const [returnTime, setReturnTime] = useState("08:00");
  const [error, setError] = useState("");

  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  function build(): DepartureRow[] {
    const start = new Date(`${from}T00:00`);
    const end = new Date(`${to}T23:59`);
    const out: DepartureRow[] = [];
    const [h, m] = time.split(":").map(Number);
    const [rh, rm] = returnTime.split(":").map(Number);

    // Aralıktaki ilk hedef güne ilerle.
    const cur = new Date(start);
    while (cur.getDay() !== weekday) cur.setDate(cur.getDate() + 1);

    while (cur <= end && out.length < 60) {
      const dep = new Date(cur);
      dep.setHours(h || 0, m || 0, 0, 0);
      const ret = new Date(dep);
      ret.setDate(ret.getDate() + Math.max(0, nights));
      ret.setHours(rh || 0, rm || 0, 0, 0);
      out.push({
        departureDate: toLocalInput(dep),
        returnDate: toLocalInput(ret),
        status: "AKTIF",
      });
      cur.setDate(cur.getDate() + 7);
    }
    return out;
  }

  function submit() {
    if (!from || !to) {
      setError("Başlangıç ve bitiş tarihi girin.");
      return;
    }
    if (to < from) {
      setError("Bitiş tarihi başlangıçtan önce olamaz.");
      return;
    }
    const rows = build();
    if (rows.length === 0) {
      setError("Bu aralıkta seçilen güne denk gelen tarih yok.");
      return;
    }
    setError("");
    onGenerate(rows);
  }

  const preview = from && to && to >= from ? build() : [];

  return (
    <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
      <p className="mb-3 text-sm font-semibold text-brand">Haftalık Sefer Üret</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-500">
          Haftanın Günü
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className={`mt-1 ${input}`}
          >
            {WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Kalkış Saati
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={`mt-1 ${input}`}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Aralık Başlangıcı
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`mt-1 ${input}`}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Aralık Bitişi
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={`mt-1 ${input}`}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Kaç Gün Sonra Dönüş
          <input
            type="number"
            min={0}
            max={60}
            value={nights}
            onChange={(e) => setNights(Number(e.target.value) || 0)}
            className={`mt-1 ${input}`}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Dönüş Saati
          <input
            type="time"
            value={returnTime}
            onChange={(e) => setReturnTime(e.target.value)}
            className={`mt-1 ${input}`}
          />
        </label>
      </div>

      {preview.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          <strong>{preview.length}</strong> sefer üretilecek — ilki{" "}
          {fmt(preview[0].departureDate)}, sonu {fmt(preview[preview.length - 1].departureDate)}.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-dark"
        >
          Seferleri Ekle
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}
