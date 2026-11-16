"use client";

// Kampanya kuponu oluşturma. Puan karşılığı DEĞİL — müşterinin kendi puan
// çevirisi Hesabım → Puanlarım'dan yapılıyor.
import { useActionState, useState } from "react";
import { createCouponAction } from "@/lib/admin-actions";
import type { FormState } from "@/lib/form-state";

export default function CouponForm({
  userId,
  userLabel,
}: {
  // Belirli bir üyeye kupon veriliyorsa (üye detay sayfasından).
  userId?: string;
  userLabel?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createCouponAction,
    {}
  );
  const [open, setOpen] = useState(Boolean(userId));
  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-accent-dark"
      >
        Kupon Oluştur
      </button>
    );
  }

  return (
    <form action={action} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-brand">
          {userId ? `Kupon ver — ${userLabel ?? "üye"}` : "Yeni Kampanya Kuponu"}
        </h2>
        {!userId && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Kapat
          </button>
        )}
      </div>

      {state.message && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      {userId && <input type="hidden" name="userId" value={userId} />}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-600">
          Tutar (₺)
          <input
            name="amount"
            type="number"
            min={1}
            required
            defaultValue={100}
            className={input}
          />
        </label>
        <label className="block text-sm font-medium text-slate-600">
          Geçerlilik (gün)
          <input
            name="expiresInDays"
            type="number"
            min={0}
            defaultValue={0}
            className={input}
          />
          <span className="mt-1 block text-xs text-slate-400">0 = süresiz</span>
        </label>
        <label className="block text-sm font-medium text-slate-600">
          Not
          <input name="note" className={input} placeholder="Kampanya adı / gerekçe" />
        </label>
      </div>

      {!userId && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Üye seçilmediği için kuponu <strong>kodu bilen herkes</strong>
          kullanabilir. Belirli bir müşteriye vermek için üye detay sayfasındaki
          kupon formunu kullanın.
        </p>
      )}

      <button
        disabled={pending}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:opacity-50"
      >
        {pending ? "Oluşturuluyor…" : "Kuponu Oluştur"}
      </button>
    </form>
  );
}
