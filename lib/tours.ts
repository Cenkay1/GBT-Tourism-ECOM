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
  TourDeparture,
  SeatState,
  Bus,
  TourDocument,
} from "@/lib/shared";
import { parseSeatMap } from "@/lib/shared";
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
  TourDeparture,
  SeatState,
} from "@/lib/shared";
export {
  buildSeatGrid,
  departureSeatsLeft,
  seatLayoutOf,
  formatDateTime,
  formatTime,
  busLabel,
  busSeatCount,
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
  documents: string;
  capacity: number | null;
  busId: string | null;
  vehicleType: string | null;
  seatLayout: string | null;
  seatRows: number | null;
  doorAfterRow: number | null;
  backRowFull: boolean;
  hasAccommodation: boolean;
  singleSupplement: number;
  features: string;
  excludedFeatures: string;
  status: string;
};

// Tur belgeleri (PDF/Word) JSON dizisi → tip güvenli liste.
function parseDocuments(v: string): TourDocument[] {
  try {
    const parsed = JSON.parse(v || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((d) => d && typeof d.name === "string" && typeof d.url === "string")
      .map((d) => ({
        name: String(d.name),
        url: String(d.url),
        size: typeof d.size === "number" ? d.size : undefined,
      }));
  } catch {
    return [];
  }
}

type BusRow = {
  id: string;
  name: string;
  plate: string;
  vehicleType: string;
  seatLayout: string;
  seatRows: number;
  doorAfterRow: number | null;
  backRowFull: boolean;
  seatMap: string | null;
  notes: string;
  active: boolean;
};

function toBus(row: BusRow): Bus {
  return {
    id: row.id,
    name: row.name,
    plate: row.plate,
    vehicleType: row.vehicleType as VehicleType,
    seatLayout: row.seatLayout,
    seatRows: row.seatRows,
    doorAfterRow: row.doorAfterRow ?? undefined,
    backRowFull: row.backRowFull,
    seatMap: parseSeatMap(row.seatMap) ?? undefined,
    notes: row.notes,
    active: row.active,
  };
}

// Filodaki araçlar (admin form + genel kullanım). Aktif olmayanlar hariç
// tutulabilir; düzenleme ekranında seçili araç pasif olsa da görünmeli.
export async function getBuses(onlyActive = false): Promise<Bus[]> {
  const rows = await prisma.bus.findMany({
    where: onlyActive ? { active: true } : undefined,
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => toBus(r as BusRow));
}

export async function getBusById(id: string): Promise<Bus | null> {
  const row = await prisma.bus.findUnique({ where: { id } });
  return row ? toBus(row as BusRow) : null;
}

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
    departures?: TourDeparture[];
    bus?: Bus;
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
    documents: parseDocuments(row.documents),
    status: row.status,
    busId: row.busId ?? undefined,
    bus: extra?.bus,
    capacity: row.capacity ?? undefined,
    vehicleType: (row.vehicleType as VehicleType | null) ?? undefined,
    seatLayout: row.seatLayout ?? undefined,
    seatRows: row.seatRows ?? undefined,
    doorAfterRow: row.doorAfterRow ?? undefined,
    backRowFull: row.backRowFull ?? false,
    seatMap: extra?.bus?.seatMap,
    hasAccommodation: row.hasAccommodation ?? false,
    singleSupplement: row.singleSupplement ?? 2000,
    sold: extra?.sold,
    soldSeats: extra?.soldSeats,
    blockedSeats: extra?.blockedSeats,
    seatGenders: extra?.seatGenders,
    places: extra?.places,
    departures: extra?.departures,
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

// --- Sefer (TourDeparture) yükleme ---
// Koltuk durumu ve kontenjan sefer bazlıdır. Bu yardımcı bir turun tüm
// seferlerini durumlarıyla birlikte kurar ve geriye dönük uyumluluk için
// en yakın AKTIF seferin durumunu "tur seviyesi" alanlara da yansıtır.
type SeatRow = { code: string; status: string; gender: string | null; departureId: string | null };
type DepartureRow = {
  id: string;
  departureDate: Date;
  returnDate: Date | null;
  capacity: number | null;
  status: string;
  sortOrder: number;
  busId: string | null;
  bus?: BusRow | null;
};

async function buildDepartures(
  tour: {
    id: string;
    bookingType: string;
    capacity: number | null;
    vehicleType?: string | null;
    seatLayout?: string | null;
    seatRows?: number | null;
    doorAfterRow?: number | null;
    backRowFull?: boolean;
  },
  departureRows: DepartureRow[],
  seatRows: SeatRow[],
  defaultBus?: Bus
): Promise<{ departures: TourDeparture[]; primary?: TourDeparture }> {
  const now = new Date();
  // KONTENJAN: sefer başına satılan kişi sayısı (ödenen + bekleyen).
  const soldByDeparture = new Map<string, number>();
  if (tour.bookingType === "KONTENJAN" && departureRows.length > 0) {
    const active = await prisma.booking.findMany({
      where: {
        tourId: tour.id,
        OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }],
      },
      select: { quantity: true, departureId: true },
    });
    for (const b of active) {
      if (!b.departureId) continue;
      soldByDeparture.set(
        b.departureId,
        (soldByDeparture.get(b.departureId) ?? 0) + b.quantity
      );
    }
  }

  const departures: TourDeparture[] = departureRows.map((d) => {
    const own = seatRows.filter((s) => s.departureId === d.id);
    const takenRows = own.filter(
      (s) => s.status === "SATILDI" || s.status === "KILITLI"
    );
    const seatGenders: Record<string, Gender> = {};
    for (const s of takenRows) {
      if (s.gender === "E" || s.gender === "K") seatGenders[s.code] = s.gender;
    }
    // Etkin araç: seferin otobüsü > turun varsayılan otobüsü. Araç yoksa
    // turdaki elle girilmiş düzen kullanılır (eski turlar).
    const bus = d.bus ? toBus(d.bus) : defaultBus;
    return {
      id: d.id,
      departureDate: d.departureDate.toISOString(),
      returnDate: d.returnDate?.toISOString(),
      capacity: d.capacity ?? undefined,
      status: d.status,
      sortOrder: d.sortOrder,
      busId: d.busId ?? undefined,
      bus,
      vehicleType: (bus?.vehicleType ?? tour.vehicleType ?? undefined) as
        | VehicleType
        | undefined,
      seatLayout: bus?.seatLayout ?? tour.seatLayout ?? undefined,
      seatRows: bus?.seatRows ?? tour.seatRows ?? undefined,
      doorAfterRow: bus?.doorAfterRow ?? tour.doorAfterRow ?? undefined,
      backRowFull: bus?.backRowFull ?? tour.backRowFull ?? false,
      seatMap: bus?.seatMap,
      isPast: d.departureDate < now,
      sold: tour.bookingType === "KONTENJAN" ? soldByDeparture.get(d.id) ?? 0 : undefined,
      soldSeats: takenRows.map((s) => s.code),
      blockedSeats: own.filter((s) => s.status === "BLOKE").map((s) => s.code),
      seatGenders,
    };
  });

  // Tur seviyesi alanlar satışa açık EN YAKIN GELECEK seferi yansıtır. Böyle
  // bir sefer yoksa (hepsi geçmiş = arşiv) en son sefere düşer.
  const primary =
    departures.find((d) => d.status === "AKTIF" && !d.isPast) ??
    departures[departures.length - 1] ??
    undefined;
  return { departures, primary };
}

