import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedTours, getTourById, formatPrice, formatDate } from "@/lib/tours";
import { createManualBooking } from "@/lib/admin-actions";
import AdminSaleForm from "@/components/admin/AdminSaleForm";

export const dynamic = "force-dynamic";

export default async function NewManualSale({
  searchParams,
}: {
  searchParams: Promise<{ tur?: string; hata?: string }>;
}) {
  const { tur, hata } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/rezervasyonlar" className="text-sm text-slate-500 hover:text-brand">
        ← Rezervasyonlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold text-brand">Elden Satış Ekle</h1>
      <p className="mb-6 text-sm text-slate-500">
        Nakit/elden alınan satışı kayıt altına alın. Kayıt doğrudan “Ödendi” olarak işaretlenir.
      </p>

      {hata && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}

      {!tur ? <TourPicker /> : <SaleFormLoader id={tur} />}
    </div>
  );
}

async function TourPicker() {
  const tours = await getPublishedTours();
  if (tours.length === 0) {
    return <p className="text-sm text-slate-400">Yayında tur yok.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-600">Satış yapılacak turu seçin:</p>
      {tours.map((t) => (
        <Link
          key={t.id}
          href={`/admin/rezervasyonlar/yeni?tur=${t.id}`}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm hover:border-brand hover:bg-slate-50"
        >
          <span>
            <span className="font-semibold text-slate-800">{t.title}</span>
            <span className="ml-2 text-slate-400">
              {formatDate(t.departureDate)} · {t.bookingType === "KOLTUK" ? "Koltuklu" : "Kontenjanlı"}
            </span>
          </span>
          <span className="font-semibold text-accent">{formatPrice(t.price, t.currency)}</span>
        </Link>
      ))}
    </div>
  );
}

async function SaleFormLoader({ id }: { id: string }) {
  const tour = await getTourById(id);
  if (!tour) notFound();
  return (
    <>
      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <p className="font-semibold text-slate-800">{tour.title}</p>
        <p className="text-sm text-slate-400">
          {tour.destination} · {formatDate(tour.departureDate)} ·{" "}
          {formatPrice(tour.price, tour.currency)} / kişi
        </p>
        <Link
          href="/admin/rezervasyonlar/yeni"
          className="mt-1 inline-block text-xs text-brand hover:underline"
        >
          Turu değiştir
        </Link>
      </div>
      <AdminSaleForm tour={tour} action={createManualBooking} />
    </>
  );
}
