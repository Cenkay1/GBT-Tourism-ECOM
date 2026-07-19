import TourForm from "@/components/admin/TourForm";
import { createTour } from "@/lib/admin-actions";

export default function NewTourPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-brand">Yeni Tur Ekle</h1>
      <TourForm action={createTour} submitLabel="Turu Kaydet" />
    </div>
  );
}
