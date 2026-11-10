"use client";

// Hesabım → Kişilerim. Kayıtlı yolcuları listeler, ekler, düzenler, siler.
//
// Kaydedilen bilgiler rezervasyon formunda listeden seçilip otomatik dolar.
// Silme KVKK gereği her zaman erişilebilir olmalı — bu yüzden her satırda
// doğrudan bir "Sil" düğmesi var, menü arkasına saklanmıyor.

import { useActionState, useState } from "react";
import { saveMyPassenger, deleteMyPassenger } from "@/lib/passenger-actions";
import type { FormState } from "@/lib/form-state";
import type { SavedPassengerView } from "@/lib/saved-passengers";
import { COUNTRIES } from "@/lib/countries";
import { genderLabel } from "@/lib/shared";

export default function SavedPassengersManager({
  passengers,
}: {
  passengers: SavedPassengerView[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveMyPassenger,
    {}
  );
  // Düzenlenen kayıt (null = yeni kişi formu kapalı).
  const [editing, setEditing] = useState<SavedPassengerView | null>(null);
  const [open, setOpen] = useState(false);
  const [nat, setNat] = useState<"TC" | "FOREIGN">("TC");

  function startNew() {
    setEditing(null);
    setNat("TC");
    setOpen(true);
  }

  function startEdit(p: SavedPassengerView) {
    setEditing(p);
    setNat(p.nationality);
    setOpen(true);
  }

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-brand">Kişilerim</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Sık seyahat ettiğiniz kişileri kaydedin; rezervasyon yaparken listeden
            seçtiğinizde ad, soyad, kimlik no ve doğum tarihi otomatik dolar.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark"
        >
          + Kişi Ekle
        </button>
      </div>

      {state.message && !open && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {state.message}
        </p>
      )}

      {/* Liste */}
      {passengers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            Henüz kayıtlı kişiniz yok. Rezervasyon sırasında &quot;Bu kişiyi hesabıma
            kaydet&quot; kutusunu işaretleyerek ya da yukarıdaki düğmeyle ekleyebilirsiniz.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {passengers.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">
                  {p.firstName} {p.lastName}
                  {p.isSelf && (
                    <span className="ml-2 rounded-md bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">
                      Ben
                    </span>
                  )}
                  {p.label && (
                    <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      {p.label}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[
                    p.idNumber
                      ? `${p.nationality === "FOREIGN" ? "Pasaport" : "TC"}: ${p.idNumber}`
                      : null,
                    p.birthDate
                      ? new Date(p.birthDate).toLocaleDateString("tr-TR")
                      : null,
                    p.gender ? genderLabel(p.gender) : null,
                    p.nationality === "FOREIGN" ? p.country || "Yabancı uyruklu" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Ek bilgi girilmemiş"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Düzenle
                </button>
                <form
                  action={async () => {
                    await deleteMyPassenger(p.id);
                  }}
                  onSubmit={(e) => {
                    if (
                      !confirm(
                        `${p.firstName} ${p.lastName} kaydını silmek istediğinize emin misiniz? Geçmiş rezervasyonlarınız etkilenmez.`
                      )
                    )
                      e.preventDefault();
                  }}
                >
                  <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                    Sil
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Ekle / düzenle formu */}
      {open && (
        <form
          action={action}
          className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5"
          // Kaydetme başarılıysa formu kapat; hata varsa açık kalsın ki
          // müşteri girdiği bilgiyi kaybetmesin.
          onSubmit={() => {
            setTimeout(() => setOpen(false), 0);
          }}
        >
          <h3 className="font-bold text-brand">
            {editing ? "Kişiyi Düzenle" : "Yeni Kişi"}
          </h3>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <input type="hidden" name="nationality" value={nat} />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Ad *
              <input
                name="firstName"
                required
                defaultValue={editing?.firstName}
                className={input}
              />
            </label>
            <label className={label}>
              Soyad *
              <input
                name="lastName"
                required
                defaultValue={editing?.lastName}
                className={input}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Uyruk:</span>
            {(
              [
                ["TC", "T.C. Vatandaşı"],
                ["FOREIGN", "Yabancı Uyruklu"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setNat(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  nat === v ? "bg-brand text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={label}>
              {nat === "FOREIGN" ? "Pasaport No" : "TC Kimlik No"}
              <input
                name="idNumber"
                inputMode={nat === "FOREIGN" ? "text" : "numeric"}
                maxLength={nat === "FOREIGN" ? 15 : 11}
                defaultValue={editing?.idNumber}
                className={input}
              />
            </label>
            <label className={label}>
              Doğum Tarihi
              <input
                name="birthDate"
                type="date"
                defaultValue={editing?.birthDate}
                className={input}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Cinsiyet
              <select name="gender" defaultValue={editing?.gender ?? ""} className={input}>
                <option value="">Seçilmedi</option>
                <option value="E">{genderLabel("E")}</option>
                <option value="K">{genderLabel("K")}</option>
              </select>
            </label>
            {nat === "FOREIGN" ? (
              <label className={label}>
                Ülke
                <select name="country" defaultValue={editing?.country ?? ""} className={input}>
                  <option value="">Ülke seçin</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className={label}>
                Not <span className="text-slate-400">(opsiyonel)</span>
                <input
                  name="label"
                  placeholder="Eşim, Oğlum…"
                  maxLength={40}
                  defaultValue={editing?.label}
                  className={input}
                />
              </label>
            )}
          </div>

          {nat === "FOREIGN" && (
            <label className={`${label} mt-4 block`}>
              Not <span className="text-slate-400">(opsiyonel)</span>
              <input
                name="label"
                placeholder="Eşim, Oğlum…"
                maxLength={40}
                defaultValue={editing?.label}
                className={input}
              />
            </label>
          )}

          <label className="mt-4 flex items-start gap-2.5 text-sm text-slate-600">
            <input
              type="checkbox"
              name="isSelf"
              defaultChecked={editing?.isSelf}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              Bu kişi benim
              <span className="mt-0.5 block text-xs text-slate-400">
                İşaretlerseniz listede en üstte görünür ve rezervasyonlarda kolayca
                seçilir.
              </span>
            </span>
          </label>

          {state.error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              disabled={pending}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {pending ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Vazgeç
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Bu bilgiler yalnızca sizin hesabınızda saklanır ve rezervasyon formunu
            doldurmak için kullanılır. Dilediğiniz zaman silebilirsiniz; silmek geçmiş
            rezervasyonlarınızı etkilemez.
          </p>
        </form>
      )}
    </div>
  );
}
