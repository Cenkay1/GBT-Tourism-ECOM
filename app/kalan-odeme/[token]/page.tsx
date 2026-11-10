import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBalanceView, payBalance } from "@/lib/balance-actions";
import { formatPrice, formatDate, formatDateTime } from "@/lib/shared";
import { COMPANY, telHref, whatsappHref } from "@/lib/company";

export const dynamic = "force-dynamic";

// Gizli bağlantı: arama motorlarına verilmez.
export const metadata: Metadata = {
  title: "Kalan Ödeme — " + COMPANY.name,
  robots: { index: false, follow: false },
};

export default async function BalancePaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ hata?: string }>;
}) {
  const { token } = await params;
  const { hata } = await searchParams;
  const view = await getBalanceView(token);
  if (!view) notFound();

  const paid = view.balance <= 0;

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-extrabold text-brand">Kalan Ödeme</h1>
      <p className="mt-1 text-sm text-slate-500">
        Sayın {view.contactName}, rezervasyonunuzun ödeme durumu aşağıdadır.
      </p>

      {hata && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <p className="font-semibold text-slate-800">{view.tourTitle}</p>
        <p className="text-sm text-slate-400">{view.destination}</p>
        <p className="mt-1 text-sm text-slate-500">
          Kalkış: {formatDateTime(view.departureDate)}
        </p>
        <p className="text-sm text-slate-500">{view.seatText}</p>
        <p className="mt-1 text-xs text-slate-400">
          Rezervasyon No: <span className="font-mono">{view.ref}</span>
        </p>

        <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
          <Row label="Toplam tutar" value={formatPrice(view.totalAmount, view.currency)} />
          <Row label="Ödenen" value={formatPrice(view.paidAmount, view.currency)} />
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <dt className="font-bold text-brand">Kalan</dt>
            <dd
              className={`text-lg font-extrabold ${
                paid ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {formatPrice(view.balance, view.currency)}
            </dd>
          </div>
        </dl>

        {paid ? (
          <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            Ödemenizin tamamı alınmıştır; rezervasyonunuz kesinleşti. İyi yolculuklar
            dileriz.
          </p>
        ) : view.status !== "ODENDI" ? (
          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Bu rezervasyon üzerinden ödeme alınamıyor. Lütfen bizimle iletişime geçin.
          </p>
        ) : (
          <>
            {view.balanceDueAt && (
              <p
                className={`mt-5 rounded-xl px-4 py-3 text-sm ${
                  view.overdue
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {view.overdue ? (
                  <>
                    Son ödeme tarihi ({formatDate(view.balanceDueAt)}) geçmiş. Koltuğunuzun
                    hâlâ müsait olup olmadığını teyit etmek için lütfen bizimle iletişime
                    geçin.
                  </>
                ) : (
                  <>
                    Son ödeme tarihi: <strong>{formatDate(view.balanceDueAt)}</strong>. Bu
                    tarihe kadar tamamlanmayan rezervasyonlar iptal edilir ve koltuk hakkı
                    diğer misafirlerimizin rezervasyonuna açılır.
                  </>
                )}
              </p>
            )}

            <form action={payBalance} className="mt-5">
              <input type="hidden" name="token" value={token} />
              <button className="w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-white transition hover:bg-accent-dark">
                {formatPrice(view.balance, view.currency)} Öde
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Ödeme iyzico&apos;nun güvenli sayfasında alınır; kart bilgileriniz
                sistemimize girmez.
              </p>
            </form>
          </>
        )}
      </div>

      <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-semibold text-brand">Havale / EFT ile ödemek isterseniz</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Bizimle iletişime geçin; hesap bilgilerimizi paylaşalım ve ödemenizi
          kaydedelim.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={telHref(COMPANY.phones[0])}
            className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            {COMPANY.phones[0]}
          </a>
          <a
            href={whatsappHref(`Merhaba, ${view.ref} numaralı rezervasyonumun kalan ödemesi hakkında bilgi almak istiyorum.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            WhatsApp
          </a>
          <a
            href={`mailto:${COMPANY.emails[0]}`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {COMPANY.emails[0]}
          </a>
        </div>
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/turlar" className="text-brand hover:text-accent">
          Turlarımıza göz atın
        </Link>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-700">{value}</dd>
    </div>
  );
}
