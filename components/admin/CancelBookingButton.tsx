"use client";

import { useActionState, useRef, useState } from "react";
import { cancelBookingAction } from "@/lib/admin-actions";
import type { FormState } from "@/lib/form-state";

// Sık kullanılan iptal gerekçeleri. Görevli bir tanesine basınca metin alana
// yazılır ve ORADA DÜZENLENEBİLİR — şablon son söz değil, başlangıç noktası.
// Metin müşteriye aynen gittiği için iade süresi gibi taahhütler burada tek
// yerden yönetilsin diye sabit tutuluyor.
const REASON_TEMPLATES: { label: string; text: string }[] = [
  {
    label: "Hava koşulları",
    text:
      "Turumuz olumsuz hava koşulları nedeniyle iptal edilmiştir. " +
      "Ödemeniz iade sürecine alınmış olup, bankanıza bağlı olarak 7 iş günü içinde kartınıza yansıyacaktır. " +
      "Yaşanan aksaklık için özür diler, anlayışınız için teşekkür ederiz.",
  },
  {
    label: "Yeterli katılım yok",
    text:
      "Turumuz yeterli katılım sağlanamadığı için iptal edilmiştir. " +
      "Ödemeniz iade sürecine alınmış olup, bankanıza bağlı olarak 7 iş günü içinde kartınıza yansıyacaktır. " +
      "Dilerseniz başka bir kalkış tarihine ücretsiz geçiş yapabilirsiniz.",
  },
  {
    label: "Araç arızası",
    text:
      "Turumuz araç kaynaklı teknik bir sorun nedeniyle iptal edilmiştir. " +
      "Ödemeniz iade sürecine alınmış olup, bankanıza bağlı olarak 7 iş günü içinde kartınıza yansıyacaktır. " +
      "Yaşanan aksaklık için özür dileriz.",
  },
  {
    label: "Müşteri talebi",
    text:
      "Rezervasyonunuz talebiniz doğrultusunda iptal edilmiştir. " +
      "Ödemeniz iade sürecine alınmış olup, bankanıza bağlı olarak 7 iş günü içinde kartınıza yansıyacaktır.",
  },
];

// Rezervasyon iptali. Neden alanı zorunlu çünkü metin müşteriye giden
// e-postada aynen yer alıyor — görevli ne yazdığını görerek yazsın diye
// düğmeye basınca açılan bir panelde isteniyor.
export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
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

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-600">Hazır gerekçeler</p>
        <div className="flex flex-wrap gap-1.5">
          {REASON_TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              disabled={pending}
              onClick={() => {
                const field = reasonRef.current;
                if (!field) return;
                field.value = t.text;
                field.focus();
              }}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-brand hover:text-brand disabled:opacity-60"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-xs font-medium text-slate-600">
        İptal nedeni *
        <textarea
          ref={reasonRef}
          name="reason"
          required
          rows={4}
          placeholder="Hazır bir gerekçe seçin ya da kendiniz yazın."
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <p className="text-xs text-slate-500">
        Bu metin müşteriye gönderilecek iptal e-postasında aynen yer alır — seçtikten
        sonra üzerinde değişiklik yapabilirsiniz.
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
