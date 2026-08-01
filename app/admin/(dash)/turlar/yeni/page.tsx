import TourForm from "@/components/admin/TourForm";
import { createTour } from "@/lib/admin-actions";
import { getActiveAmenities } from "@/lib/tours";

export const dynamic = "force-dynamic";

export default async function NewTourPage() {
  const amenities = await getActiveAmenities();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-brand">Yeni Tur Ekle</h1>
      <TourForm action={createTour} submitLabel="Turu Kaydet" amenities={amenities} />
    </div>
  );
}
