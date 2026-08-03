"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/auth-actions";
import type { FormState } from "@/lib/form-state";
import AuthField from "@/components/auth/AuthField";

export default function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    requestPasswordReset,
    {}
  );

  if (state.ok) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}
      <p className="text-sm text-slate-500">
        Hesabınızın e-posta adresini girin, size şifre sıfırlama bağlantısı gönderelim.
      </p>
      <AuthField
        name="email"
        label="E-posta"
        type="email"
        autoComplete="email"
        placeholder="E-posta adresiniz"
        required
      />
      <button
        disabled={pending}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "Gönderiliyor…" : "Sıfırlama Bağlantısı Gönder"}
      </button>
    </form>
  );
}
