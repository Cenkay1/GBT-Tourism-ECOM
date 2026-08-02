import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatPrice, formatDate, categoryLabel, Category } from "@/lib/tours";
import { deleteTour } from "@/lib/admin-actions";
import DeleteButton from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

export default async function AdminTours() {
  const tours = await prisma.tour.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bookings: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand">Turlar</h1>
        <Link
          href="/admin/turlar/yeni"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          + Yeni Tur
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Tur</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">Fiyat</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tours.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Henüz tur eklenmemiş. “Yeni Tur” ile başlayın.
                  </td>
                </tr>
              ) : (
                tours.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{t.title}</p>
                      <p className="text-xs text-slate-400">{t.destination}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {categoryLabel(t.category as Category)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(t.departureDate.toISOString())}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.bookingType === "KOLTUK" ? "Koltuk" : "Kontenjan"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-accent">
                      {formatPrice(t.price, t.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          t.status === "YAYINDA"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {t.status === "YAYINDA" ? "Yayında" : "Taslak"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <a
                        href={`/admin/turlar/${t.id}/excel`}
                        className="rounded-md px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Excel
                      </a>
                      {t.bookingType === "KOLTUK" && (
                        <Link
                          href={`/admin/turlar/${t.id}/koltuklar`}
                          className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100"
                        >
                          Koltuklar
                        </Link>
                      )}
                      <Link
                        href={`/admin/turlar/${t.id}`}
                        className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100"
                      >
                        Düzenle
                      </Link>
                      <DeleteButton
                        action={async () => {
                          "use server";
                          await deleteTour(t.id);
                        }}
                        confirmText={`"${t.title}" turunu silmek istediğinize emin misiniz?`}
                      />
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
