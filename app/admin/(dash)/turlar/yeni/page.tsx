import TourForm from "@/components/admin/TourForm";
import { createTour } from "@/lib/admin-actions";
import { getActiveAmenities, getBuses } from "@/lib/tours";
import { DEFAULT_DEPOSIT_PERCENT, DEFAULT_BALANCE_DUE_DAYS } from "@/lib/shared";

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
      {/* Yeni turlar acentenin standart ön satış koşullarıyla açılır (%25 /
          5 gün); istenirse formda 0 yazılarak ön ödeme kapatılabilir. */}
      <TourForm
        action={createTour}
        submitLabel="Turu Kaydet"
        amenities={amenities}
        buses={buses}
        initial={{
          depositPercent: DEFAULT_DEPOSIT_PERCENT,
          balanceDueDays: DEFAULT_BALANCE_DUE_DAYS,
        }}
      />
    </div>
  );
}
