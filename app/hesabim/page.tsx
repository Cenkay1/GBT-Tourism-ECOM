import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { getUserBookings } from "@/lib/account";
import { tierDef } from "@/lib/loyalty";
import LoyaltyCard from "@/components/account/LoyaltyCard";
import BookingRow from "@/components/account/BookingRow";
import { TicketIcon, AwardIcon, ChevronRightIcon } from "@/components/Icons";

export const metadata: Metadata = { title: "Hesabım" };

export default async function AccountHome() {
  const user = (await getCurrentUser())!; // layout korumasından sonra kesin var
  const bookings = await getUserBookings(user.id, 3);
  const paidCount = (await getUserBookings(user.id)).filter((b) => b.status === "ODENDI").length;
  const tier = tierDef(user.tier);

  return (
    <div className="space-y-6">
      <LoyaltyCard points={user.points} lifetimePoints={user.lifetimePoints} />

      {/* Hızlı istatistikler */}
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<TicketIcon width={18} height={18} />} label="Tamamlanan Tur" value={String(paidCount)} />
        <Stat
          icon={<AwardIcon width={18} height={18} />}
          label="Kademe"
          value={tier.label}
        />
        <Stat
          label="Ömür Boyu Puan"
          value={user.lifetimePoints.toLocaleString("tr-TR")}
        />
      </div>

      {/* Son rezervasyonlar */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-brand">Son Rezervasyonlar</h2>
          {bookings.length > 0 && (
            <Link
              href="/hesabim/rezervasyonlarim"
              className="flex items-center gap-0.5 text-sm font-medium text-brand hover:text-accent"
            >
              Tümü <ChevronRightIcon width={16} height={16} />
            </Link>
          )}
        </div>
        {bookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">Henüz rezervasyonunuz yok.</p>
            <Link
              href="/turlar"
              className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-accent-dark"
            >
              Turları Keşfet
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <BookingRow key={b.id} b={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white p-4 text-center shadow-sm">
      {icon && (
        <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          {icon}
        </div>
      )}
      <p className="text-lg font-extrabold text-brand">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
