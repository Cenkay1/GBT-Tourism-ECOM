"use client";

// Devir fiyat farkını kapatma formu.
//
// Borçta: tahsilat defterine artı satır yazılır ve hedef rezervasyonun
// bakiyesi kapanır. İadede: para hareketini görevli banka/iyzico üzerinden
// yapar, burada defterde eksi satır olarak kayda geçirilir.
import { useActionState } from "react";
import { settleTransferAction } from "@/lib/admin-actions";
import { PAYMENT_METHODS } from "@/lib/shared";
import type { FormState } from "@/lib/form-state";

export default function TransferSettleForm({
  transferId,
  amount,
  isRefund,
}: {
  transferId: string;
  amount: number;
  isRefund: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    settleTransferAction,
    {}
  );

  if (state.ok)
    return (
      <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        {state.message}
      </p>
    );

  return (
    <form action={action} className="mt-3 border-t border-slate-200 pt-3">
      <input type="hidden" name="transferId" value={transferId} />
      {state.error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.error}
        </p>
      )}
      <p className="text-xs text-slate-600">
        {isRefund ? (
          <>
            Müşteriye <strong>{Math.abs(amount).toLocaleString("tr-TR")} ₺</strong> iade
            edilecek. Parayı banka/iyzico üzerinden gönderdikten sonra buradan
            işaretleyin — kasa kaydına eksi satır düşer.
          </>
        ) : (
          <>
            Müşteriden <strong>{amount.toLocaleString("tr-TR")} ₺</strong> tahsil
            edilecek. Tahsilatı aldıktan sonra yöntemi seçip kaydedin.
          </>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-600">
          Yöntem
          <select
            name="method"
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand"
          >
            {(["NAKIT", "HAVALE", "KREDI_KARTI"] as const).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHODS[m].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-xs font-medium text-slate-600">
          Not
          <input
            name="note"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand"
            placeholder={isRefund ? "İade referansı" : "Tahsilat notu"}
          />
        </label>
        <button
          disabled={pending}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white transition enabled:hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? "İşleniyor…" : isRefund ? "İadeyi İşaretle" : "Tahsilatı Kaydet"}
        </button>
      </div>
    </form>
  );
}
