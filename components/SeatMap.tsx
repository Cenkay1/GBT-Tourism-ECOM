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
  orderedStops,
  segmentPrice,
} from "@/lib/shared";
import { BusIcon } from "@/components/Icons";
import BoardingSelector from "@/components/BoardingSelector";

const MAX_SEATS = 6;

interface Picked {
  code: string;
  gender: Gender;
}

export default function SeatMap({
  tour,
  initialFrom = null,
  initialTo = null,
}: {
  tour: Tour;
  initialFrom?: string | null;
  initialTo?: string | null;
}) {
  const rows = useMemo(() => buildSeatGrid(tour), [tour]);
  const [selected, setSelected] = useState<Picked[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  const [warning, setWarning] = useState<string>("");
  const router = useRouter();

  const layout = tour.seatLayout ?? "2+2";
  const takenGenders = tour.seatGenders ?? {};

  // Biniş/iniş durakları (sıralı) — seçime göre kişi başı fiyat değişir.
  const stops = orderedStops(tour.places ?? []);
  const isSefer = tour.type === "SEFER";
  const [boardingId, setBoardingId] = useState<string | null>(
    initialFrom ?? (stops.length ? stops[0].id : null)
  );
  const [dropoffId, setDropoffId] = useState<string | null>(initialTo ?? null);

  // Sefer: her ikisi de seçiliyse direkt koltuğa; tur: durak yoksa direkt koltuğa.
  const canPreselect = isSefer
    ? Boolean(initialFrom && initialTo)
    : stops.length === 0;
  const [step, setStep] = useState<1 | 2>(canPreselect ? 2 : 1);

  const fromIdx = stops.findIndex((s) => s.id === boardingId);
  const toIdx = stops.findIndex((s) => s.id === dropoffId);
  const boardingStop = stops[fromIdx];
  const dropoffStop = stops[toIdx];

  const unitPrice = isSefer
    ? fromIdx >= 0 && toIdx > fromIdx
      ? segmentPrice(tour.segmentPrices, fromIdx, toIdx, tour.price)
      : tour.price
    : boardingStop?.price ?? tour.price;

  // Sefer'de Adım 1'i geçmek için geçerli from<to şart.
  const routeReady = isSefer ? fromIdx >= 0 && toIdx > fromIdx : true;

  function isSelected(code: string) {
    return selected.some((s) => s.code === code);
  }

  function onSeatClick(code: string, status: string) {
    setWarning("");
    if (status === "SATILDI" || status === "BLOKE") return;
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
    if (boardingId) params.set("durak", boardingId);
    if (isSefer && dropoffId) params.set("inis", dropoffId);
    router.push(`/rezervasyon?${params}`);
  }

  const total = selected.length * unitPrice;

  function seatClasses(code: string, status: string, gender?: Gender | null) {
    if (isSelected(code)) {
      const g = selected.find((s) => s.code === code)!.gender;
      return g === "K" ? "bg-pink-600 text-white" : "bg-blue-600 text-white";
    }
    if (status === "BLOKE") {
      return "cursor-not-allowed bg-slate-200 text-slate-400 line-through";
    }
    if (status === "SATILDI") {
      if (gender === "K") return "cursor-not-allowed bg-pink-200 text-pink-700";
      if (gender === "E") return "cursor-not-allowed bg-blue-200 text-blue-800";
      return "cursor-not-allowed bg-slate-300 text-slate-500";
    }
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
  }

  return (
    <div className="space-y-6">
      {step === 1 ? (
        <div className="space-y-4">
          {isSefer ? (
            <>
              <StopList
                title="Nereden bineceksiniz?"
                stops={stops.slice(0, Math.max(0, stops.length - 1))}
                value={boardingId}
                onChange={(id) => {
                  setBoardingId(id);
                  const fi = stops.findIndex((s) => s.id === id);
                  const ti = stops.findIndex((s) => s.id === dropoffId);
                  if (ti <= fi) setDropoffId(null);
                }}
              />
              <StopList
                title="Nereye ineceksiniz?"
                stops={stops.filter((_, i) => i > fromIdx)}
                value={dropoffId}
                onChange={setDropoffId}
              />
              {routeReady && (
                <div className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">
                      {boardingStop?.name} → {dropoffStop?.name}
                    </span>
                    <span className="font-bold text-accent">
                      {formatPrice(unitPrice, tour.currency)} / kişi
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <BoardingSelector
              places={tour.places ?? []}
              value={boardingId}
              onChange={setBoardingId}
              basePrice={tour.price}
              currency={tour.currency}
            />
          )}
          <button
            type="button"
            disabled={!routeReady}
            onClick={() => setStep(2)}
            className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            İleri — Koltuk Seç
          </button>
          {isSefer && !routeReady && (
            <p className="text-center text-xs text-slate-400">
              Devam etmek için nereden ve nereye seçin.
            </p>
          )}
        </div>
      ) : (
      <div className="space-y-6">
      {(isSefer || stops.length > 0) && (
        <button
          type="button"
          onClick={() => setStep(1)}
          className="text-sm font-semibold text-brand hover:underline"
        >
          ← Güzergâhı değiştir
          {isSefer && boardingStop && dropoffStop
            ? ` (${boardingStop.name} → ${dropoffStop.name})`
            : boardingStop
            ? ` (${boardingStop.name})`
            : ""}
        </button>
      )}
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
                      disabled={seat.status === "SATILDI" || seat.status === "BLOKE"}
                      title={
                        seat.status === "BLOKE"
                          ? `${seat.code} — satışa kapalı`
                          : seat.status === "SATILDI"
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
          <Legend className="bg-slate-200" label="Kapalı" />
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
          {boardingStop && <Row label="Biniş" value={boardingStop.name} />}
          {isSefer && dropoffStop && <Row label="İniş" value={dropoffStop.name} />}
          <Row label="Kişi başı" value={formatPrice(unitPrice, tour.currency)} />
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
      </div>
      )}
    </div>
  );
}

function StopList({
  title,
  stops,
  value,
  onChange,
}: {
  title: string;
  stops: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h3 className="font-bold text-brand">{title}</h3>
      <div className="mt-3 flex flex-col gap-2">
        {stops.length === 0 ? (
          <p className="text-sm text-slate-400">Önce nereden seçin.</p>
        ) : (
          stops.map((s) => {
            const active = value === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(s.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left transition ${
                  active ? "border-accent bg-accent/10" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active ? "border-accent" : "border-slate-300"
                  }`}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                </span>
                <span className="text-sm font-semibold text-slate-700">{s.name}</span>
              </button>
            );
          })
        )}
      </div>
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
