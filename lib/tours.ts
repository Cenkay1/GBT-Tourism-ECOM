// Veri erişim katmanı — DB kayıtlarını uygulama tiplerine dönüştürür.
// Saf tip ve yardımcılar lib/shared.ts'te; buradan yeniden dışa aktarılır.
import { prisma } from "@/lib/db";
import type {
  Category,
  Tour,
  Banner,
  VehicleType,
  Gender,
  TourPlace,
  PlaceType,
  Amenity,
} from "@/lib/shared";
import { releaseExpiredHolds } from "@/lib/booking";

export type {
  Category,
  BookingType,
  SeatStatus,
  Tour,
  Banner,
  Seat,
  VehicleType,
  Gender,
  TourPlace,
  PlaceType,
} from "@/lib/shared";
export {
  buildSeatGrid,
  formatPrice,
  formatDate,
  categoryLabel,
  vehicleLabel,
  genderLabel,
  mapEmbedUrl,
  mapLinkUrl,
  VEHICLES,
} from "@/lib/shared";

type TourRow = {
  id: string;
  slug: string;
  title: string;
  destination: string;
  category: string;
  bookingType: string;
  departureDate: Date;
  returnDate: Date | null;
  departureLocation: string;
  durationDays: number;
  price: number;
  currency: string;
  coverImage: string;
  images: string;
  description: string;
  highlights: string;
  capacity: number | null;
  vehicleType: string | null;
  seatLayout: string | null;
  seatRows: number | null;
  doorAfterRow: number | null;
  backRowFull: boolean;
  singleSupplement: number;
  features: string;
  excludedFeatures: string;
  status: string;
};

function parseJsonArray(v: string): string[] {
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toTour(
  row: TourRow,
  extra?: {
    sold?: number;
    soldSeats?: string[];
    blockedSeats?: string[];
    seatGenders?: Record<string, Gender>;
    places?: TourPlace[];
    amenities?: Amenity[];
    excludedAmenities?: Amenity[];
  }
): Tour {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    destination: row.destination,
    category: row.category as Category,
    bookingType: row.bookingType as Tour["bookingType"],
    departureDate: row.departureDate.toISOString(),
    returnDate: row.returnDate?.toISOString(),
    departureLocation: row.departureLocation,
    durationDays: row.durationDays,
    price: row.price,
    currency: row.currency,
    coverImage: row.coverImage,
    images: parseJsonArray(row.images),
    description: row.description,
    highlights: parseJsonArray(row.highlights),
    status: row.status,
    capacity: row.capacity ?? undefined,
    vehicleType: (row.vehicleType as VehicleType | null) ?? undefined,
    seatLayout: row.seatLayout ?? undefined,
    seatRows: row.seatRows ?? undefined,
    doorAfterRow: row.doorAfterRow ?? undefined,
    backRowFull: row.backRowFull ?? false,
    singleSupplement: row.singleSupplement ?? 2000,
    sold: extra?.sold,
    soldSeats: extra?.soldSeats,
    blockedSeats: extra?.blockedSeats,
    seatGenders: extra?.seatGenders,
    places: extra?.places,
    features: parseJsonArray(row.features),
    excludedFeatures: parseJsonArray(row.excludedFeatures),
    amenities: extra?.amenities,
    excludedAmenities: extra?.excludedAmenities,
  };
}

// Aktif özellikler (admin form + genel kullanım).
export async function getActiveAmenities(): Promise<Amenity[]> {
  const rows = await prisma.amenity.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    active: a.active,
    sortOrder: a.sortOrder,
  }));
}

// Verilen id listesine karşılık gelen aktif özellikleri sıralı döndürür.
async function resolveAmenities(ids: string[]): Promise<Amenity[]> {
  if (ids.length === 0) return [];
  const all = await getActiveAmenities();
  const set = new Set(ids);
  return all.filter((a) => set.has(a.id));
}

export async function getTourById(id: string): Promise<Tour | null> {
  // Önce süresi dolan geçici koltuk kilitlerini serbest bırak.
  await releaseExpiredHolds();

  const row = await prisma.tour.findUnique({
    where: { id },
    include: { seats: true, places: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) return null;

  // Satılı/kilitli koltuklar müsait değil; BLOKE koltuklar admin tarafından kapatılmış.
  const takenSeatRows = row.seats.filter(
    (s) => s.status === "SATILDI" || s.status === "KILITLI"
  );
  const takenSeats = takenSeatRows.map((s) => s.code);
  const blockedSeats = row.seats.filter((s) => s.status === "BLOKE").map((s) => s.code);
  const seatGenders: Record<string, Gender> = {};
  for (const s of takenSeatRows) {
    if (s.gender === "E" || s.gender === "K") seatGenders[s.code] = s.gender;
  }

  let soldCount: number | undefined;
  if (row.bookingType === "KONTENJAN") {
    const active = await prisma.booking.findMany({
      where: {
        tourId: row.id,
        OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }],
      },
      select: { quantity: true },
    });
    soldCount = active.reduce((sum, b) => sum + b.quantity, 0);
  }

  const places: TourPlace[] = (row.places ?? []).map((p) => ({
    id: p.id,
    type: p.type as PlaceType,
    name: p.name,
    address: p.address ?? undefined,
    mapQuery: p.mapQuery ?? undefined,
    nights: p.nights ?? undefined,
    price: p.price ?? undefined,
    sortOrder: p.sortOrder,
  }));

  return toTour(row as TourRow, {
    soldSeats: takenSeats,
    blockedSeats,
    seatGenders,
    sold: soldCount,
    places,
  });
}

