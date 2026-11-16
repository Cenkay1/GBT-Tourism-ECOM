import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate, formatPhone } from "@/lib/shared";
import { formatDateTime } from "@/lib/tours";
import WaitlistRow from "@/components/admin/WaitlistRow";
import { UsersIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Yedek liste — otobüs/kontenjan DOLUYKEN gelen koltuksuz talepler.
//
// Seferlere göre gruplanıyor: 2. otobüs kararı "bu seferde kaç kişi bekliyor"
// sayısına bakılarak veriliyor. Yedek kayıt bir rezervasyon değil; kontenjan,
// ciro ve koltuk tahtası sayımlarına girmez.
export default async function AdminWaitlist() {
  const rows = await prisma.waitlist.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      tour: { select: { id: true, slug: true, title: true } },
      departure: { select: { id: true, departureDate: true } },
    },
  });

  // Aynı turun diğer seferleri "başka sefere taşı" seçeneği için gerekli.
  const tourIds = [...new Set(rows.map((r) => r.tourId))];
  const departures = tourIds.length
    ? await prisma.tourDeparture.findMany({
        where: { tourId: { in: tourIds } },
        orderBy: { departureDate: "asc" },
        select: { id: true, tourId: true, departureDate: true, status: true },
      })
    : [];

  const waiting = rows.filter((r) => r.status === "BEKLIYOR");
  const waitingPeople = waiting.reduce((t, r) => t + r.quantity, 0);

  // Sefer bazında grupla (bekleyenler önce, tarihe göre).
  const groups = new Map<
    string,
    { key: string; tourTitle: string; tourSlug: string; depDate: Date | null; rows: typeof rows }
  >();
  for (const r of rows) {
    const key = r.departureId ?? `tur:${r.tourId}`;
    const g = groups.get(key);
    if (g) g.rows.push(r);
    else
      groups.set(key, {
        key,
        tourTitle: r.tour.title,
        tourSlug: r.tour.slug,
        depDate: r.departure?.departureDate ?? null,
        rows: [r],
      });
  }
  const grouped = [...groups.values()].sort((a, b) => {
    const at = a.depDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.depDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return at - bt;
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Yedek Liste</h1>
          <p className="mt-1 text-sm text-slate-500">
            Dolu seferler için gelen koltuksuz talepler. Bu kayıtlar rezervasyon
            değildir: koltuk ayrılmaz, ödeme alınmaz ve kontenjan sayımına girmez.
          </p>
        </div>
        {waitingPeople > 0 && (
          <span className="flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-800">
            <UsersIcon width={16} height={16} />
            {waitingPeople} kişi bekliyor
          </span>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            Yedek liste kaydı yok. Bir sefer dolduğunda tur sayfasındaki form
            devreye girer ve talepler burada listelenir.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {grouped.map((g) => {
            const bekleyen = g.rows
              .filter((r) => r.status === "BEKLIYOR")
              .reduce((t, r) => t + r.quantity, 0);
            const otherDepartures = departures
              .filter((d) => d.tourId === g.rows[0].tourId && d.id !== g.rows[0].departureId)
              .map((d) => ({
                id: d.id,
                label: `${formatDateTime(d.departureDate.toISOString())}${
                  d.status === "AKTIF" ? "" : " (satışa kapalı)"
                }`,
              }));

            return (
              <section
                key={g.key}
                className="overflow-hidden rounded-2xl bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/turlar/${g.tourSlug}`}
                      className="font-bold text-brand hover:text-accent"
                    >
                      {g.tourTitle}
                    </Link>
                    <p className="text-xs text-slate-400">
                      {g.depDate
                        ? `Kalkış: ${formatDateTime(g.depDate.toISOString())}`
                        : "Sefere bağlı değil"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      bekleyen > 0
                        ? "bg-amber-50 text-amber-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {bekleyen > 0 ? `${bekleyen} kişi bekliyor` : "Bekleyen yok"}
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {g.rows.map((r) => (
                    <WaitlistRow
                      key={r.id}
                      row={{
                        id: r.id,
                        contactName: r.contactName,
                        contactPhone: formatPhone(r.contactPhone),
                        rawPhone: r.contactPhone,
                        contactEmail: r.contactEmail,
                        quantity: r.quantity,
                        note: r.note,
                        status: r.status,
                        bookingId: r.bookingId,
                        handledNote: r.handledNote,
                        createdAt: formatDate(r.createdAt.toISOString()),
                      }}
                      tourId={g.rows[0].tourId}
                      otherDepartures={otherDepartures}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
