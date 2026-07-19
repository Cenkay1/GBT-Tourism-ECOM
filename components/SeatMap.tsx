"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Tour,
  Gender,
  buildSeatGrid,
  formatPrice,
  vehicleLabel,
  seatNeighbor,
  genderLabel,
} from "@/lib/shared";
import { BusIcon } from "@/components/Icons";

const MAX_SEATS = 6;

interface Picked {
  code: string;
  gender: Gender;
}

export default function SeatMap({ tour }: { tour: Tour }) {
  const rows = useMemo(() => buildSeatGrid(tour), [tour]);
  const [selected, setSelected] = useState<Picked[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  const [warning, setWarning] = useState<string>("");
  const router = useRouter();

  const layout = tour.seatLayout ?? "2+2";
  const takenGenders = tour.seatGenders ?? {};

  function isSelected(code: string) {
    return selected.some((s) => s.code === code);
  }

  function onSeatClick(code: string, status: string) {
    setWarning("");
    if (status === "SATILDI") return;
    if (isSelected(code)) {
      setSelected((prev) => prev.filter((s) => s.code !== code));
      return;
    }
    if (selected.length >= MAX_SEATS) {
      setWarning(`En fazla ${MAX_SEATS} koltuk seçebilirsiniz.`);
      return;
    }
    setPicking(code);
  }

  // Yan yana kuralı: seçilen cinsiyet, bitişik DOLU koltuktaki yabancı yolcunun
  // cinsiyetiyle çelişmemeli. (Aynı rezervasyonda seçilenler serbest.)
  function conflictReason(code: string, gender: Gender): string | null {
    const neighbor = seatNeighbor(code, layout);
    if (!neighbor) return null;
    const neighborTakenGender = takenGenders[neighbor];
    if (neighborTakenGender && neighborTakenGender !== gender) {
      return `${neighbor} koltuğunda ${genderLabel(neighborTakenGender)} bir yolcu var. Yan yana farklı cinsiyet oturamayacağı için bu koltuğu ${genderLabel(gender)} olarak seçemezsiniz.`;
    }
    return null;
  }

  function chooseGender(gender: Gender) {
    if (!picking) return;
    const reason = conflictReason(picking, gender);
    if (reason) {
      setWarning(reason);
      setPicking(null);
      return;
    }
    setSelected((prev) => [...prev, { code: picking, gender }]);
    setPicking(null);
  }

  function goToCheckout() {
    const koltuklar = selected.map((s) => `${s.code}:${s.gender}`).join(",");
    const params = new URLSearchParams({ tur: tour.slug, koltuklar });
    router.push(`/rezervasyon?${params}`);
  }

  const total = selected.length * tour.price;

  function seatClasses(code: string, status: string, gender?: Gender | null) {
    if (isSelected(code)) {
      const g = selected.find((s) => s.code === code)!.gender;
      return g === "K" ? "bg-pink-600 text-white" : "bg-blue-600 text-white";
    }
    if (status === "SATILDI") {
      if (gender === "K") return "cursor-not-allowed bg-pink-200 text-pink-700";
      if (gender === "E") return "cursor-not-allowed bg-blue-200 text-blue-800";
      return "cursor-not-allowed bg-slate-300 text-slate-500";
    }
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_260px]">
      {/* Araç şeması */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-brand">Koltuk Seçimi</span>
          <span className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
            <BusIcon width={14} height={14} />
            {vehicleLabel(tour.vehicleType)} · {layout}
          </span>
        </div>

        {warning && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {warning}
          </p>
        )}

        <div className="mx-auto w-fit rounded-xl border-2 border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-end gap-1.5 text-slate-400">
            <span className="text-[10px] uppercase tracking-wide">Şoför</span>
            <BusIcon width={18} height={18} />
          </div>
          <div className="flex flex-col gap-2">
            {rows.map((row, r) => (
              <div key={r} className="flex items-center gap-2">
                <span className="w-4 text-right text-[10px] text-slate-400">{r + 1}</span>
                {row.map((seat, c) =>
                  seat.code === "aisle" ? (
                    <div key={c} className="w-4" />
                  ) : (
                    <button
                      key={c}
                      onClick={() => onSeatClick(seat.code, seat.status)}
                      disabled={seat.status === "SATILDI"}
                      title={
                        seat.status === "SATILDI"
                          ? `${seat.code} — dolu${seat.gender ? " (" + genderLabel(seat.gender) + ")" : ""}`
                          : seat.code
                      }
                      className={`h-8 w-8 rounded-md text-[10px] font-semibold transition ${seatClasses(seat.code, seat.status, seat.gender)}`}
                    >
                      {seat.code}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs text-slate-500">
          <Legend className="bg-emerald-100" label="Boş" />
          <Legend className="bg-blue-200" label="Erkek (dolu)" />
          <Legend className="bg-pink-200" label="Kadın (dolu)" />
          <Legend className="bg-blue-600" label="Seçtiğiniz" />
        </div>
      </div>

      {/* Özet */}
      <aside className="h-fit rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 md:sticky md:top-24">
        <h3 className="font-bold text-brand">Seçim Özeti</h3>
        <div className="mt-3 min-h-[40px] text-sm">
          {selected.length === 0 ? (
            <p className="text-slate-400">Henüz koltuk seçmediniz.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((s) => (
                <span
                  key={s.code}
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${
                    s.gender === "K" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {s.code} · {genderLabel(s.gender)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm">
          <Row label="Koltuk" value={`${selected.length} adet`} />
          <Row label="Kişi başı" value={formatPrice(tour.price, tour.currency)} />
          <div className="flex items-center justify-between pt-2 text-base font-extrabold text-brand">
            <span>Toplam</span>
            <span className="text-accent">{formatPrice(total, tour.currency)}</span>
          </div>
        </div>
        <button
          disabled={selected.length === 0}
          onClick={goToCheckout}
          className="mt-5 w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          Devam Et
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-400">Güvenli ödeme • iyzico</p>
      </aside>

      {/* Cinsiyet seçim penceresi */}
      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPicking(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-slate-500">Koltuk</p>
            <p className="text-2xl font-extrabold text-brand">{picking}</p>
            <p className="mt-2 text-sm text-slate-600">Yolcunun cinsiyetini seçin</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => chooseGender("E")}
                className="rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                Erkek
              </button>
              <button
                onClick={() => chooseGender("K")}
                className="rounded-xl bg-pink-600 py-3 text-sm font-bold text-white transition hover:bg-pink-700"
              >
                Kadın
              </button>
            </div>
            <button
              onClick={() => setPicking(null)}
              className="mt-3 text-xs text-slate-400 hover:text-slate-600"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-4 w-4 rounded ${className}`} />
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-500">
      <span>{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
