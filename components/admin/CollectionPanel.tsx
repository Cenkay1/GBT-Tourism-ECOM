"use client";

// Tahsilat paneli — rezervasyon detayındaki "para ne kadar geldi, ne kadar
// kaldı" bölümü.
//
// Elden satışta para parça parça gelir: görevli aldığı tutarı girer, kalan
// bakiye kendiliğinden düşer. Bakiye kapanınca panel yeşile döner. Yanlış
// girilen satır silinebilir (iyzico ile eşlenmiş tahsilat hariç — o gerçek
// para hareketi, defterden silinmesi mutabakatı bozar).

import { useActionState, useState } from "react";
import {
  addCollectionAction,
  deleteCollectionAction,
  createBalanceLinkAction,
} from "@/lib/admin-actions";
import type { FormState } from "@/lib/form-state";
import {
  formatPrice,
  balanceOf,
  paymentStateOf,
  paymentMethodLabel,
} from "@/lib/shared";

export interface CollectionRow {
  id: string;
  amount: number;
  method: string;
  note: string;
  createdAt: string; // ISO
  linkedToPayment: boolean; // iyzico ödemesiyle eşli → silinemez
}

export default function CollectionPanel({
  bookingId,
  totalAmount,
  paidAmount,
  currency,
  balanceDueAt,
  collections,
  balanceUrl,
  canCollect,
}: {
  bookingId: string;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  balanceDueAt: string | null;
  collections: CollectionRow[];
  balanceUrl: string | null;
  // İptal/süresi dolmuş rezervasyona tahsilat girilmez.
  canCollect: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    addCollectionAction,
    {}
  );
  const [linkState, linkAction, linkPending] = useActionState<FormState, FormData>(
    createBalanceLinkAction,
    {}
  );
  const [copied, setCopied] = useState(false);

  const balance = balanceOf(totalAmount, paidAmount);
  const paymentState = paymentStateOf(totalAmount, paidAmount);
  const overdue = Boolean(balanceDueAt && new Date(balanceDueAt) < new Date());

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";
  const label = "block text-xs font-medium text-slate-500";

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-bold text-brand">Tahsilat</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            paymentState === "TAMAM"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {paymentState === "TAMAM" ? "✓ Ödeme tamamlandı" : "Açık bakiye var"}
        </span>
      </div>

      {/* Özet */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Toplam" value={formatPrice(totalAmount, currency)} />
        <Stat
          label="Tahsil edilen"
          value={formatPrice(paidAmount, currency)}
          tone="ok"
        />
        <Stat
          label="Kalan"
          value={formatPrice(balance, currency)}
          tone={balance > 0 ? "warn" : "ok"}
        />
      </div>

      {balance > 0 && balanceDueAt && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          Son ödeme tarihi:{" "}
          {new Date(balanceDueAt).toLocaleDateString("tr-TR", {
            timeZone: "Europe/Istanbul",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {overdue
            ? " — SÜRESİ GEÇTİ. Zamanlanmış görev bu rezervasyonu iptal edip koltuğu satışa açacak."
            : " — bu tarihe kadar tamamlanmazsa rezervasyon otomatik iptal edilir."}
        </p>
      )}

      {/* Tahsilat geçmişi */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-700">Tahsilat geçmişi</h3>
        {collections.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Henüz tahsilat kaydı yok.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="pb-2">Tarih</th>
                  <th className="pb-2">Tutar</th>
                  <th className="pb-2">Yöntem</th>
                  <th className="pb-2">Not</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {collections.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 text-slate-500">
                      {new Date(c.createdAt).toLocaleString("tr-TR", {
                        timeZone: "Europe/Istanbul",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td
                      className={`py-2 font-semibold ${
                        c.amount < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {c.amount < 0 ? "−" : "+"}
                      {formatPrice(Math.abs(c.amount), currency)}
                    </td>
                    <td className="py-2 text-slate-600">
                      {paymentMethodLabel(c.method)}
                      {c.linkedToPayment && (
                        <span className="ml-1 text-xs text-slate-400">(iyzico)</span>
                      )}
                    </td>
                    <td className="py-2 text-slate-500">{c.note || "—"}</td>
                    <td className="py-2 text-right">
                      {c.linkedToPayment ? (
                        <span
                          className="text-xs text-slate-300"
                          title="iyzico ödemesiyle eşlenmiş tahsilat silinemez; para iadesi için iade işlemini kullanın."
                        >
                          kilitli
                        </span>
                      ) : (
                        <form
                          action={async () => {
                            await deleteCollectionAction(c.id);
                          }}
                        >
                          <button className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                            Sil
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Yeni tahsilat */}
      {canCollect ? (
        <form action={action} className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-700">Tahsilat ekle</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Elden/havale aldığınız tutarı girin; kalan bakiye otomatik düşer. Yanlış
            girdiyseniz eksi değer girerek düzeltebilir ya da satırı silebilirsiniz.
          </p>
          <input type="hidden" name="bookingId" value={bookingId} />
          <div className="mt-3 grid gap-3 sm:grid-cols-[140px_160px_1fr_auto]">
            <label className={label}>
              Tutar (₺)
              <input
                name="amount"
                type="number"
                step="1"
                required
                placeholder={balance > 0 ? String(balance) : "0"}
                disabled={pending}
                className={input}
              />
            </label>
            <label className={label}>
              Yöntem
              <select name="method" defaultValue="NAKIT" disabled={pending} className={input}>
                <option value="NAKIT">Nakit</option>
                <option value="HAVALE">Havale / EFT</option>
                <option value="KREDI_KARTI">Kredi Kartı (elden)</option>
              </select>
            </label>
            <label className={label}>
              Not (opsiyonel)
              <input
                name="note"
                placeholder="Örn. 2. taksit, ofiste alındı"
                disabled={pending}
                className={input}
              />
            </label>
            <button
              disabled={pending}
              className="self-end rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
          {state.error && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-600">
              {state.error}
            </p>
          )}
          {state.message && (
            <p role="status" className="mt-2 text-sm font-medium text-emerald-700">
              {state.message}
            </p>
          )}
        </form>
      ) : (
        <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-400">
          Bu rezervasyon iptal/süresi dolmuş durumda olduğu için tahsilat girilemez.
        </p>
      )}

      {/* Kalan ödeme bağlantısı — müşteriye gönderilir */}
      {balance > 0 && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Kalan ödeme bağlantısı</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Müşteri bu bağlantıdan kalan tutarı kartla ödeyebilir. Bağlantı ön ödeme
            e-postasında da gönderilir.
          </p>
          {balanceUrl ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="max-w-full flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                {balanceUrl}
              </code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(balanceUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark"
              >
                {copied ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>
          ) : (
            <form action={linkAction} className="mt-3">
              <input type="hidden" name="bookingId" value={bookingId} />
              <button
                disabled={linkPending}
                className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {linkPending ? "Hazırlanıyor..." : "Bağlantı Oluştur"}
              </button>
              {linkState.error && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {linkState.error}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      className={`rounded-xl px-4 py-3 ${
        tone === "warn" ? "bg-red-50" : tone === "ok" ? "bg-emerald-50" : "bg-slate-50"
      }`}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-lg font-extrabold ${
          tone === "warn"
            ? "text-red-700"
            : tone === "ok"
              ? "text-emerald-700"
              : "text-slate-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
