"use client";

// Dolu sefer için yedek liste formu.
//
// Koltuk seçimi ve ödeme YOK — yalnız iletişim bilgisi ve kişi sayısı. Form
// müşteriye bunun bir rezervasyon OLMADIĞINI açıkça söyler; aksi halde
// "yazıldım" diyen müşteri otogara gelir.
import { useActionState } from "react";
import { submitWaitlist } from "@/lib/waitlist-actions";
import { WAITLIST_MAX_QUANTITY } from "@/lib/waitlist-limits";
import type { FormState } from "@/lib/form-state";

export default function WaitlistForm({
  tourId,
  departureId,
  waiting,
}: {
  tourId: string;
  departureId?: string | null;
  // Bu seferde yedek listede bekleyen kişi sayısı — müşteri sıranın
  // uzunluğunu görsün.
  waiting?: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    submitWaitlist,
    {}
  );
  const fe = state.fieldErrors ?? {};
  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";

  if (state.ok) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
        <p className="text-3xl">📋</p>
        <h3 className="mt-2 font-bold text-brand">Yedek listeye alındınız</h3>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <input type="hidden" name="tourId" value={tourId} />
      <input type="hidden" name="departureId" value={departureId ?? ""} />

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-brand">Bu sefer doldu</h3>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Yer kalmadı
        </span>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        Yedek listeye yazılın: yer açıldığında ya da yeterli talep üzerine ek araç
        ayarlandığında sizi arayalım. <strong>Şimdi ödeme alınmaz.</strong>
      </p>
      {typeof waiting === "number" && waiting > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Bu sefer için şu anda {waiting} kişi yedek listede bekliyor.
        </p>
      )}

      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-slate-600">
          Ad Soyad
          <input name="contactName" required className={input} placeholder="Ad Soyad" />
          {fe.contactName && (
            <span className="mt-1 block text-xs text-red-600">{fe.contactName}</span>
          )}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-600">
            Telefon
            <input
              name="contactPhone"
              required
              className={input}
              placeholder="0(5xx) xxx xx xx"
            />
            {fe.contactPhone && (
              <span className="mt-1 block text-xs text-red-600">{fe.contactPhone}</span>
            )}
          </label>
          <label className="block text-sm font-medium text-slate-600">
            E-posta
            <input
              name="contactEmail"
              type="email"
              required
              className={input}
              placeholder="ornek@eposta.com"
            />
            {fe.contactEmail && (
              <span className="mt-1 block text-xs text-red-600">{fe.contactEmail}</span>
            )}
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-600">
          Kaç kişi?
          <select name="quantity" defaultValue="1" className={input}>
            {Array.from({ length: WAITLIST_MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} kişi
              </option>
            ))}
          </select>
          {fe.quantity && (
            <span className="mt-1 block text-xs text-red-600">{fe.quantity}</span>
          )}
        </label>
        <label className="block text-sm font-medium text-slate-600">
          Notunuz (isteğe bağlı)
          <textarea
            name="note"
            rows={2}
            maxLength={500}
            className={input}
            placeholder="Örn. başka tarihe de açığız"
          />
        </label>
      </div>

      <button
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Gönderiliyor…" : "Yedek Listeye Yazıl"}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Bu bir rezervasyon değildir, yer garantisi vermez.
      </p>
    </form>
  );
}
