import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedTours, getTourById, formatPrice, formatDate } from "@/lib/tours";
import { createManualBooking } from "@/lib/admin-actions";
import AdminSaleForm from "@/components/admin/AdminSaleForm";

export const dynamic = "force-dynamic";

export default async function NewManualSale({
  searchParams,
}: {
  searchParams: Promise<{
    tur?: string;
    hata?: string;
    ad?: string;
    telefon?: string;
    eposta?: string;
    yedek?: string;
  }>;
}) {
  const { tur, hata, ad, telefon, eposta, yedek } = await searchParams;
  // Yedek listeden gelindiyse müşteri bilgileri önden dolu gelir.
  const prefill =
    ad || telefon || eposta
      ? { contactName: ad, contactPhone: telefon, contactEmail: eposta }
      : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/rezervasyonlar" className="text-sm text-slate-500 hover:text-brand">
        ← Rezervasyonlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold text-brand">Elden Satış Ekle</h1>
      <p className="mb-6 text-sm text-slate-500">
        Elden alınan satışı kayıt altına alın. Nakit ve havale doğrudan “Ödendi” olarak
        işaretlenir; kredi kartı seçilirse iyzico güvenli ödeme sayfasına yönlendirilirsiniz.
      </p>

      {hata && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}

      {yedek && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bu satış <strong>yedek listeden</strong> açılıyor. Satışı tamamladıktan sonra
          Yedek Liste ekranında kaydı bu rezervasyona bağlamayı unutmayın — aksi halde
          kişi listede bekliyor görünmeye devam eder.
        </div>
      )}

      {!tur ? <TourPicker /> : <SaleFormLoader id={tur} prefill={prefill} />}
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

async function SaleFormLoader({
  id,
  prefill,
}: {
  id: string;
  prefill?: { contactName?: string; contactPhone?: string; contactEmail?: string };
}) {
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
      <AdminSaleForm tour={tour} action={createManualBooking} prefill={prefill} />
    </>
  );
}
