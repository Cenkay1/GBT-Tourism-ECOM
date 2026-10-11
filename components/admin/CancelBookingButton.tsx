"use client";

import { useActionState, useState } from "react";
import { cancelBookingAction } from "@/lib/admin-actions";
import type { FormState } from "@/lib/form-state";

// Rezervasyon iptali. Neden alanı zorunlu çünkü metin müşteriye giden
// e-postada aynen yer alıyor — görevli ne yazdığını görerek yazsın diye
// düğmeye basınca açılan bir panelde isteniyor.
export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    cancelBookingAction,
    {}
  );

  if (state.ok) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        {state.message}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        İptal et
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2 rounded-lg border border-red-100 bg-red-50/50 p-3">
      <input type="hidden" name="bookingId" value={bookingId} />

      <label className="block text-xs font-medium text-slate-600">
        İptal nedeni *
        <textarea
          name="reason"
          required
          rows={3}
          placeholder="Örn. Hava koşulları nedeniyle sefer iptal edilmiştir."
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <p className="text-xs text-slate-500">
        Bu metin müşteriye gönderilecek iptal e-postasında aynen yer alır.
      </p>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button
          disabled={pending}
          className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "İptal ediliyor…" : "İptal Et ve Müşteriye Bildir"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white disabled:opacity-60"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
