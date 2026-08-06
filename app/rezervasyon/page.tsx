import Link from "next/link";
import { notFound } from "next/navigation";
import { getTourBySlug, formatPrice, formatDate, orderedStops, segmentPrice } from "@/lib/tours";
import { Gender } from "@/lib/shared";
import { submitCheckout } from "@/lib/checkout-actions";
import CheckoutForm from "@/components/CheckoutForm";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ tur?: string; koltuklar?: string; adet?: string; durak?: string; inis?: string }>;
}) {
  const { tur, koltuklar, adet, durak, inis } = await searchParams;
  if (!tur) notFound();
  const tour = await getTourBySlug(tur);
  if (!tour) notFound();

  // Biniş/iniş durağı (varsa) → kişi başı fiyat buradan belirlenir.
  const stops = orderedStops(tour.places ?? []);
  const boardingStop = durak ? stops.find((p) => p.id === durak) : undefined;
  const dropoffStop = inis ? stops.find((p) => p.id === inis) : undefined;
  let unitPrice = tour.price;
  if (tour.type === "SEFER" && boardingStop && dropoffStop) {
    const fromIdx = stops.indexOf(boardingStop);
    const toIdx = stops.indexOf(dropoffStop);
    unitPrice = segmentPrice(tour.segmentPrices, fromIdx, toIdx, tour.price);
  } else if (boardingStop) {
    unitPrice = boardingStop.price ?? tour.price;
  }

  // "5A:E,5B:K" → [{code:"5A",gender:"E"}, ...]
  const seats =
    tour.bookingType === "KOLTUK" && koltuklar
      ? koltuklar
          .split(",")
          .map((part) => {
            const [code, g] = part.split(":");
            return { code: code?.trim(), gender: (g === "K" ? "K" : "E") as Gender };
          })
          .filter((s) => s.code)
      : [];
  const quantity =
    tour.bookingType === "KONTENJAN" ? Math.max(1, Number(adet) || 1) : seats.length;

  if (tour.bookingType === "KOLTUK" && seats.length === 0) {
    return <InvalidState slug={tour.slug} message="Koltuk seçimi bulunamadı." />;
  }

  // Seçilen koltuklardan biri bu arada dolduysa uyar
  const taken = new Set(tour.soldSeats ?? []);
  const conflict = seats.filter((s) => taken.has(s.code));
  if (conflict.length > 0) {
    return (
      <InvalidState
        slug={tour.slug}
        message={`Şu koltuk(lar) az önce satıldı: ${conflict
          .map((s) => s.code)
          .join(", ")}. Lütfen tekrar seçin.`}
      />
    );
  }

  const count = tour.bookingType === "KOLTUK" ? seats.length : quantity;
  const total = unitPrice * count;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-4 text-sm text-slate-500">
        <Link href={`/turlar/${tour.slug}`} className="hover:text-brand">
          ← {tour.title}
        </Link>
      </nav>
      <h1 className="text-2xl font-extrabold text-brand">Rezervasyon Bilgileri</h1>
      <p className="mt-1 text-sm text-slate-500">
        Lütfen yolcu ve iletişim bilgilerini eksiksiz doldurun.
      </p>

      <div className="mt-6">
        <CheckoutForm
          tour={{ id: tour.id, bookingType: tour.bookingType, category: tour.category }}
          seats={seats}
          quantity={quantity}
          action={submitCheckout}
          boardingPlaceId={boardingStop?.id}
          boardingLabel={boardingStop?.name}
          dropoffPlaceId={dropoffStop?.id}
          dropoffLabel={dropoffStop?.name}
          summary={{
            title: tour.title,
            destination: tour.destination,
            departureLabel: formatDate(tour.departureDate),
            priceLabel: formatPrice(unitPrice, tour.currency),
            totalLabel: formatPrice(total, tour.currency),
          }}
        />
      </div>
    </div>
  );
}

function InvalidState({ slug, message }: { slug: string; message: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-lg font-semibold text-brand">{message}</p>
      <Link
        href={`/turlar/${slug}`}
        className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark"
      >
        Tura Geri Dön
      </Link>
    </div>
  );
}
