import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getTransferDifferenceView,
  payTransferDifference,
} from "@/lib/transfer-actions";
import { formatPrice, formatDate } from "@/lib/shared";
import { COMPANY, telHref } from "@/lib/company";

export const dynamic = "force-dynamic";

// Gizli bağlantı: arama motorlarına verilmez.
export const metadata: Metadata = {
  title: "Devir Fiyat Farkı — " + COMPANY.name,
  robots: { index: false, follow: false },
};

// Başka tura devirde oluşan fiyat farkının ödeme sayfası.
export default async function TransferDifferencePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ hata?: string }>;
}) {
  const { token } = await params;
  const { hata } = await searchParams;
  const view = await getTransferDifferenceView(token);
  if (!view) notFound();

  const kapandi = view.status !== "BEKLIYOR";

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-extrabold text-brand">Devir Fiyat Farkı</h1>
      <p className="mt-1 text-sm text-slate-500">
        Sayın {view.contactName}, devredilen rezervasyonunuz için ödenmesi gereken
        fark aşağıdadır.
      </p>

      {hata && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}

      <div className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
        <div className="space-y-2 border-b border-slate-100 pb-4 text-sm">
          <Row label="Tur" value={view.tourTitle} />
          <Row label="Kalkış" value={formatDate(view.departureDate)} />
          <Row label="Rezervasyon No" value={view.bookingRef} />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-500">Ödenecek Fark</span>
          <span className="text-2xl font-extrabold text-accent">
            {formatPrice(view.amount, view.currency)}
          </span>
        </div>

        {kapandi ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-3 text-center text-sm font-semibold text-emerald-700">
            Bu fark kapatılmış. Ek ödeme gerekmiyor.
          </p>
        ) : (
          <>
            <form action={payTransferDifference} className="mt-6">
              <input type="hidden" name="token" value={token} />
              <button className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition hover:bg-accent-dark">
                Farkı Öde
              </button>
            </form>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Güvenli ödeme • iyzico
            </p>
          </>
        )}
      </div>

      <p className="mt-5 text-center text-xs text-slate-500">
        Sorularınız için{" "}
        <a href={telHref(COMPANY.phones[0])} className="font-semibold text-brand">
          {COMPANY.phones[0]}
        </a>{" "}
        numarasından bize ulaşabilirsiniz.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}
