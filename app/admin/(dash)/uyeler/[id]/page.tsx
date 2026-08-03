import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/tours";
import { tierDef, tierInfo } from "@/lib/loyalty";
import { ChevronRightIcon, CheckCircleIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

const tierBadge: Record<string, string> = {
  BRONZE: "bg-amber-100 text-amber-800",
  SILVER: "bg-slate-200 text-slate-700",
  GOLD: "bg-yellow-100 text-yellow-800",
  PLATINUM: "bg-indigo-100 text-indigo-800",
};

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
const reasonLabel: Record<string, string> = {
  KAZANIM: "Rezervasyon puanı",
  HOSGELDIN: "Hoşgeldin puanı",
  DUZELTME: "Puan düzeltmesi",
};

export default async function AdminMemberDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      accounts: { select: { provider: true } },
      bookings: {
        orderBy: { createdAt: "desc" },
        include: { tour: { select: { title: true, currency: true } } },
      },
      pointsLog: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!user) notFound();

  const tier = tierDef(user.tier);
  const { next, toNext } = tierInfo(user.lifetimePoints);
  const hasGoogle = user.accounts.some((a) => a.provider === "google");

  return (
    <div>
      <nav className="mb-4 flex items-center gap-1 text-sm text-slate-500">
        <Link href="/admin/uyeler" className="hover:text-brand">
          Üyeler
        </Link>
        <ChevronRightIcon width={14} height={14} />
        <span className="text-slate-700">{user.name ?? user.email}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Sol: rezervasyonlar + puan hareketleri */}
        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-3 font-bold text-brand">
              Rezervasyonlar ({user.bookings.length})
            </h2>
            {user.bookings.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                Bu üyeye bağlı rezervasyon yok.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Tur</th>
                      <th className="px-4 py-2.5">Tutar</th>
                      <th className="px-4 py-2.5">Durum</th>
                      <th className="px-4 py-2.5">Tarih</th>
                      <th className="px-4 py-2.5 text-right">Detay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {user.bookings.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-700">{b.tour.title}</td>
                        <td className="px-4 py-2.5 font-semibold text-accent">
                          {formatPrice(b.totalAmount, b.tour.currency)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              statusStyle[b.status] ?? "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {statusLabel[b.status] ?? b.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {formatDate(b.createdAt.toISOString())}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={`/admin/rezervasyonlar/${b.id}`}
                            className="rounded-md px-2.5 py-1 text-xs font-semibold text-brand hover:bg-slate-100"
                          >
                            Görüntüle
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-3 font-bold text-brand">
              Puan Hareketleri ({user.pointsLog.length})
            </h2>
            {user.pointsLog.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                Henüz puan hareketi yok.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {user.pointsLog.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {reasonLabel[e.reason] ?? e.reason}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDate(e.createdAt.toISOString())}
                        {e.note ? ` · ${e.note}` : ""}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        e.delta >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {e.delta >= 0 ? "+" : ""}
                      {e.delta.toLocaleString("tr-TR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sağ: profil + sadakat özeti */}
        <aside className="space-y-6">
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
                {(user.name ?? user.email).charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-bold text-brand">
                  {user.name ?? "—"}
                  {user.emailVerified && (
                    <CheckCircleIcon width={15} height={15} className="text-emerald-500" />
                  )}
                </p>
                <p className="truncate text-xs text-slate-400">{user.email}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
              <Row label="Telefon" value={user.phone ?? "—"} />
              <Row
                label="E-posta"
                value={user.emailVerified ? "Doğrulanmış" : "Doğrulanmamış"}
              />
              <Row
                label="Giriş yöntemi"
                value={[user.passwordHash ? "E-posta" : null, hasGoogle ? "Google" : null]
                  .filter(Boolean)
                  .join(" + ") || "—"}
              />
              <Row label="Kayıt tarihi" value={formatDate(user.createdAt.toISOString())} />
            </dl>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-brand">Sadakat</h3>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  tierBadge[user.tier] ?? tierBadge.BRONZE
                }`}
              >
                {tier.label}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xl font-extrabold text-accent">
                  {user.points.toLocaleString("tr-TR")}
                </p>
                <p className="text-xs text-slate-400">Güncel Puan</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xl font-extrabold text-brand">
                  {user.lifetimePoints.toLocaleString("tr-TR")}
                </p>
                <p className="text-xs text-slate-400">Ömür Boyu</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {next
                ? `${toNext.toLocaleString("tr-TR")} puan sonra ${next.label} kademesine yükselecek.`
                : "En üst kademede."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}
