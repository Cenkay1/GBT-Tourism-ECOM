"use client";

// "Tatil & Otel" bize ulaşın formu — ad, soyad, telefon.
// Gönderim sonucu aynı kartta gösterilir; başarıda form yerine teşekkür
// mesajı kalır (müşteri aynı talebi tekrar göndermeye çalışmasın).

import { useActionState } from "react";
import { submitHotelInquiry } from "@/lib/inquiry-actions";
import type { FormState } from "@/lib/form-state";
import { COMPANY, telHref, whatsappHref } from "@/lib/company";

export default function HotelInquiryForm({
  compact = false,
}: {
  // Ana sayfadaki bölümde başlık dışarıda duruyor; sayfada kendi başlığı var.
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    submitHotelInquiry,
    {}
  );

  const input =
    "mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";
  const err = "mt-1 block text-xs font-medium text-red-600";

  if (state.ok) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-200">
        <p className="text-base font-bold text-emerald-800">Talebiniz alındı 🎉</p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-900">{state.message}</p>
        <p className="mt-4 text-xs text-emerald-800">
          Acele ediyorsanız bizi hemen arayabilirsiniz:{" "}
          <a href={telHref(COMPANY.phones[0])} className="font-bold underline">
            {COMPANY.phones[0]}
          </a>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      {!compact && (
        <>
          <h3 className="text-lg font-extrabold text-brand">Bize Ulaşın</h3>
          <p className="mt-1 text-sm text-slate-500">
            Bilgilerinizi bırakın, size uygun tatil ve otel seçeneklerini biz arayıp
            anlatalım.
          </p>
        </>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Ad *
          <input
            name="firstName"
            required
            autoComplete="given-name"
            disabled={pending}
            className={`${input} ${state.fieldErrors?.firstName ? "border-red-400" : ""}`}
          />
          {state.fieldErrors?.firstName && (
            <span className={err}>{state.fieldErrors.firstName}</span>
          )}
        </label>
        <label className={label}>
          Soyad *
          <input
            name="lastName"
            required
            autoComplete="family-name"
            disabled={pending}
            className={`${input} ${state.fieldErrors?.lastName ? "border-red-400" : ""}`}
          />
          {state.fieldErrors?.lastName && (
            <span className={err}>{state.fieldErrors.lastName}</span>
          )}
        </label>
      </div>

      <label className={`${label} mt-4 block`}>
        Telefon *
        <input
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="0(5xx) xxx xx xx"
          disabled={pending}
          className={`${input} ${state.fieldErrors?.phone ? "border-red-400" : ""}`}
        />
        {state.fieldErrors?.phone && <span className={err}>{state.fieldErrors.phone}</span>}
      </label>

      <label className={`${label} mt-4 block`}>
        Notunuz <span className="text-slate-400">(opsiyonel)</span>
        <textarea
          name="note"
          rows={3}
          maxLength={500}
          placeholder="Örn. Temmuz'da 2 yetişkin 1 çocuk, Antalya her şey dahil"
          disabled={pending}
          className={input}
        />
      </label>

      {state.error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-white transition hover:bg-accent-dark disabled:opacity-50"
      >
        {pending ? "Gönderiliyor..." : "Beni Arayın"}
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="text-slate-400">Hemen görüşmek için:</span>
        <a
          href={telHref(COMPANY.phones[0])}
          className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-dark"
        >
          {COMPANY.phones[0]}
        </a>
        <a
          href={whatsappHref("Merhaba, tatil ve otel seçenekleri hakkında bilgi almak istiyorum.")}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700"
        >
          WhatsApp
        </a>
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
        Bilgileriniz yalnızca size dönüş yapabilmemiz için kullanılır; üçüncü
        kişilerle paylaşılmaz.
      </p>
    </form>
  );
}
