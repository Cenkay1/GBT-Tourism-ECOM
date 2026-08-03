"use client";

import { useActionState } from "react";
import { resendVerification } from "@/lib/auth-actions";
import type { FormState } from "@/lib/form-state";

// Doğrulama e-postasını tekrar gönderme butonu. `variant`:
//  - "banner": açık renk uyarı şeridinde küçük bağlantı-buton
//  - "block":  bağımsız birincil buton
export default function ResendVerification({
  variant = "block",
}: {
  variant?: "banner" | "block";
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    resendVerification,
    {}
  );

  if (state.message) {
    return <span className="text-xs font-medium text-emerald-700">{state.message}</span>;
  }

  if (variant === "banner") {
    return (
      <form action={action} className="inline">
        <button
          disabled={pending}
          className="text-xs font-semibold underline underline-offset-2 hover:opacity-80 disabled:opacity-60"
        >
          {pending ? "Gönderiliyor…" : "Tekrar gönder"}
        </button>
        {state.error && <span className="ml-2 text-xs text-red-600">{state.error}</span>}
      </form>
    );
  }

  return (
    <form action={action}>
      <button
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "Gönderiliyor…" : "Doğrulama E-postasını Gönder"}
      </button>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
