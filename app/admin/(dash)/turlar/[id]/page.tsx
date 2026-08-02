import { notFound } from "next/navigation";
import TourForm, { TourFormValues } from "@/components/admin/TourForm";
import { updateTour } from "@/lib/admin-actions";
import { getActiveAmenities } from "@/lib/tours";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Date -> "yyyy-MM-ddTHH:mm" (datetime-local input formatı, yerel saat)
function toLocalInput(d: Date | null): string | undefined {
  if (!d) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function parseArr(v: string): string {
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.join("\n") : "";
  } catch {
    return "";
  }
}

export default async function EditTourPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, amenities] = await Promise.all([
    prisma.tour.findUnique({
      where: { id },
      include: { places: { orderBy: { sortOrder: "asc" } } },
    }),
    getActiveAmenities(),
  ]);
  if (!t) notFound();

  const initial: TourFormValues = {
    title: t.title,
    destination: t.destination,
    category: t.category,
    bookingType: t.bookingType,
    departureDate: toLocalInput(t.departureDate),
    returnDate: toLocalInput(t.returnDate),
    departureLocation: t.departureLocation,
    durationDays: t.durationDays,
    price: t.price,
    currency: t.currency,
    coverImage: t.coverImage,
    images: parseArr(t.images),
    description: t.description,
    highlights: parseArr(t.highlights),
    capacity: t.capacity ?? undefined,
    vehicleType: t.vehicleType ?? undefined,
    seatRows: t.seatRows ?? undefined,
    features: JSON.parse(t.features || "[]"),
    excludedFeatures: JSON.parse(t.excludedFeatures || "[]"),
    status: t.status,
    places: t.places.map((p) => ({
      type: p.type === "OTEL" ? ("OTEL" as const) : ("DURAK" as const),
      name: p.name,
      address: p.address ?? undefined,
      mapQuery: p.mapQuery ?? undefined,
      nights: p.nights ?? undefined,
      price: p.price ?? undefined,
    })),
  };

  const action = updateTour.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-brand">Turu Düzenle</h1>
      <TourForm action={action} initial={initial} submitLabel="Değişiklikleri Kaydet" amenities={amenities} />
    </div>
  );
}
