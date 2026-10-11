"use client";

import { useActionState } from "react";
import { refundBooking } from "@/lib/payment-actions";
import type { FormState } from "@/lib/form-state";

// Ödenmiş rezervasyonun iyzico üzerinden iadesi. Para hareketi geri alınamaz,
// bu yüzden gönderim öncesi onay istenir.
export default function RefundButton({
  bookingId,
  amountLabel,
}: {
  bookingId: string;
  amountLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(refundBooking, {});

  return (
    <div className="space-y-2">
      {state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      {!state.ok && (
        <form
          action={action}
          onSubmit={(e) => {
            if (
              !confirm(
                `${amountLabel} tutarı müşterinin kartına iade edilecek ve rezervasyon iptale alınacak. Bu işlem geri alınamaz. Devam edilsin mi?`
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="bookingId" value={bookingId} />
          <button
            disabled={pending}
            className="w-full rounded-lg border border-red-200 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            {pending ? "İade ediliyor…" : "iyzico'dan İade Et"}
          </button>
        </form>
      )}
    </div>
  );
}
