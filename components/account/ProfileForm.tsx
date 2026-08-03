"use client";

import { useActionState } from "react";
import { updateProfile } from "@/lib/auth-actions";
import type { FormState } from "@/lib/form-state";
import AuthField from "@/components/auth/AuthField";

export default function ProfileForm({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string;
  email: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-600">
          E-posta
          <input
            value={email}
            disabled
            className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
          />
        </label>
        <p className="mt-1 text-xs text-slate-400">E-posta adresi değiştirilemez.</p>
      </div>

      <AuthField name="name" label="Ad Soyad" defaultValue={name} required error={fe.name} />
      <AuthField
        name="phone"
        label="Telefon"
        type="tel"
        inputMode="tel"
        defaultValue={phone}
        placeholder="0(5xx) xxx xx xx"
        error={fe.phone}
      />

      <button
        disabled={pending}
        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </form>
  );
}
