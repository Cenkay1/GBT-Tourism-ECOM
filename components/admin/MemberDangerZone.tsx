"use client";

// Üyeyi kalıcı silme — GERİ ALINAMAZ, bu yüzden iki aşamalı.
//
// Silmenin ne yapacağı sayılarla yazılır: rezervasyonlar SİLİNMEZ, misafir
// rezervasyonuna döner (yolcu listesi, koltuk, tahsilat, fatura korunur); puan
// geçmişi ve kayıtlı kişiler ise silinir. Onay için üyenin e-postası elle
// yazılmalı — "Sil"e yanlışlıkla basmak yetmiyor.
//
// Not: tarayıcı confirm() kullanılmıyor; onay sayfanın içinde alınıyor.
import { useState } from "react";
import { deleteMemberAction } from "@/lib/admin-actions";
import type { MemberDeletionImpact } from "@/lib/members";

export default function MemberDangerZone({
  id,
  email,
  active,
  impact,
}: {
  id: string;
  email: string;
  active: boolean;
  impact: MemberDeletionImpact;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const action = deleteMemberAction.bind(null, id);
  const confirmed = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <section className="rounded-2xl border border-red-100 bg-red-50/40 p-5">
      <h2 className="font-bold text-red-800">Üyeyi Kalıcı Sil</h2>
      <p className="mt-1 text-xs text-red-800">
        {active
          ? "Çoğu durumda silmek yerine üyeyi pasife almak yeterlidir: giriş yapamaz ama geçmişi korunur."
          : "Bu üye şu anda pasif. Kalıcı silme geri alınamaz."}
      </p>

      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        <li>
          <strong>{impact.bookings}</strong> rezervasyon misafir rezervasyonuna dönecek
          (silinmeyecek — yolcu listesi, koltuk ve fatura korunur).
        </li>
        <li>
          <strong>{impact.points.toLocaleString("tr-TR")}</strong> puan bakiyesi ve{" "}
          <strong>{impact.pointsRows}</strong> puan hareketi silinecek.
        </li>
        <li>
          <strong>{impact.savedPassengers}</strong> kayıtlı kişi silinecek.
        </li>
      </ul>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
        >
          Kalıcı silmeyi başlat
        </button>
      ) : (
        <form action={action} className="mt-4 space-y-2">
          <label className="block text-xs font-medium text-red-800">
            Onaylamak için üyenin e-postasını yazın: <code>{email}</code>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2 text-sm outline-none focus:border-red-400"
              placeholder={email}
            />
          </label>
          <div className="flex gap-2">
            <button
              disabled={!confirmed}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white transition enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Üyeyi Kalıcı Sil
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              className="rounded-lg px-4 py-2 text-xs font-medium text-slate-500 hover:bg-white"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
