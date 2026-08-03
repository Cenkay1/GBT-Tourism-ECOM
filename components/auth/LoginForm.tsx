"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginUser } from "@/lib/auth-actions";
import type { FormState } from "@/lib/form-state";
import AuthField from "@/components/auth/AuthField";

export default function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginUser, {});

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <AuthField
        name="email"
        label="E-posta"
        type="email"
        autoComplete="email"
        placeholder="E-posta adresiniz"
        required
      />
      <div>
        <AuthField
          name="password"
          label="Şifre"
          type="password"
          autoComplete="current-password"
          placeholder="Şifreniz"
          required
        />
        <div className="mt-1.5 text-right">
          <Link href="/sifremi-unuttum" className="text-xs font-medium text-brand hover:text-accent">
            Şifremi unuttum
          </Link>
        </div>
      </div>

      <button
        disabled={pending}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "Giriş yapılıyor…" : "Giriş Yap"}
      </button>
    </form>
  );
}
