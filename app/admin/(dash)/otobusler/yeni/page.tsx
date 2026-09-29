import BusForm from "@/components/admin/BusForm";
import { createBus } from "@/lib/admin-actions";

export default function NewBusPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-brand">Yeni Otobüs</h1>
      <p className="mb-6 text-sm text-slate-500">
        Aracın koltuk düzenini ve plakasını girin. Turlarda bu otobüsü seçtiğinizde koltuk
        şeması birebir oluşur.
      </p>
      <BusForm action={createBus} submitLabel="Otobüsü Kaydet" />
    </div>
  );
}
