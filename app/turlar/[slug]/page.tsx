import Link from "next/link";
import { notFound } from "next/navigation";
import BookingLauncher from "@/components/BookingLauncher";
import TourRouteMap from "@/components/TourRouteMap";
import { getTourBySlug, formatPrice, formatDate, categoryLabel, vehicleLabel } from "@/lib/tours";
import { MapPinIcon, BusIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function TourDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ hata?: string; iptal?: string }>;
}) {
  const { slug } = await params;
  const { hata, iptal } = await searchParams;
  const tour = await getTourBySlug(slug);
  if (!tour) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {(hata || iptal) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {hata ?? "Ödeme tamamlanmadı, işlem iptal edildi. Dilerseniz tekrar deneyebilirsiniz."}
        </div>
      )}
      <nav className="mb-4 text-sm text-slate-500">
        <Link href="/" className="hover:text-brand">Ana Sayfa</Link>
        <span className="mx-2">/</span>
        <Link href="/turlar" className="hover:text-brand">Turlar</Link>
        <span className="mx-2">/</span>
        <span className="text-brand">{tour.title}</span>
      </nav>

      {/* Galeri */}
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tour.images[0]}
          alt={tour.title}
          className="h-72 w-full rounded-2xl object-cover md:h-96"
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          {tour.images.slice(1, 3).map((im, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={im}
              alt={`${tour.title} ${i + 2}`}
              className="h-[calc(9rem-0.375rem)] w-full rounded-2xl object-cover md:h-[calc(12rem-0.375rem)]"
            />
          ))}
        </div>
      </div>

      {/* Başlık + bilgi */}
      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              {categoryLabel(tour.category)}
            </span>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              {tour.bookingType === "KOLTUK" ? "Koltuk Seçimli" : "Kontenjanlı"}
            </span>
            {tour.bookingType === "KOLTUK" && tour.vehicleType && (
              <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                <BusIcon width={14} height={14} />
                {vehicleLabel(tour.vehicleType)} · {tour.seatLayout}
              </span>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-brand">{tour.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-slate-500">
            <MapPinIcon width={16} height={16} className="text-slate-400" />
            {tour.destination}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Info label="Kalkış Tarihi" value={formatDate(tour.departureDate)} />
            {tour.returnDate && <Info label="Dönüş" value={formatDate(tour.returnDate)} />}
            <Info label="Süre" value={`${tour.durationDays} gün`} />
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-bold text-brand">Tur Hakkında</h2>
            <p className="mt-2 leading-relaxed text-slate-600">{tour.description}</p>
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-bold text-brand">Öne Çıkanlar</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {tour.highlights.map((h) => (
                <li key={h} className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="text-accent">✓</span> {h}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl bg-brand p-6 text-white md:sticky md:top-24 md:w-72">
          <span className="text-xs text-white/70">Kişi başı fiyat</span>
          <p className="text-3xl font-extrabold">{formatPrice(tour.price, tour.currency)}</p>

          <div className="mt-4 space-y-2 border-t border-white/15 pt-4 text-sm text-white/80">
            <div className="flex items-center justify-between">
              <span>Kalkış</span>
              <span className="font-medium text-white">{formatDate(tour.departureDate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Süre</span>
              <span className="font-medium text-white">{tour.durationDays} gün</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{tour.bookingType === "KOLTUK" ? "Araç" : "Kontenjan"}</span>
              <span className="font-medium text-white">
                {tour.bookingType === "KOLTUK"
                  ? `${vehicleLabel(tour.vehicleType)} · ${tour.seatLayout}`
                  : `${Math.max(0, (tour.capacity ?? 0) - (tour.sold ?? 0))} kişilik yer`}
              </span>
            </div>
          </div>

          <BookingLauncher
            tour={tour}
            className="mt-5 w-full rounded-xl bg-accent py-3 text-center text-sm font-bold text-white transition hover:bg-accent-dark"
          />
          <p className="mt-2 text-center text-[11px] text-white/60">Güvenli ödeme • iyzico</p>
        </div>
      </div>

      {/* Rota & Konaklama haritası (kalkış yeri dahil) */}
      <div className="mt-12">
        <h2 className="mb-5 text-2xl font-extrabold text-brand">Rota & Konaklama</h2>
        <TourRouteMap places={tour.places ?? []} departure={tour.departureLocation} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
      <span className="text-xs text-slate-400">{label}</span>
      <p className="text-sm font-semibold text-brand">{value}</p>
    </div>
  );
}
