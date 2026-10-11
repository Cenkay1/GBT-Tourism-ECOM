import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/tours";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/shared";
import {
  PRESETS,
  resolveRange,
  previousRange,
  granularityFor,
  aggregate,
  percentChange,
  describeRange,
  toDateInput,
} from "@/lib/revenue";
import RevenueChart from "@/components/admin/RevenueChart";
import {
  BusIcon,
  TicketIcon,
  WalletIcon,
  UsersIcon,
  ChevronRightIcon,
} from "@/components/Icons";

export const dynamic = "force-dynamic";

const GRAN_LABEL = { gun: "Günlük", ay: "Aylık", yil: "Yıllık" } as const;

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; baslangic?: string; bitis?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();

  // "Tümü" için ilk ödenmiş satışın tarihi.
  const first =
    sp.donem === "tumu"
      ? await prisma.booking.findFirst({
          where: { status: "ODENDI" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      : null;
  const range = resolveRange(sp, now, first?.createdAt);
  const prev = previousRange(range);
  const gran = granularityFor(range);
  const inRange = { gte: range.from, lt: range.to };

  const [tourCount, bannerCount, bookingCount, paid, prevAgg, upcoming] = await Promise.all([
    prisma.tour.count(),
    prisma.banner.count(),
    prisma.booking.count({ where: { createdAt: inRange } }),
    prisma.booking.findMany({
      where: { status: "ODENDI", createdAt: inRange },
      select: { totalAmount: true, createdAt: true, paymentMethod: true, quantity: true },
    }),
    range.all
      ? Promise.resolve(null)
      : prisma.booking.aggregate({
          where: { status: "ODENDI", createdAt: { gte: prev.from, lt: prev.to } },
          _sum: { totalAmount: true },
          _count: true,
        }),
    prisma.tour.findMany({
      where: { status: "YAYINDA", departureDate: { gte: now } },
      orderBy: { departureDate: "asc" },
      take: 6,
    }),
  ]);

  const revenue = paid.reduce((s, b) => s + b.totalAmount, 0);
  const paidCount = paid.length;
  const passengers = paid.reduce((s, b) => s + b.quantity, 0);
  const avg = paidCount ? Math.round(revenue / paidCount) : 0;
  const prevRevenue = prevAgg?._sum.totalAmount ?? 0;
  const delta = prevAgg ? percentChange(revenue, prevRevenue) : null;
  const points = aggregate(paid, range, gran);

  // Ödeme yöntemine göre kırılım
  const byMethod = new Map<string, { amount: number; count: number }>();
  for (const b of paid) {
    const cur = byMethod.get(b.paymentMethod) ?? { amount: 0, count: 0 };
    cur.amount += b.totalAmount;
    cur.count += 1;
    byMethod.set(b.paymentMethod, cur);
  }
  const methods = (Object.keys(PAYMENT_METHODS) as PaymentMethod[])
    .map((k) => ({ key: k, ...PAYMENT_METHODS[k], ...(byMethod.get(k) ?? { amount: 0, count: 0 }) }))
    .filter((m) => m.count > 0);

  const lastDay = new Date(range.to.getTime() - 1);
  const daysLeft = (d: Date) =>
    Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86400000));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Yönetim Paneli</h1>
          <p className="mt-1 text-sm text-slate-500">Gözdem Burak Turizm</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/rezervasyonlar/yeni"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
          >
            + Elden Satış
          </Link>
          <Link
            href="/admin/turlar/yeni"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + Yeni Tur
          </Link>
          <Link
            href="/admin/afisler"
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
          >
            + Afiş
          </Link>
        </div>
      </div>

      {/* Dönem seçimi: hızlı tuşlar + tarih aralığı */}
      <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              href={`/admin?donem=${p.key}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                range.key === p.key
                  ? "bg-brand text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form
          action="/admin"
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"
        >
          <label className="text-xs font-medium text-slate-500">
            Başlangıç
            <input
              type="date"
              name="baslangic"
              required
              defaultValue={toDateInput(range.from)}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Bitiş
            <input
              type="date"
              name="bitis"
              required
              defaultValue={toDateInput(lastDay)}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand"
            />
          </label>
          <button
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
              range.key === "ozel"
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Aralığı Uygula
          </button>
          <p className="ml-auto text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{describeRange(range)}</span> ·{" "}
            {GRAN_LABEL[gran]} görünüm
          </p>
        </form>
      </div>

      {/* Özet kutuları */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Ciro (ödenen)"
          value={formatPrice(revenue, "TRY")}
          icon={<WalletIcon width={22} height={22} />}
          extra={
            delta != null ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                }`}
              >
                {delta >= 0 ? "▲" : "▼"} %{Math.abs(delta) > 999 ? "999+" : Math.abs(Math.round(delta))}
              </span>
            ) : null
          }
          hint={
            range.all
              ? "Tüm zamanlar"
              : `Önceki dönem: ${formatPrice(prevRevenue, "TRY")}`
          }
        />
        <Stat
          label="Ödenen rezervasyon"
          value={paidCount}
          icon={<TicketIcon width={22} height={22} />}
          hint={`${bookingCount} rezervasyon açıldı (tüm durumlar)`}
        />
        <Stat
          label="Yolcu / koltuk"
          value={passengers}
          icon={<UsersIcon width={22} height={22} />}
          hint="Ödenen rezervasyonlarda"
        />
        <Stat
          label="Ortalama sepet"
          value={formatPrice(avg, "TRY")}
          icon={<BusIcon width={22} height={22} />}
          hint={`${tourCount} tur · ${bannerCount} afiş`}
        />
      </div>

      {/* Grafik + yaklaşan turlar yan yana */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold text-brand">Ciro Grafiği</h2>
            <p className="text-2xl font-extrabold text-accent">{formatPrice(revenue, "TRY")}</p>
          </div>
          <div className="mt-3">
            <RevenueChart points={points} />
          </div>

          {methods.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Ödeme yöntemine göre
              </p>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                {methods.map((m) => (
                  <div
                    key={m.key}
                    title={`${m.label}: ${formatPrice(m.amount, "TRY")}`}
                    style={{ width: `${(m.amount / Math.max(revenue, 1)) * 100}%`, background: m.color }}
                  />
                ))}
              </div>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {methods.map((m) => (
                  <li key={m.key} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                      {m.label}
                      <span className="text-xs text-slate-400">({m.count})</span>
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatPrice(m.amount, "TRY")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-brand">Yaklaşan Turlar</h2>
            <Link
              href="/admin/turlar"
              className="flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
            >
              Tümü
              <ChevronRightIcon width={16} height={16} />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">Yaklaşan tur yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((t) => {
                const left = daysLeft(t.departureDate);
                return (
                  <li key={t.id}>
                    <Link
                      href={`/admin/turlar/${t.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-slate-50"
                    >
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <span className="text-base font-extrabold leading-none">{left}</span>
                        <span className="text-[9px] font-semibold uppercase">gün</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-800">{t.title}</p>
                        <p className="truncate text-xs text-slate-400">
                          {formatDate(t.departureDate.toISOString())} • {t.destination}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-accent">
                        {formatPrice(t.price, t.currency)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  hint,
  extra,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  hint?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
          {icon}
        </div>
        {extra}
      </div>
      <p className="mt-3 text-2xl font-extrabold text-brand">{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
