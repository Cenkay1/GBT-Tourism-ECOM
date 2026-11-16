"use client";

// Puanı indirim kuponuna çevirme kartı.
//
// Kur ekranda AÇIKÇA yazıyor: müşteri "10.000 puanım var" görüp 10.000 ₺
// beklemesin — 100 puan 1 ₺ ediyor.
import { useActionState, useState } from "react";
import { redeemPointsAction } from "@/lib/coupon-actions";
import { POINTS_PER_LIRA, MIN_REDEEM_POINTS } from "@/lib/coupons-limits";
import type { FormState } from "@/lib/form-state";
import { GiftIcon } from "@/components/Icons";

export default function RedeemPointsCard({ points }: { points: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    redeemPointsAction,
    {}
  );
  // Çevrilebilir en büyük tutar: bakiyenin tam TL'ye denk gelen kısmı.
  const maxLira = Math.floor(points / POINTS_PER_LIRA);
  const [lira, setLira] = useState(maxLira > 0 ? Math.min(maxLira, 10) : 0);
  const pointsNeeded = lira * POINTS_PER_LIRA;

  if (maxLira < 1) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 font-bold text-brand">
          <GiftIcon width={18} height={18} /> Puanı Kupona Çevir
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Kupon oluşturmak için en az {MIN_REDEEM_POINTS.toLocaleString("tr-TR")} puan
          gerekiyor ({MIN_REDEEM_POINTS} puan = 1 ₺). Şu anki bakiyeniz{" "}
          {points.toLocaleString("tr-TR")} puan.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-xl bg-white p-5 shadow-sm">
      <p className="flex items-center gap-2 font-bold text-brand">
        <GiftIcon width={18} height={18} /> Puanı Kupona Çevir
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {POINTS_PER_LIRA} puan = 1 ₺. Kupon tek kullanımlıktır ve ödeme adımında
        girilir; artan tutar iade edilmez.
      </p>

      {state.message && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <input type="hidden" name="points" value={pointsNeeded} />

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-600">
          Kupon tutarı (₺)
          <input
            type="number"
            min={1}
            max={maxLira}
            value={lira}
            onChange={(e) =>
              setLira(Math.max(0, Math.min(maxLira, Number(e.target.value) || 0)))
            }
            className="mt-1 w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <button
          type="button"
          onClick={() => setLira(maxLira)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Tümü ({maxLira} ₺)
        </button>
        <button
          disabled={pending || lira < 1}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:opacity-40"
        >
          {pending ? "Çevriliyor…" : "Kupon Oluştur"}
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {pointsNeeded.toLocaleString("tr-TR")} puan düşülecek · kalan{" "}
        {(points - pointsNeeded).toLocaleString("tr-TR")} puan
      </p>
    </form>
  );
}
