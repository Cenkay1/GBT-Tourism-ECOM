"use client";

import { useState } from "react";
import Link from "next/link";
import { CONSENT_FIELDS } from "@/lib/consent";

// Ödeme adımındaki zorunlu rıza kutuları + iptal/iade özeti.
//
// Metinlerin tamamı /mesafeli-satis, /teslimat-iade ve /gizlilik sayfalarında.
// Buradaki özet müşterinin sayfadan ayrılmadan ana kuralları görmesi için;
// bağlayıcı olan sözleşme sayfalarıdır ve bu açıkça yazılıdır.
//
// `onChange` ile ebeveyn formun gönder düğmesini kilitlemesi sağlanır. Sunucu
// tarafında ayrıca kontrol edilir (lib/consent.ts) — istemci tek başına kanıt değil.
export default function ConsentCheckboxes({
  onChange,
}: {
  onChange?: (allAccepted: boolean) => void;
}) {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [openSummary, setOpenSummary] = useState(false);

  function update(next: { terms?: boolean; privacy?: boolean }) {
    const t = next.terms ?? terms;
    const p = next.privacy ?? privacy;
    if (next.terms !== undefined) setTerms(next.terms);
    if (next.privacy !== undefined) setPrivacy(next.privacy);
    onChange?.(t && p);
  }

  const box =
    "mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent";
  const row = "flex items-start gap-2.5 text-xs leading-relaxed text-slate-600";
  const link = "font-semibold text-brand underline underline-offset-2 hover:text-accent";

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      <label className={row}>
        <input
          type="checkbox"
          name={CONSENT_FIELDS.terms}
          checked={terms}
          onChange={(e) => update({ terms: e.target.checked })}
          className={box}
          required
        />
        <span>
          <Link href="/mesafeli-satis" target="_blank" rel="noopener noreferrer" className={link}>
            Mesafeli Satış Sözleşmesi
          </Link>
          {"'ni ve "}
          <Link href="/teslimat-iade" target="_blank" rel="noopener noreferrer" className={link}>
            İptal / İade Koşulları
          </Link>
          {"'nı okudum, onaylıyorum."}
        </span>
      </label>

      <label className={row}>
        <input
          type="checkbox"
          name={CONSENT_FIELDS.privacy}
          checked={privacy}
          onChange={(e) => update({ privacy: e.target.checked })}
          className={box}
          required
        />
        <span>
          <Link href="/gizlilik" target="_blank" rel="noopener noreferrer" className={link}>
            Gizlilik Politikası ve KVKK Aydınlatma Metni
          </Link>
          {"'ni okudum; kişisel verilerimin bu kapsamda işlenmesini kabul ediyorum."}
        </span>
      </label>

      <div className="border-t border-slate-200 pt-2.5">
        <button
          type="button"
          onClick={() => setOpenSummary((v) => !v)}
          aria-expanded={openSummary}
          className="flex w-full items-center justify-between text-left text-xs font-semibold text-brand hover:text-accent"
        >
          İptal ve iade koşulları — özet
          <span aria-hidden className="text-sm leading-none">
            {openSummary ? "−" : "+"}
          </span>
        </button>

        {openSummary && (
          <div className="mt-2.5 space-y-1.5 text-[11px] leading-relaxed text-slate-500">
            <p>
              <strong className="text-slate-700">Cayma hakkı:</strong> Belirli bir tarihte
              yapılması gereken gezi/taşıma hizmetleri, Mesafeli Sözleşmeler Yönetmeliği
              md. 15 uyarınca cayma hakkının istisnasıdır.
            </p>
            <p>
              <strong className="text-slate-700">İptal talebi:</strong> Kalkıştan önce
              acenteye bildirilen iptallerde, turun niteliğine ve kalan süreye göre kesinti
              uygulanabilir.
            </p>
            <p>
              <strong className="text-slate-700">Acente kaynaklı iptal:</strong> Turun
              acente tarafından iptal edilmesi hâlinde ödediğiniz tutar eksiksiz iade edilir.
            </p>
            <p>
              <strong className="text-slate-700">İade süresi:</strong> Onaylanan iadeler
              kartınıza bankanıza bağlı olarak 7 iş günü içinde yansır; sözleşmeden
              doğan yasal azami süre 14 gündür.
            </p>
            <p className="pt-1 text-slate-400">
              Bu bir özettir; bağlayıcı hükümler{" "}
              <Link href="/mesafeli-satis" target="_blank" rel="noopener noreferrer" className={link}>
                Mesafeli Satış Sözleşmesi
              </Link>{" "}
              ve{" "}
              <Link href="/teslimat-iade" target="_blank" rel="noopener noreferrer" className={link}>
                İptal / İade Koşulları
              </Link>{" "}
              sayfalarındadır.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