// Bir seferin koltuk durumunu buildSeatGrid'e verilecek biçimde döndürür.
export function seatStateOf(dep?: TourDeparture): SeatState | undefined {
  if (!dep) return undefined;
  return {
    soldSeats: dep.soldSeats ?? [],
    blockedSeats: dep.blockedSeats ?? [],
    seatGenders: dep.seatGenders ?? {},
    // Otobüs sefer bazında değişebildiği için düzen de sefere ait.
    vehicleType: dep.vehicleType,
    seatRows: dep.seatRows,
    doorAfterRow: dep.doorAfterRow,
    backRowFull: dep.backRowFull,
    seatMap: dep.seatMap,
  };
}

// Verilen sefer id'sini çözer; yoksa en yakın AKTIF sefere düşer.
export function resolveDeparture(
  tour: Tour,
  departureId?: string | null
): TourDeparture | undefined {
  const list = tour.departures ?? [];
  if (departureId) {
    const found = list.find((d) => d.id === departureId);
    if (found) return found;
  }
  // Varsayılan: satışa açık en yakın GELECEK sefer (geçmiş seferler arşivdir).
  return list.find((d) => d.status === "AKTIF" && !d.isPast);
}

// Müşteriye gösterilecek seferler: satışa açık ve tarihi geçmemiş olanlar.
export function sellableDepartures(tour: Tour): TourDeparture[] {
  return (tour.departures ?? []).filter((d) => d.status === "AKTIF" && !d.isPast);
}

// Tur arşivde mi? (satılabilir sefer kalmadıysa)
export function isArchivedTour(tour: Tour): boolean {
  return sellableDepartures(tour).length === 0;
}

function toPlaces(rows: {
  id: string;
  type: string;
  name: string;
  address: string | null;
  mapQuery: string | null;
  nights: number | null;
  price: number | null;
  boardingTime: string | null;
  showOnMap: boolean;
  sortOrder: number;
}[]): TourPlace[] {
  return rows.map((p) => ({
    id: p.id,
    type: p.type as PlaceType,
    name: p.name,
    address: p.address ?? undefined,
    mapQuery: p.mapQuery ?? undefined,
    nights: p.nights ?? undefined,
    price: p.price ?? undefined,
    boardingTime: p.boardingTime ?? undefined,
    showOnMap: p.showOnMap,
    sortOrder: p.sortOrder,
  }));
}

