import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookingLauncher from "@/components/BookingLauncher";
import TourRouteMap from "@/components/TourRouteMap";
import {
  getTourBySlug,
  formatPrice,
  formatDateTime,
  categoryLabel,
  vehicleLabel,
  departureSeatsLeft,
  sellableDepartures,
} from "@/lib/tours";
import { MapPinIcon, BusIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Turu WhatsApp/Instagram/Google'da paylaşınca kapak görseli, başlık ve fiyat çıksın.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tour = await getTourBySlug(slug);
  if (!tour) return { title: "Tur bulunamadı" };

  const priceText = formatPrice(tour.price, tour.currency);
  const desc =
    (tour.description?.trim() ||
      `${tour.destination} · ${tour.durationDays} gün · Kişi başı ${priceText}`).slice(0, 200);
  const image = tour.coverImage || "/logo.png";

  return {
    title: tour.title,
    description: desc,
    openGraph: {
      type: "website",
      title: `${tour.title} — ${priceText}`,
      description: desc,
      images: [{ url: image, alt: tour.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${tour.title} — ${priceText}`,
      description: desc,
      images: [image],
    },
  };
}

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

  // Müşteriye yalnız satışa açık ve tarihi geçmemiş seferler gösterilir
  // (geçmiş seferler arşivdir).
  const activeDepartures = sellableDepartures(tour);
  const visitPlaces = (tour.places ?? []).filter((p) => p.type === "GEZI");
  const boardingPlaces = (tour.places ?? []).filter((p) => p.type === "BINIS");

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

      {/* Galeri — afiş boyutunda, ortalı; görsel sayısına göre uyumlu */}
      {(() => {
        const gallery = tour.images.length ? tour.images : [tour.coverImage];
        return (
          <div className="flex flex-wrap justify-center gap-4">
            {gallery.map((im, i) => (
              <div
                key={i}
                className="w-full max-w-[300px] sm:w-[280px] md:w-[300px]"
              >
                <div className="aspect-[4/5] w-full overflow-hidden rounded-3xl bg-slate-100 shadow-md ring-1 ring-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={im}
                    alt={`${tour.title} ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        );
      })()}

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
            <Info
              label={activeDepartures.length > 1 ? "En Yakın Kalkış" : "Kalkış"}
              value={formatDateTime(tour.departureDate)}
            />
            {tour.returnDate && <Info label="Dönüş" value={formatDateTime(tour.returnDate)} />}
            <Info label="Süre" value={`${tour.durationDays} gün`} />
          </div>

          {/* Bu turun birden çok seferi varsa hepsini listele. */}
          {activeDepartures.length > 1 && (
            <div className="mt-6">
              <h2 className="text-lg font-bold text-brand">Kalkış Tarihleri (Seferler)</h2>
              <p className="mt-1 text-sm text-slate-500">
                Bu tur {activeDepartures.length} ayrı sefer olarak düzenleniyor. Rezervasyon
                sırasında hangi seferi aldığınızı seçeceksiniz.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {activeDepartures.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-brand">
                        {formatDateTime(d.departureDate)}
                      </span>
                      {d.returnDate && (
                        <span className="block text-xs text-slate-400">
                          Dönüş: {formatDateTime(d.returnDate)}
                        </span>
                      )}
                    </span>
                    {tour.bookingType === "KONTENJAN" && (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {departureSeatsLeft(tour, d)} yer
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6">
            <h2 className="text-lg font-bold text-brand">Tur Hakkında</h2>
            <p className="mt-2 leading-relaxed text-slate-600">{tour.description}</p>
          </div>

          {tour.highlights.length > 0 && (
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
          )}

          {tour.amenities && tour.amenities.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-bold text-brand">Fiyata Dahil</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {tour.amenities.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-dark"
                  >
                    <span className="text-base leading-none">{a.icon || "✓"}</span>
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {visitPlaces.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-bold text-brand">Gezilecek Yerler</h2>
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                {visitPlaces.map((p, i) => (
                  <li key={p.id} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">
                      {i + 1}
                    </span>
                    <span>
                      {p.name}
                      {p.address && (
                        <span className="block text-xs text-slate-400">{p.address}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Biniş noktaları ve saatleri — gezilecek yerlerden ayrı */}
          {boardingPlaces.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-bold text-brand">Biniş Noktaları</h2>
              <p className="mt-1 text-sm text-slate-500">
                Rezervasyon sırasında nereden bineceğinizi seçeceksiniz. Otobüsün o noktada
                olacağı saat aşağıda yazılıdır.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {boardingPlaces.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-black/5"
                  >
                    <span className="flex items-start gap-2">
                      <MapPinIcon width={16} height={16} className="mt-0.5 shrink-0 text-brand" />
                      <span>
                        <span className="font-semibold text-slate-700">{p.name}</span>
                        {p.address && (
                          <span className="block text-xs text-slate-400">{p.address}</span>
                        )}
                      </span>
                    </span>
                    {p.boardingTime && (
                      <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">
                        {p.boardingTime}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tur programı belgeleri (PDF / Word) */}
          {tour.documents && tour.documents.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-bold text-brand">Tur Programı</h2>
              <ul className="mt-3 space-y-2">
                {tour.documents.map((d, i) => (
                  <li key={`${d.url}-${i}`}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-black/5 transition hover:ring-brand/30"
                    >
                      <span className="text-xl leading-none">
                        {d.url.toLowerCase().endsWith(".pdf") ? "📄" : "📝"}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-brand">
                        {d.name}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-slate-400">İndir</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tour.excludedAmenities && tour.excludedAmenities.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-bold text-brand">Fiyata Dahil Değil</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {tour.excludedAmenities.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-500"
                  >
                    <span className="text-base leading-none text-red-500">✕</span>
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-brand p-6 text-white md:sticky md:top-24 md:w-72">
          <span className="text-xs text-white/70">Kişi başı fiyat</span>
          <p className="text-3xl font-extrabold">{formatPrice(tour.price, tour.currency)}</p>

          <div className="mt-4 space-y-2 border-t border-white/15 pt-4 text-sm text-white/80">
            <div className="flex items-center justify-between gap-2">
              <span>{activeDepartures.length > 1 ? "En yakın kalkış" : "Kalkış"}</span>
              <span className="text-right font-medium text-white">
                {formatDateTime(tour.departureDate)}
              </span>
            </div>
            {activeDepartures.length > 1 && (
              <div className="flex items-center justify-between">
                <span>Sefer</span>
                <span className="font-medium text-white">{activeDepartures.length} tarih</span>
              </div>
            )}
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
        <TourRouteMap
          // Gezilecek yerlerden yalnız "haritada göster" işaretli olanlar çizilir.
          places={(tour.places ?? []).filter(
            (p) => p.type !== "GEZI" || p.showOnMap !== false
          )}
          departure={tour.departureLocation}
        />
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
