// Müşteri rezervasyon satırı — hesabım listelerinde kullanılır.
import Link from "next/link";
import { formatPrice, formatDate, balanceOf } from "@/lib/shared";
import { balancePaymentPath } from "@/lib/company";
import { earnedFor } from "@/lib/loyalty";
import { CalendarIcon, MapPinIcon, StarIcon } from "@/components/Icons";

const statusStyle: Record<string, { label: string; cls: string }> = {
  BEKLIYOR: { label: "Ödeme Bekliyor", cls: "bg-amber-100 text-amber-700" },
  ODENDI: { label: "Onaylandı", cls: "bg-emerald-100 text-emerald-700" },
  IPTAL: { label: "İptal Edildi", cls: "bg-slate-200 text-slate-600" },
  SURE_DOLDU: { label: "Süre Doldu", cls: "bg-slate-200 text-slate-600" },
};

export interface BookingRowData {
  id: string;
  status: string;
  totalAmount: number;
  // Tahsil edilen tutar ve kalan ödeme bilgisi (ön ödemeli rezervasyonlar).
  paidAmount: number;
  balanceDueAt: Date | null;
  balanceToken: string | null;
  quantity: number;
  createdAt: Date;
  loyaltyAwardedAt: Date | null;
  tour: {
    slug: string;
    title: string;
    destination: string;
    departureDate: Date;
    currency: string;
    bookingType: string;
  };
  seatCodes: string[];
}

export default function BookingRow({ b }: { b: BookingRowData }) {
  const st = statusStyle[b.status] ?? statusStyle.SURE_DOLDU;
  const detail =
    b.tour.bookingType === "KOLTUK" && b.seatCodes.length
      ? `Koltuk: ${b.seatCodes.join(", ")}`
      : `${b.quantity} kişi`;
  // Puan yalnız ödeme tamamlanınca yazılır (bkz. lib/loyalty.ts).
  const balance = b.status === "ODENDI" ? balanceOf(b.totalAmount, b.paidAmount) : 0;
  const points = b.status === "ODENDI" && balance === 0 ? earnedFor(b.totalAmount) : 0;

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/turlar/${b.tour.slug}`}
            className="block truncate font-semibold text-brand hover:text-accent"
          >
            {b.tour.title}
          </Link>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <MapPinIcon width={13} height={13} /> {b.tour.destination}
            </span>
            <span className="flex items-center gap-1">
              <CalendarIcon width={13} height={13} />{" "}
              {formatDate(b.tour.departureDate.toISOString())}
            </span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
            balance > 0 ? "bg-red-100 text-red-700" : st.cls
          }`}
        >
          {balance > 0 ? "Ön Ödeme Alındı" : st.label}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
        <div className="text-xs text-slate-500">
          <p>{detail}</p>
          <p className="mt-0.5">Rez. No: {b.id.slice(-8).toUpperCase()}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-brand">{formatPrice(b.totalAmount, b.tour.currency)}</p>
          {balance > 0 && (
            <p className="mt-0.5 text-xs font-semibold text-red-700">
              Kalan: {formatPrice(balance, b.tour.currency)}
            </p>
          )}
          {points > 0 && (
            <p className="mt-0.5 flex items-center justify-end gap-1 text-xs font-medium text-accent">
              <StarIcon width={12} height={12} /> +{points.toLocaleString("tr-TR")} puan
            </p>
          )}
        </div>
      </div>

      {/* Açık bakiye: son ödeme tarihi ve ödeme bağlantısı */}
      {balance > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2">
          <p className="text-xs text-red-800">
            {b.balanceDueAt ? (
              <>
                Son ödeme tarihi:{" "}
                <strong>{formatDate(b.balanceDueAt.toISOString())}</strong>
                {b.balanceDueAt < new Date()
                  ? " — süresi geçti, lütfen bizimle iletişime geçin."
                  : " — bu tarihe kadar tamamlanmazsa koltuğunuz serbest bırakılır."}
              </>
            ) : (
              "Kalan ödemeniz bekleniyor."
            )}
          </p>
          {b.balanceToken && (
            <Link
              href={balancePaymentPath(b.balanceToken)}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-accent-dark"
            >
              Kalan Ödemeyi Yap
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
