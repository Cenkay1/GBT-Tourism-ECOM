import { notFound } from "next/navigation";
import TourForm, { TourFormValues } from "@/components/admin/TourForm";
import { updateTour } from "@/lib/admin-actions";
import { getActiveAmenities, getBuses } from "@/lib/tours";
import { prisma } from "@/lib/db";
import { departureDateInput } from "@/lib/shared";

export const dynamic = "force-dynamic";

// Date -> "yyyy-MM-ddTHH:mm" (datetime-local input formatı, yerel saat)
function toLocalInput(d: Date | null): string | undefined {
  if (!d) return undefined;
  return departureDateInput(d);
}

function parseDocs(v: string): { name: string; url: string; size?: number }[] {
  try {
    const a = JSON.parse(v || "[]");
    return Array.isArray(a)
      ? a.filter((d) => d?.name && d?.url).map((d) => ({ name: String(d.name), url: String(d.url), size: typeof d.size === "number" ? d.size : undefined }))
      : [];
  } catch {
    return [];
  }
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hata?: string }>;
}) {
  const { id } = await params;
  const { hata } = await searchParams;
  const [t, amenities, buses] = await Promise.all([
    prisma.tour.findUnique({
      where: { id },
      include: {
        places: { orderBy: { sortOrder: "asc" } },
        departures: {
          orderBy: [{ departureDate: "asc" }, { sortOrder: "asc" }],
          include: { _count: { select: { bookings: true } } },
        },
      },
    }),
    getActiveAmenities(),
    getBuses(),
  ]);
  if (!t) notFound();

  const initial: TourFormValues = {
    title: t.title,
    destination: t.destination,
    category: t.category,
    bookingType: t.bookingType,
    departures: t.departures.map((d) => ({
      id: d.id,
      departureDate: toLocalInput(d.departureDate) ?? "",
      returnDate: toLocalInput(d.returnDate) ?? "",
      capacity: d.capacity ?? undefined,
      status: d.status === "KAPALI" ? ("KAPALI" as const) : ("AKTIF" as const),
      hasBookings: d._count.bookings > 0,
      bookingCount: d._count.bookings,
      busId: d.busId ?? undefined,
    })),
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
    doorAfterRow: t.doorAfterRow ?? undefined,
    backRowFull: t.backRowFull ?? false,
    hasAccommodation: t.hasAccommodation ?? false,
    singleSupplement: t.singleSupplement ?? 2000,
    busId: t.busId ?? undefined,
    documents: parseDocs(t.documents),
    features: JSON.parse(t.features || "[]"),
    excludedFeatures: JSON.parse(t.excludedFeatures || "[]"),
    status: t.status,
    places: t.places.map((p) => ({
      type:
        p.type === "OTEL"
          ? ("OTEL" as const)
          : p.type === "BINIS"
          ? ("BINIS" as const)
          : ("GEZI" as const),
      name: p.name,
      address: p.address ?? undefined,
      mapQuery: p.mapQuery ?? undefined,
      nights: p.nights ?? undefined,
      price: p.price ?? undefined,
      boardingTime: p.boardingTime ?? undefined,
      showOnMap: p.showOnMap,
    })),
  };

  const action = updateTour.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-brand">Turu Düzenle</h1>
      {hata && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{hata}</p>
      )}
      <TourForm
        action={action}
        initial={initial}
        submitLabel="Değişiklikleri Kaydet"
        amenities={amenities}
        buses={buses}
      />
    </div>
  );
}
