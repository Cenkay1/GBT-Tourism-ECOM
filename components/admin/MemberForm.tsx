"use client";

// Admin "Üye Ekle" formu. Şifre alanı YOK — üye şifresini kendi kurar
// (bkz. lib/members.ts createMember).
//
// E-posta alanından çıkınca o adresle yapılmış misafir rezervasyonları sayılır
// ve uyarı gösterilir: kayıt emailVerified dolu açıldığı için o rezervasyonlar
// yeni hesaba bağlanacak. Yanlış e-posta girilirse başkasının rezervasyonları
// bu hesaba bağlanırdı — admin kaydetmeden önce görmeli.
import { useActionState, useState, useTransition } from "react";
import { createMemberAction, guestBookingCountAction } from "@/lib/admin-actions";
import type { FormState } from "@/lib/form-state";

export default function MemberForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createMemberAction,
    {}
  );
  const [open, setOpen] = useState(false);
  const [guestCount, setGuestCount] = useState<number | null>(null);
  const [checking, startChecking] = useTransition();

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";

  function checkEmail(email: string) {
    const value = email.trim();
    if (!value.includes("@")) {
      setGuestCount(null);
      return;
    }
    startChecking(async () => {
      try {
        setGuestCount(await guestBookingCountAction(value));
      } catch {
        setGuestCount(null);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-accent-dark"
      >
        Üye Ekle
      </button>
    );
  }

  return (
    <form
      action={action}
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-brand">Yeni Üye</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Kapat
        </button>
      </div>

      {state.message && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-600">
          Ad Soyad
          <input name="name" required className={input} placeholder="Ayşe Yılmaz" />
        </label>
        <label className="block text-sm font-medium text-slate-600">
          E-posta
          <input
            name="email"
            type="email"
            required
            className={input}
            placeholder="ayse@ornek.com"
            onBlur={(e) => checkEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-slate-600">
          Telefon
          <input name="phone" className={input} placeholder="5551112233" />
        </label>
      </div>

      {checking && (
        <p className="mt-3 text-xs text-slate-400">Misafir rezervasyonları kontrol ediliyor…</p>
      )}
      {!checking && guestCount !== null && guestCount > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Bu e-postayla yapılmış <strong>{guestCount} misafir rezervasyonu</strong> var
          ve kaydettiğinizde bu hesaba bağlanacak. E-postanın doğru kişiye ait
          olduğundan emin olun.
        </p>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Şifre belirlenmez. Üye, giriş ekranındaki &quot;Şifremi unuttum&quot; ile kendi
        şifresini kurar. E-posta adresi doğrulanmış olarak işaretlenir.
      </p>

      <button
        disabled={pending}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:opacity-50"
      >
        {pending ? "Kaydediliyor…" : "Üyeyi Kaydet"}
      </button>
    </form>
  );
}
