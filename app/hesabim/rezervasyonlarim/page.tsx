import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { getUserBookings } from "@/lib/account";
import BookingRow from "@/components/account/BookingRow";

export const metadata: Metadata = { title: "Rezervasyonlarım" };

export default async function MyBookingsPage() {
  const user = (await getCurrentUser())!;
  const bookings = await getUserBookings(user.id);

  return (
    <div>
      <h2 className="mb-4 font-bold text-brand">Rezervasyonlarım</h2>
      {bookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            Henüz rezervasyonunuz yok. Aynı e-posta ile misafir olarak yaptığınız geçmiş
            rezervasyonlar, e-postanızı doğruladığınızda otomatik olarak burada listelenir.
          </p>
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
    </div>
  );
}
