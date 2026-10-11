import TourForm from "@/components/admin/TourForm";
import { createTour } from "@/lib/admin-actions";
import { getActiveAmenities, getBuses } from "@/lib/tours";

export const dynamic = "force-dynamic";

export default async function NewTourPage({
  searchParams,
}: {
  searchParams: Promise<{ hata?: string }>;
}) {
  const { hata } = await searchParams;
  const [amenities, buses] = await Promise.all([getActiveAmenities(), getBuses(true)]);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-brand">Yeni Tur Ekle</h1>
      {hata && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{hata}</p>
      )}
      <TourForm action={createTour} submitLabel="Turu Kaydet" amenities={amenities} buses={buses} />
    </div>
  );
}
