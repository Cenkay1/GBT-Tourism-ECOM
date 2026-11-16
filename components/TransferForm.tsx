"use client";

// Devir formu — müşteri (/hesabim) ve admin panelinde AYNI bileşen.
//
// Fark: admin'e "başka tura devret" seçeneği açılıyor ve not alanı var.
// Kurallar iki tarafta da aynı (lib/transfer.ts) — tek fark yetki kapsamı.
import { useActionState, useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import { genderLabel, type Gender } from "@/lib/shared";
import type { FormState } from "@/lib/form-state";

export interface TransferPassengerOption {
  id: string;
  label: string; // "1A · Ali Veli"
  seatCode: string | null;
  ageBandLabel: string;
}

export interface TransferTourOption {
  id: string;
  title: string;
  departures: { id: string; label: string }[];
}

interface TransferState extends FormState {
  suggestedSeats?: string[];
  priceDifference?: number;
}

export default function TransferForm({
  bookingId,
  passengers,
  action,
  tours,
  showNote = false,
}: {
  bookingId: string;
  passengers: TransferPassengerOption[];
  action: (prev: TransferState, fd: FormData) => Promise<TransferState>;
  // Verilirse "başka tura devret" seçeneği açılır (admin).
  tours?: TransferTourOption[];
  showNote?: boolean;
}) {
  const [state, formAction, pending] = useActionState<TransferState, FormData>(action, {});
  const [passengerId, setPassengerId] = useState(passengers[0]?.id ?? "");
  const [gender, setGender] = useState<Gender>("E");
  const [nationality, setNationality] = useState<"TC" | "FOREIGN">("TC");
  const [newSeat, setNewSeat] = useState("");
  const [targetTourId, setTargetTourId] = useState("");

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";
  const targetTour = tours?.find((t) => t.id === targetTourId);

  if (state.ok) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
        <p className="text-3xl">✅</p>
        <h3 className="mt-2 font-bold text-brand">Devir tamamlandı</h3>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h3 className="font-bold text-brand">Rezervasyonu Devret</h3>
      <p className="mt-1 text-xs text-slate-500">
        Devredilen kişiye bilet bilgileri e-posta ile gönderilir. Devir
        tamamlandıktan sonra bu yer için seyahat hakkı yeni kişiye geçer.
      </p>

      {state.error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
          {state.suggestedSeats && state.suggestedSeats.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold">Uygun boş koltuklar:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {state.suggestedSeats.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewSeat(c)}
                    className={`rounded-md px-2 py-1 text-xs font-bold transition ${
                      newSeat === c
                        ? "bg-brand text-white"
                        : "bg-white text-brand ring-1 ring-brand/30 hover:bg-slate-50"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-red-700">
                Bir koltuk seçip formu yeniden gönderin.
              </p>
            </div>
          )}
        </div>
      )}

      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="newSeatCode" value={newSeat} />

      <div className="mt-4 space-y-4">
        <label className={label}>
          Devredilecek yolcu
          <select
            name="passengerId"
            value={passengerId}
            onChange={(e) => setPassengerId(e.target.value)}
            required
            className={input}
          >
            {passengers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.ageBandLabel})
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-400">
            Devredilen kişinin yaş grubu aynı olmalı — fiyat değişirse devir yapılamaz.
          </span>
        </label>

        {tours && tours.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-3">
            <label className={label}>
              Başka tura devret (isteğe bağlı)
              <select
                name="targetTourId"
                value={targetTourId}
                onChange={(e) => setTargetTourId(e.target.value)}
                className={input}
              >
                <option value="">Aynı turda kalsın</option>
                {tours.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            {targetTour && (
              <label className={`${label} mt-3`}>
                Hedef sefer
                <select name="targetDepartureId" required className={input}>
                  <option value="">Sefer seçin</option>
                  {targetTour.departures.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-amber-700">
                  Fiyat farkı oluşursa borç ya da iade olarak işlenir; devir
                  sonrası ekranda görünür.
                </span>
              </label>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Ad
            <input name="firstName" required className={input} />
          </label>
          <label className={label}>
            Soyad
            <input name="lastName" required className={input} />
          </label>
          <label className={label}>
            E-posta
            <input name="email" type="email" required className={input} />
          </label>
          <label className={label}>
            Telefon
            <input name="phone" required className={input} placeholder="0(5xx) xxx xx xx" />
          </label>
          <label className={label}>
            Doğum tarihi
            <input
              name="birthDate"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              className={input}
            />
          </label>
          <label className={label}>
            Cinsiyet
            <select
              name="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
              className={input}
            >
              <option value="E">{genderLabel("E")}</option>
              <option value="K">{genderLabel("K")}</option>
            </select>
          </label>
          <label className={label}>
            Uyruk
            <select
              name="nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value as "TC" | "FOREIGN")}
              className={input}
            >
              <option value="TC">T.C. vatandaşı</option>
              <option value="FOREIGN">Yabancı uyruklu</option>
            </select>
          </label>
          <label className={label}>
            {nationality === "FOREIGN" ? "Pasaport No" : "TC Kimlik No"}
            <input name="idNumber" required className={input} />
          </label>
          {nationality === "FOREIGN" && (
            <label className={`${label} sm:col-span-2`}>
              Ülke
              <select name="country" required className={input}>
                <option value="">Ülke seçin</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {showNote && (
          <label className={label}>
            Görevli notu (yalnız panelde görünür)
            <input name="note" className={input} />
          </label>
        )}
      </div>

      <button
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:opacity-50"
      >
        {pending ? "Devir yapılıyor…" : "Deviri Tamamla"}
      </button>
    </form>
  );
}
