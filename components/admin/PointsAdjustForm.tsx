"use client";

// Üyenin puanını elle ekle/çıkar. Her değişiklik puan defterine
// "DUZELTME" satırı olarak yazılır (defter toplamı = bakiye kuralı).
import { useActionState, useState } from "react";
import { adjustPointsAction } from "@/lib/admin-actions";
import { POINTS_PER_LIRA } from "@/lib/coupons-limits";
import type { FormState } from "@/lib/form-state";

export default function PointsAdjustForm({
  userId,
  currentPoints,
}: {
  userId: string;
  currentPoints: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    adjustPointsAction,
    {}
  );
  const [delta, setDelta] = useState(0);
  const next = Math.max(0, currentPoints + delta);

  return (
    <form action={action} className="rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="font-bold text-brand">Puan Düzenle</h3>
      <p className="mt-1 text-xs text-slate-500">
        Eklenen puan ömür boyu puana da yazılır ve kademeyi yükseltebilir.
        Düşme kademeyi geri almaz.
      </p>

      {state.message && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.error}
        </p>
      )}

      <input type="hidden" name="userId" value={userId} />

      <div className="mt-3 space-y-3">
        <label className="block text-sm font-medium text-slate-600">
          Puan değişimi
          <input
            name="delta"
            type="number"
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="Örn. 500 veya -200"
          />
          <span className="mt-1 block text-xs text-slate-400">
            Eklemek için pozitif, düşmek için negatif yazın.
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-600">
          Gerekçe
          <input
            name="note"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="Telefon kampanyası, özür puanı…"
          />
        </label>
      </div>

      {delta !== 0 && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {currentPoints.toLocaleString("tr-TR")} → <strong>{next.toLocaleString("tr-TR")}</strong>{" "}
          puan (≈ {Math.floor(next / POINTS_PER_LIRA).toLocaleString("tr-TR")} ₺ kupon)
        </p>
      )}

      <button
        disabled={pending || delta === 0}
        className="mt-4 w-full rounded-lg bg-brand py-2 text-sm font-bold text-white transition enabled:hover:bg-brand/90 disabled:opacity-40"
      >
        {pending ? "İşleniyor…" : "Puanı Güncelle"}
      </button>
    </form>
  );
}