export async function getTourById(id: string): Promise<Tour | null> {
  // Önce süresi dolan geçici koltuk kilitlerini serbest bırak.
  await releaseExpiredHolds();

  const row = await prisma.tour.findUnique({
    where: { id },
    include: {
      seats: true,
      bus: true,
      places: { orderBy: { sortOrder: "asc" } },
      departures: {
        orderBy: [{ departureDate: "asc" }, { sortOrder: "asc" }],
        include: { bus: true },
      },
    },
  });
  if (!row) return null;

  const defaultBus = row.bus ? toBus(row.bus as BusRow) : undefined;
  const { departures, primary } = await buildDepartures(
    row,
    row.departures as DepartureRow[],
    row.seats,
    defaultBus
  );

  return toTour(row as TourRow, {
    bus: defaultBus,
    departures,
    soldSeats: primary?.soldSeats ?? [],
    blockedSeats: primary?.blockedSeats ?? [],
    seatGenders: primary?.seatGenders ?? {},
    sold: primary?.sold,
    places: toPlaces(row.places ?? []),
  });
}

// Sitede listelenen turlar. Tarihi geçen seferler arşiv sayılır: satışa açık
// gelecek seferi kalmayan tur listelerde GÖRÜNMEZ (includeArchived ile istenirse
// admin tarafında getirilebilir).
export async function getPublishedTours(filters?: {
  category?: Category;
  q?: string;
  includeArchived?: boolean;
}): Promise<Tour[]> {
  const now = new Date();
  const rows = await prisma.tour.findMany({
    where: { status: "YAYINDA" },
    orderBy: { departureDate: "asc" },
    include: {
      departures: {
        where: filters?.includeArchived
          ? undefined
          : { status: "AKTIF", departureDate: { gte: now } },
        orderBy: { departureDate: "asc" },
        select: {
          id: true,
          departureDate: true,
          returnDate: true,
          capacity: true,
          status: true,
          sortOrder: true,
        },
      },
    },
  });

  // Tüm aktif özellikleri bir kez çek, id→özellik map'i kur (tur başına ekstra sorgu yok).
  const allAmenities = await getActiveAmenities();
  const amenityById = new Map(allAmenities.map((a) => [a.id, a]));

  let tours = rows
    // Satılabilir seferi kalmayan tur = arşiv → listeye girmez.
    .filter((r) => filters?.includeArchived || r.departures.length > 0)
    .map((r) => {
      const ids = parseJsonArray((r as unknown as TourRow).features);
      const amenities = ids
        .map((id) => amenityById.get(id))
        .filter((a): a is Amenity => Boolean(a));
      // Kart üzerinde kaç sefer olduğunu ve en yakın tarihi göstermek için.
      const departures: TourDeparture[] = r.departures.map((d) => ({
        id: d.id,
        departureDate: d.departureDate.toISOString(),
        returnDate: d.returnDate?.toISOString(),
        capacity: d.capacity ?? undefined,
        status: d.status,
        sortOrder: d.sortOrder,
        isPast: d.departureDate < now,
      }));
      const tour = toTour(r as unknown as TourRow, { amenities, departures });
      // Listede görünen tarih, satışa açık en yakın sefer olmalı.
      const next = departures.find((d) => d.status === "AKTIF" && !d.isPast);
      if (next) {
        tour.departureDate = next.departureDate;
        tour.returnDate = next.returnDate;
      }
      return tour;
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
    where: {
      status: "YAYINDA",
      // Arşiv turları afiş bağlantısı olarak önerilmez.
      departures: { some: { status: "AKTIF", departureDate: { gte: new Date() } } },
    },
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
    include: {
      seats: true,
      bus: true,
      places: { orderBy: { sortOrder: "asc" } },
      departures: {
        orderBy: [{ departureDate: "asc" }, { sortOrder: "asc" }],
        include: { bus: true },
      },
    },
  });
  if (!row) return null;

  const defaultBus = row.bus ? toBus(row.bus as BusRow) : undefined;
  const { departures, primary } = await buildDepartures(
    row,
    row.departures as DepartureRow[],
    row.seats,
    defaultBus
  );

  const amenities = await resolveAmenities(parseJsonArray(row.features));
  const excludedAmenities = await resolveAmenities(
    parseJsonArray((row as unknown as TourRow).excludedFeatures)
  );

  return toTour(row as TourRow, {
    bus: defaultBus,
    departures,
    soldSeats: primary?.soldSeats ?? [],
    blockedSeats: primary?.blockedSeats ?? [],
    seatGenders: primary?.seatGenders ?? {},
    sold: primary?.sold,
    places: toPlaces(row.places ?? []),
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
