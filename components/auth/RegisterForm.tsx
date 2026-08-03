"use client";

import { useActionState } from "react";
import { registerUser } from "@/lib/auth-actions";
import type { FormState } from "@/lib/form-state";
import AuthField from "@/components/auth/AuthField";

export default function RegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(registerUser, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <AuthField
        name="name"
        label="Ad Soyad"
        autoComplete="name"
        placeholder="Adınız Soyadınız"
        required
        error={fe.name}
      />
      <AuthField
        name="email"
        label="E-posta"
        type="email"
        autoComplete="email"
        placeholder="E-posta adresiniz"
        required
        error={fe.email}
      />
      <AuthField
        name="phone"
        label="Telefon (opsiyonel)"
        type="tel"
        inputMode="tel"
        placeholder="0(5xx) xxx xx xx"
        autoComplete="tel"
        error={fe.phone}
      />
      <AuthField
        name="password"
        label="Şifre"
        type="password"
        autoComplete="new-password"
        placeholder="Şifreniz"
        required
        error={fe.password}
      />
      <p className="text-xs text-slate-400">En az 8 karakter, bir harf ve bir rakam içermeli.</p>

      <button
        disabled={pending}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "Hesap oluşturuluyor…" : "Hesap Oluştur"}
      </button>
    </form>
  );
}
