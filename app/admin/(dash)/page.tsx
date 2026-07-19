import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/tours";
import {
  BusIcon,
  ImageIcon,
  TicketIcon,
  WalletIcon,
  ChevronRightIcon,
} from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [tourCount, bannerCount, bookingCount, paidBookings, upcoming] =
    await Promise.all([
      prisma.tour.count(),
      prisma.banner.count(),
      prisma.booking.count(),
      prisma.booking.findMany({ where: { status: "ODENDI" } }),
      prisma.tour.findMany({
        where: { status: "YAYINDA" },
        orderBy: { departureDate: "asc" },
        take: 5,
      }),
    ]);

  const revenue = paidBookings.reduce((sum, b) => sum + b.totalAmount, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand">Yönetim Paneli</h1>
      <p className="mt-1 text-sm text-slate-500">Gözdem Burak Turizm</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Toplam Tur" value={tourCount} icon={<BusIcon width={22} height={22} />} />
        <Stat label="Aktif Afiş" value={bannerCount} icon={<ImageIcon width={22} height={22} />} />
        <Stat label="Rezervasyon" value={bookingCount} icon={<TicketIcon width={22} height={22} />} />
        <Stat
          label="Ciro (ödenen)"
          value={formatPrice(revenue, "TRY")}
          icon={<WalletIcon width={22} height={22} />}
        />
      </div>

      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
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
          <p className="text-sm text-slate-400">Henüz tur eklenmemiş.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {formatDate(t.departureDate.toISOString())} • {t.destination}
                  </p>
                </div>
                <span className="text-sm font-semibold text-accent">
                  {formatPrice(t.price, t.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/turlar/yeni"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          + Yeni Tur Ekle
        </Link>
        <Link
          href="/admin/afisler"
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Afiş Ekle
        </Link>
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
