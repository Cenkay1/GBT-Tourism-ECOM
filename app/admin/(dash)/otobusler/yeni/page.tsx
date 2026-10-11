import BusForm from "@/components/admin/BusForm";
import { createBus } from "@/lib/admin-actions";

export default async function NewBusPage({
  searchParams,
}: {
  searchParams: Promise<{ hata?: string }>;
}) {
  const { hata } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-brand">Yeni Otobüs</h1>
      <p className="mb-6 text-sm text-slate-500">
        Aracın koltuk planını ve plakasını girin. Turlarda bu otobüsü seçtiğinizde koltuk
        şeması birebir oluşur.
      </p>
      {hata && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}
      <BusForm action={createBus} submitLabel="Otobüsü Kaydet" />
    </div>
  );
}
