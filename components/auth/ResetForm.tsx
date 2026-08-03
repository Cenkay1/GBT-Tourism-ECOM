"use client";

import { useActionState } from "react";
import { resetPassword } from "@/lib/auth-actions";
import type { FormState } from "@/lib/form-state";
import AuthField from "@/components/auth/AuthField";

export default function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}
      <AuthField
        name="password"
        label="Yeni Şifre"
        type="password"
        autoComplete="new-password"
        placeholder="Yeni şifreniz"
        required
        error={fe.password}
      />
      <p className="text-xs text-slate-400">En az 8 karakter, bir harf ve bir rakam içermeli.</p>
      <button
        disabled={pending}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "Kaydediliyor…" : "Şifremi Güncelle"}
      </button>
    </form>
  );
}
