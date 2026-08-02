import Link from "next/link";
import { notFound } from "next/navigation";
import { getTourById, buildSeatGrid, vehicleLabel } from "@/lib/tours";
import AdminSeatBlocker from "@/components/admin/AdminSeatBlocker";

export const dynamic = "force-dynamic";

export default async function SeatManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tour = await getTourById(id);
  if (!tour) notFound();

  const rows = buildSeatGrid(tour);

  return (
    <div className="mx-auto max-w-2xl">
      <nav className="mb-4 text-sm text-slate-500">
        <Link href="/admin/turlar" className="hover:text-brand">Turlar</Link>
        <span className="mx-2">/</span>
        <Link href={`/admin/turlar/${id}`} className="hover:text-brand">{tour.title}</Link>
        <span className="mx-2">/</span>
        <span className="text-brand">Koltuk Yönetimi</span>
      </nav>

      <h1 className="text-2xl font-bold text-brand">Koltuk Yönetimi</h1>
      <p className="mt-1 text-sm text-slate-500">
        {tour.title}
        {tour.bookingType === "KOLTUK" && (
          <> · {vehicleLabel(tour.vehicleType)} · {tour.seatLayout}</>
        )}
      </p>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        {tour.bookingType !== "KOLTUK" ? (
          <p className="text-sm text-slate-400">
            Bu tur kontenjanlı; koltuk yönetimi yalnızca koltuk seçimli turlar içindir.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">
            Bu tur için henüz koltuk oluşturulmamış. Turu düzenleyip araç tipi ve sıra sayısını kaydedin.
          </p>
        ) : (
          <AdminSeatBlocker tourId={tour.id} rows={rows} />
        )}
      </div>
    </div>
  );
}
