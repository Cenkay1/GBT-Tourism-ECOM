"use client";

import { useActionState } from "react";
import { retryInvoice } from "@/lib/invoice-actions";
import type { FormState } from "@/lib/form-state";

// Fatura boru hattını elle yeniden tetikler. Yanlış zamanda (fatura zaten
// kesilmiş/gönderilmişken, ya da hâlâ aktif işlenirken) tıklanırsa müşteriye
// ikinci bir fatura maili gidebilir — bu yüzden RefundButton'daki desenle
// aynı şekilde, geri alınamaz olabilecek bu adımdan önce onay istenir.
export default function InvoiceRetryButton({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    retryInvoice,
    {}
  );

  return (
    <form
      action={action}
      className="mt-3"
      onSubmit={(e) => {
        if (
          !confirm(
            "Fatura yeniden işlenecek. Fatura zaten kesilmiş veya müşteriye gönderilmişse bu işlem ikinci bir fatura e-postası ya da belge oluşmasına yol açabilir. Devam edilsin mi?"
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <button
        disabled={pending}
        className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Deneniyor…" : "Yeniden dene"}
      </button>
      {state.error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
