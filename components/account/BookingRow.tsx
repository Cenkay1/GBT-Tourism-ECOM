// Müşteri rezervasyon satırı — hesabım listelerinde kullanılır.
import Link from "next/link";
import { formatPrice, formatDate } from "@/lib/shared";
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
  const points = b.status === "ODENDI" ? earnedFor(b.totalAmount) : 0;

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
        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${st.cls}`}>
          {st.label}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
        <div className="text-xs text-slate-500">
          <p>{detail}</p>
          <p className="mt-0.5">Rez. No: {b.id.slice(-8).toUpperCase()}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-brand">{formatPrice(b.totalAmount, b.tour.currency)}</p>
          {points > 0 && (
            <p className="mt-0.5 flex items-center justify-end gap-1 text-xs font-medium text-accent">
              <StarIcon width={12} height={12} /> +{points.toLocaleString("tr-TR")} puan
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