export async function getPublishedTours(filters?: {
  category?: Category;
  q?: string;
}): Promise<Tour[]> {
  const rows = await prisma.tour.findMany({
    where: { status: "YAYINDA" },
    orderBy: { departureDate: "asc" },
  });

  // Tüm aktif özellikleri bir kez çek, id→özellik map'i kur (tur başına ekstra sorgu yok).
  const allAmenities = await getActiveAmenities();
  const amenityById = new Map(allAmenities.map((a) => [a.id, a]));

  let tours = rows.map((r) => {
    const ids = parseJsonArray((r as TourRow).features);
    const amenities = ids
      .map((id) => amenityById.get(id))
      .filter((a): a is Amenity => Boolean(a));
    return toTour(r as TourRow, { amenities });
  });

  if (filters?.category) {
    tours = tours.filter((t) => t.category === filters.category);
  }
  if (filters?.q) {
    const s = filters.q.toLocaleLowerCase("tr");
    tours = tours.filter((t) =>
      `${t.title} ${t.destination}`.toLocaleLowerCase("tr").includes(s)
    );
  }
  return tours;
}

// Afiş link seçici gibi yerler için hafif tur listesi (yayında olanlar, tarihe göre).
export async function getTourOptions(): Promise<{ slug: string; title: string }[]> {
  const rows = await prisma.tour.findMany({
    where: { status: "YAYINDA" },
    orderBy: { departureDate: "asc" },
    select: { slug: true, title: true },
  });
  return rows;
}

export async function getTourBySlug(slug: string): Promise<Tour | null> {
  // Önce süresi dolan geçici koltuk kilitlerini serbest bırak.
  await releaseExpiredHolds();

  const row = await prisma.tour.findUnique({
    where: { slug },
    include: { seats: true, places: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) return null;

  // Satılı VE kilitli koltuklar müsait değil; BLOKE koltuklar admin tarafından kapatılmış.
  const takenSeatRows = row.seats.filter(
    (s) => s.status === "SATILDI" || s.status === "KILITLI"
  );
  const takenSeats = takenSeatRows.map((s) => s.code);
  const blockedSeats = row.seats.filter((s) => s.status === "BLOKE").map((s) => s.code);
  const seatGenders: Record<string, Gender> = {};
  for (const s of takenSeatRows) {
    if (s.gender === "E" || s.gender === "K") seatGenders[s.code] = s.gender;
  }

  let soldCount: number | undefined;
  if (row.bookingType === "KONTENJAN") {
    // Ödenen + aktif kilitli (bekleyen) rezervasyonların kişi sayısı.
    const active = await prisma.booking.findMany({
      where: {
        tourId: row.id,
        OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }],
      },
      select: { quantity: true },
    });
    soldCount = active.reduce((sum, b) => sum + b.quantity, 0);
  }

  const places: TourPlace[] = (row.places ?? []).map((p) => ({
    id: p.id,
    type: p.type as PlaceType,
    name: p.name,
    address: p.address ?? undefined,
    mapQuery: p.mapQuery ?? undefined,
    nights: p.nights ?? undefined,
    price: p.price ?? undefined,
    sortOrder: p.sortOrder,
  }));

  const amenities = await resolveAmenities(parseJsonArray(row.features));
  const excludedAmenities = await resolveAmenities(
    parseJsonArray((row as unknown as TourRow).excludedFeatures)
  );

  return toTour(row as TourRow, {
    soldSeats: takenSeats,
    blockedSeats,
    seatGenders,
    sold: soldCount,
    places,
    amenities,
    excludedAmenities,
  });
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  location?: string;
}

export async function getActiveReviews(): Promise<Review[]> {
  const rows = await prisma.review.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    author: r.author,
    rating: r.rating,
    text: r.text,
    location: r.location ?? undefined,
  }));
}

export async function getActiveBanners(): Promise<Banner[]> {
  const rows = await prisma.banner.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    image: b.image,
    linkUrl: b.linkUrl,
  }));
}
