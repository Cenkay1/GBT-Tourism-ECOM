import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatPrice, formatDateTime, categoryLabel, Category } from "@/lib/tours";
import { deleteTour } from "@/lib/admin-actions";
import DeleteButton from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

export default async function AdminTours({
  searchParams,
}: {
  searchParams: Promise<{ gorunum?: string }>;
}) {
  const { gorunum } = await searchParams;
  const archivedView = gorunum === "arsiv";
  const now = new Date();

  const all = await prisma.tour.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { bookings: true, departures: true } },
      // Satışa açık gelecek seferler: hiç yoksa tur ARŞİVdedir.
      departures: {
        where: { status: "AKTIF", departureDate: { gte: now } },
        orderBy: { departureDate: "asc" },
        select: { id: true, departureDate: true, returnDate: true },
      },
    },
  });

  // Arşiv = satılabilir seferi kalmayan tur (tarihi geçmiş turlar buraya iner).
  const active = all.filter((t) => t.departures.length > 0);
  const archived = all.filter((t) => t.departures.length === 0);
  const tours = archivedView ? archived : active;

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

      {/* Aktif / Arşiv — tarihi geçen seferler otomatik arşive düşer */}
      <div className="mt-4 flex gap-2">
        <Link
          href="/admin/turlar"
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            !archivedView ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Aktif ({active.length})
        </Link>
        <Link
          href="/admin/turlar?gorunum=arsiv"
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            archivedView ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Arşiv ({archived.length})
        </Link>
      </div>

      {archivedView && (
        <p className="mt-3 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Bu turların satışa açık gelecek seferi yok, bu yüzden sitede görünmüyorlar.
          Aynı turu tekrar yapmak için turu düzenleyip <strong>yeni bir sefer</strong> ekleyin —
          yeni seferin koltukları boş gelir, eski seferin rezervasyonları kendi seferinde durur.
        </p>
      )}

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
                    {archivedView
                      ? "Arşivde tur yok."
                      : "Satışa açık tur yok. “Yeni Tur” ile başlayın veya arşivdeki bir tura yeni sefer ekleyin."}
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
                      {/* Listede satışa açık en yakın seferin tarih+saati görünür. */}
                      {formatDateTime(
                        (t.departures[0]?.departureDate ?? t.departureDate).toISOString()
                      )}
                      {t.departures.length > 1 && (
                        <span className="mt-0.5 block text-xs text-slate-400">
                          +{t.departures.length - 1} sefer daha
                        </span>
                      )}
                      {archivedView && t._count.departures > 0 && (
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {t._count.departures} geçmiş sefer · {t._count.bookings} rezervasyon
                        </span>
                      )}
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
