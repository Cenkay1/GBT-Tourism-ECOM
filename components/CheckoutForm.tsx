"use client";

import { useState } from "react";
import {
  Gender,
  genderLabel,
  isValidId,
  isValidPhone,
} from "@/lib/shared";

export interface CheckoutTour {
  id: string;
  bookingType: string;
  category: string;
}

interface SeatPick {
  code: string;
  gender: Gender;
}

export interface CheckoutSummary {
  title: string;
  destination: string;
  departureLabel: string;
  priceLabel: string;
  totalLabel: string;
}

export default function CheckoutForm({
  tour,
  seats,
  quantity,
  action,
  summary,
  boardingPlaceId,
  boardingLabel,
  dropoffPlaceId,
  dropoffLabel,
}: {
  tour: CheckoutTour;
  seats: SeatPick[];
  quantity: number;
  action: (fd: FormData) => void;
  summary: CheckoutSummary;
  boardingPlaceId?: string;
  boardingLabel?: string;
  dropoffPlaceId?: string;
  dropoffLabel?: string;
}) {
  const isSeat = tour.bookingType === "KOLTUK";
  const count = isSeat ? seats.length : quantity;
  const allowPassport = tour.category === "YURT_DISI";

  // KONTENJAN için cinsiyet burada seçilir; KOLTUK için koltuk seçiminden gelir.
  const [genders, setGenders] = useState<(Gender | "")[]>(
    Array.from({ length: count }, (_, i) => (isSeat ? seats[i].gender : ""))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  function validate(fd: FormData): boolean {
    const errs: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      const first = (fd.get(`p_${i}_first`) as string)?.trim() ?? "";
      const last = (fd.get(`p_${i}_last`) as string)?.trim() ?? "";
      const id = (fd.get(`p_${i}_id`) as string)?.trim() ?? "";
      if (!first) errs[`p_${i}_first`] = "Ad zorunlu.";
      if (!last) errs[`p_${i}_last`] = "Soyad zorunlu.";
      if (!id) {
        errs[`p_${i}_id`] = allowPassport ? "TC veya pasaport no zorunlu." : "TC Kimlik No zorunlu.";
      } else if (!isValidId(id, allowPassport)) {
        errs[`p_${i}_id`] = allowPassport
          ? "Geçerli bir TC (11 hane) veya pasaport no girin."
          : "Geçerli bir TC Kimlik No girin (11 hane).";
      }
      if (!isSeat && !genders[i]) errs[`p_${i}_gender`] = "Cinsiyet seçin.";
    }
    const phone = (fd.get("contactPhone") as string)?.trim() ?? "";
    if (!isValidPhone(phone)) errs["contactPhone"] = "Geçerli bir telefon girin: 0(5xx) xxx xx xx";
    if (!((fd.get("contactName") as string)?.trim())) errs["contactName"] = "Ad soyad zorunlu.";
    const email = (fd.get("contactEmail") as string)?.trim() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs["contactEmail"] = "Geçerli bir e-posta girin.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    if (!validate(fd)) {
      e.preventDefault();
      // İlk hataya kaydır
      const first = document.querySelector("[data-error='1']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <input type="hidden" name="tourId" value={tour.id} />
      <input type="hidden" name="bookingType" value={tour.bookingType} />
      <input type="hidden" name="seatCodes" value={isSeat ? seats.map((s) => s.code).join(",") : ""} />
      <input type="hidden" name="quantity" value={String(quantity)} />
      {boardingPlaceId && <input type="hidden" name="boardingPlaceId" value={boardingPlaceId} />}
      {dropoffPlaceId && <input type="hidden" name="dropoffPlaceId" value={dropoffPlaceId} />}
      {genders.map((g, i) => (
        <input key={i} type="hidden" name={`p_${i}_gender`} value={g} />
      ))}

      <div className="space-y-6">
        {/* Yolcular */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-brand">Yolcular</h2>
          <div className="space-y-5">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-100 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">{i + 1}. Yolcu</span>
                  {isSeat ? (
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        seats[i].gender === "K"
                          ? "bg-pink-100 text-pink-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      Koltuk {seats[i].code} · {genderLabel(seats[i].gender)}
                    </span>
                  ) : (
                    <div className="flex gap-1.5">
                      {(["E", "K"] as Gender[]).map((gv) => (
                        <button
                          key={gv}
                          type="button"
                          onClick={() =>
                            setGenders((prev) => prev.map((x, idx) => (idx === i ? gv : x)))
                          }
                          className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                            genders[i] === gv
                              ? gv === "K"
                                ? "bg-pink-600 text-white"
                                : "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {genderLabel(gv)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!isSeat && errors[`p_${i}_gender`] && (
                  <p data-error="1" className="mb-2 text-xs text-red-600">
                    {errors[`p_${i}_gender`]}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field name={`p_${i}_first`} labelText="Ad *" input={input} label={label} error={errors[`p_${i}_first`]} />
                  <Field name={`p_${i}_last`} labelText="Soyad *" input={input} label={label} error={errors[`p_${i}_last`]} />
                  <Field
                    name={`p_${i}_id`}
                    labelText={allowPassport ? "TC / Pasaport No *" : "TC Kimlik No *"}
                    input={input}
                    label={label}
                    error={errors[`p_${i}_id`]}
                    inputMode="numeric"
                    maxLength={allowPassport ? 15 : 11}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* İletişim */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-brand">İletişim Bilgileri</h2>
          <p className="mb-4 text-xs text-slate-400">
            Biletiniz ve tur bilgileri bu adrese gönderilecektir.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="contactName" labelText="Ad Soyad *" input={input} label={label} error={errors["contactName"]} />
            <Field
              name="contactPhone"
              labelText="Telefon *"
              input={input}
              label={label}
              error={errors["contactPhone"]}
              placeholder="0(5xx) xxx xx xx"
              inputMode="tel"
            />
            <Field name="contactEmail" labelText="E-posta *" input={input} label={label} error={errors["contactEmail"]} type="email" />
          </div>
        </section>
      </div>

      {/* Özet */}
      <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm lg:sticky lg:top-24">
        <h2 className="font-bold text-brand">Özet</h2>
        <div className="mt-3 border-b border-slate-100 pb-3">
          <p className="font-semibold text-slate-800">{summary.title}</p>
          <p className="text-xs text-slate-400">{summary.destination}</p>
          <p className="mt-1 text-xs text-slate-500">Kalkış: {summary.departureLabel}</p>
          {boardingLabel && (
            <p className="text-xs text-slate-500">Biniş: {boardingLabel}</p>
          )}
          {dropoffLabel && (
            <p className="text-xs text-slate-500">İniş: {dropoffLabel}</p>
          )}
        </div>
        <div className="mt-3 space-y-1 text-sm text-slate-500">
          {isSeat ? (
            <SummaryRow label="Koltuklar" value={seats.map((s) => s.code).join(", ")} />
          ) : (
            <SummaryRow label="Kişi" value={`${quantity} kişi`} />
          )}
          <SummaryRow label="Kişi başı" value={summary.priceLabel} />
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-base font-extrabold text-brand">
          <span>Toplam</span>
          <span className="text-accent">{summary.totalLabel}</span>
        </div>
        <button className="mt-5 w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition hover:bg-accent-dark">
          Ödemeye Geç
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Koltuklarınız ödeme tamamlanana kadar 15 dk süreyle size ayrılır.
        </p>
      </aside>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}

function Field({
  name,
  labelText,
  input,
  label,
  error,
  type = "text",
  placeholder,
  inputMode,
  maxLength,
}: {
  name: string;
  labelText: string;
  input: string;
  label: string;
  error?: string;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
  maxLength?: number;
}) {
  return (
    <label className={label}>
      {labelText}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        data-error={error ? "1" : undefined}
        className={`${input} ${error ? "border-red-400" : ""}`}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
