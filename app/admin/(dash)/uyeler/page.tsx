import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/tours";
import { tierDef } from "@/lib/loyalty";
import { UserIcon, CheckCircleIcon, StarIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Kademe rozeti renkleri (hesabım tarafıyla tutarlı).
const tierBadge: Record<string, string> = {
  BRONZE: "bg-amber-100 text-amber-800",
  SILVER: "bg-slate-200 text-slate-700",
  GOLD: "bg-yellow-100 text-yellow-800",
  PLATINUM: "bg-indigo-100 text-indigo-800",
};

export default async function AdminMembers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      accounts: { select: { provider: true } },
      _count: { select: { bookings: true } },
    },
  });

  const total = users.length;
  const verified = users.filter((u) => u.emailVerified).length;
  const googleCount = users.filter((u) =>
    u.accounts.some((a) => a.provider === "google")
  ).length;

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-brand">Üyeler</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kayıtlı müşteri hesapları, sadakat puanları ve kademeleri.
        </p>
      </div>

      {/* Özet */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Toplam Üye" value={total} icon={<UserIcon width={22} height={22} />} />
        <Stat
          label="E-postası Doğrulanmış"
          value={verified}
          icon={<CheckCircleIcon width={22} height={22} />}
        />
        <Stat
          label="Google ile Bağlı"
          value={googleCount}
          icon={<StarIcon width={22} height={22} />}
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Üye</th>
                <th className="px-4 py-3">İletişim</th>
                <th className="px-4 py-3">Yöntem</th>
                <th className="px-4 py-3">Kademe</th>
                <th className="px-4 py-3">Puan</th>
                <th className="px-4 py-3">Rezervasyon</th>
                <th className="px-4 py-3">Kayıt</th>
                <th className="px-4 py-3 text-right">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    Henüz üye kaydı yok. Müşteriler siteden kayıt olduğunda burada listelenir.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const hasGoogle = u.accounts.some((a) => a.provider === "google");
                  const tier = tierDef(u.tier);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-slate-800">{u.name ?? "—"}</p>
                          {u.emailVerified && (
                            <CheckCircleIcon
                              width={14}
                              height={14}
                              className="text-emerald-500"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-600">{u.email}</p>
                        <p className="text-xs text-slate-400">{u.phone ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.passwordHash && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              E-posta
                            </span>
                          )}
                          {hasGoogle && (
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                              Google
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            tierBadge[u.tier] ?? tierBadge.BRONZE
                          }`}
                        >
                          {tier.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-accent">
                          {u.points.toLocaleString("tr-TR")}
                        </span>
                        <span className="text-xs text-slate-400">
                          {" "}
                          / {u.lifetimePoints.toLocaleString("tr-TR")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u._count.bookings}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(u.createdAt.toISOString())}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/uyeler/${u.id}`}
                          className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100"
                        >
                          Görüntüle
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
        {icon}
      </div>
      <p className="mt-3 text-2xl font-extrabold text-brand">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
