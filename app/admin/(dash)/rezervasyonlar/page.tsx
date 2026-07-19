import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/tours";

export const dynamic = "force-dynamic";

const statusStyle: Record<string, string> = {
  ODENDI: "bg-emerald-50 text-emerald-700",
  BEKLIYOR: "bg-amber-50 text-amber-700",
  IPTAL: "bg-red-50 text-red-600",
  SURE_DOLDU: "bg-slate-100 text-slate-500",
};
const statusLabel: Record<string, string> = {
  ODENDI: "Ödendi",
  BEKLIYOR: "Bekliyor",
  IPTAL: "İptal",
  SURE_DOLDU: "Süre Doldu",
};

export default async function AdminBookings() {
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: { tour: true, passengers: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand">Rezervasyonlar & Satışlar</h1>
      <p className="mt-1 text-sm text-slate-500">
        Gelen tüm rezervasyon ve satış kayıtları.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Müşteri</th>
                <th className="px-4 py-3">Tur</th>
                <th className="px-4 py-3">Koltuk/Kişi</th>
                <th className="px-4 py-3">Tutar</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3 text-right">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Henüz rezervasyon yok. Ödeme entegrasyonu bağlandığında satışlar burada
                    listelenecek.
                  </td>
                </tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{b.contactName}</p>
                      <p className="text-xs text-slate-400">{b.contactPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{b.tour.title}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {b.tour.bookingType === "KOLTUK"
                        ? b.passengers.map((p) => p.seatCode).filter(Boolean).join(", ") || "—"
                        : `${b.quantity} kişi`}
                    </td>
                    <td className="px-4 py-3 font-semibold text-accent">
                      {formatPrice(b.totalAmount, b.tour.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          statusStyle[b.status] ?? "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {statusLabel[b.status] ?? b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(b.createdAt.toISOString())}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/rezervasyonlar/${b.id}`}
                        className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100"
                      >
                        Görüntüle
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
