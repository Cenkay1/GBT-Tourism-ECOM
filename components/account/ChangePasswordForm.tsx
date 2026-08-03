"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/auth-actions";
import type { FormState } from "@/lib/form-state";
import AuthField from "@/components/auth/AuthField";

export default function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {!hasPassword && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Hesabınız Google ile açılmış. Buradan bir şifre belirleyerek e-posta ve şifreyle de
          giriş yapabilirsiniz.
        </p>
      )}
      {state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      {hasPassword && (
        <AuthField
          name="current"
          label="Mevcut Şifre"
          type="password"
          autoComplete="current-password"
          placeholder="Mevcut şifreniz"
          required
          error={fe.current}
        />
      )}
      <AuthField
        name="password"
        label={hasPassword ? "Yeni Şifre" : "Şifre"}
        type="password"
        autoComplete="new-password"
        placeholder={hasPassword ? "Yeni şifreniz" : "Şifreniz"}
        required
        error={fe.password}
      />
      <p className="text-xs text-slate-400">En az 8 karakter, bir harf ve bir rakam içermeli.</p>

      <button
        disabled={pending}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Kaydediliyor…" : hasPassword ? "Şifreyi Güncelle" : "Şifre Belirle"}
      </button>
    </form>
  );
}
