"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getSessionEmail } from "@/lib/auth";
import {
  VEHICLES,
  VehicleType,
  SeatMapRows,
  seatCodes,
  seatMapCodes,
  seatMapLayoutLabel,
  parseSeatMap,
  isValidClockTime,
  isValidPhone,
} from "@/lib/shared";
import {
  createManualPaidBooking,
  createManualCardBooking,
  cancelBooking,
  cancelBookingByAdmin,
} from "@/lib/booking";
import { startPayment } from "@/lib/payment";
import { tourSaveErrorMessage, newErrorRef } from "@/lib/tour-save-errors";
import type { FormState } from "@/lib/form-state";

async function requireAdmin() {
  const email = await getSessionEmail();
  if (!email) redirect("/admin/login");
}

function slugify(s: string): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
  };
  return s
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = slugify(base) || "tur";
  let i = 1;
  while (true) {
    const found = await prisma.tour.findUnique({ where: { slug } });
    if (!found || found.id === excludeId) return slug;
    slug = `${slugify(base)}-${++i}`;
  }
}

function str(fd: FormData, k: string): string {
  return (fd.get(k) as string | null)?.trim() ?? "";
}
function num(fd: FormData, k: string): number {
  return Number(fd.get(k) ?? 0) || 0;
}
function optNum(fd: FormData, k: string): number | null {
  const v = fd.get(k);
  if (v == null || v === "") return null;
  return Number(v) || null;
}

// ---- TUR ----

// Tur belgeleri (PDF/Word) — formdan JSON dizi olarak gelir.
interface DocumentInput {
  name?: string;
  url?: string;
  size?: number;
}

function parseDocuments(raw: string): { name: string; url: string; size?: number }[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return (parsed as DocumentInput[])
      .filter((d) => d?.name?.trim() && d?.url?.trim())
      .map((d) => ({
        name: d.name!.trim(),
        url: d.url!.trim(),
        size: typeof d.size === "number" ? d.size : undefined,
      }));
  } catch {
    return [];
  }
}

function parseIdList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Form → Tour tablosu alanları.
// Dönüş tipi Prisma'nın kendi girdi tipine bağlıdır: şemadan kaldırılmış bir
// kolon burada kalırsa DERLEME ZAMANINDA hata verir. (Aksi halde `{ ...data }`
// spread'i TypeScript'in fazla-alan kontrolünü atlatır ve hata ancak çalışma
// anında 500 olarak görünür.) Test edilebilmesi için dışa açıktır.
export async function tourDataFromForm(
  fd: FormData
): Promise<Omit<Prisma.TourUncheckedCreateInput, "slug">> {
  const bookingType = str(fd, "bookingType");
  const images = str(fd, "images")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const features = parseIdList(str(fd, "features"));
  const excludedFeatures = parseIdList(str(fd, "excludedFeatures"));
  const highlights = str(fd, "highlights")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const coverImage = str(fd, "coverImage") || images[0] || "";
  const documents = parseDocuments(str(fd, "documents"));

  // Araç: otobüs seçildiyse koltuk düzeni ONDAN gelir (elle girilen alanlar
  // yok sayılır). Otobüs seçilmediyse eski davranış — alanlar elle girilir.
  const busId = bookingType === "KOLTUK" ? str(fd, "busId") || null : null;
  const bus = busId ? await prisma.bus.findUnique({ where: { id: busId } }) : null;

  const vehicleType =
    bookingType !== "KOLTUK"
      ? null
      : bus
      ? bus.vehicleType
      : str(fd, "vehicleType") || "OTOBUS";
  const seatLayout =
    vehicleType && VEHICLES[vehicleType as VehicleType]
      ? VEHICLES[vehicleType as VehicleType].layout
      : null;
  const seatRows = bus ? bus.seatRows : bookingType === "KOLTUK" ? optNum(fd, "seatRows") : null;
  const doorAfterRow = bus
    ? bus.doorAfterRow
    : bookingType === "KOLTUK"
    ? optNum(fd, "doorAfterRow")
    : null;
  const backRowFull = bus
    ? bus.backRowFull
    : bookingType === "KOLTUK"
    ? str(fd, "backRowFull") === "on"
    : false;

  return {
    title: str(fd, "title"),
    destination: str(fd, "destination"),
    category: str(fd, "category"),
    bookingType,
    // Kalkış/dönüş seferlerden türetilir (satışa açık en yakın sefer).
    ...primaryDates(parseDepartures(str(fd, "departures"))),
    departureLocation: str(fd, "departureLocation"),
    durationDays: num(fd, "durationDays") || 1,
    price: num(fd, "price"),
    currency: str(fd, "currency") || "TRY",
    coverImage,
    images: JSON.stringify(images.length ? images : coverImage ? [coverImage] : []),
    description: str(fd, "description"),
    highlights: JSON.stringify(highlights),
    documents: JSON.stringify(documents),
    capacity: bookingType === "KONTENJAN" ? optNum(fd, "capacity") : null,
    busId,
    vehicleType,
    seatLayout,
    seatRows,
    doorAfterRow,
    backRowFull,
    hasAccommodation: str(fd, "hasAccommodation") === "on",
    singleSupplement: optNum(fd, "singleSupplement") ?? 2000,
    features: JSON.stringify(features),
    excludedFeatures: JSON.stringify(excludedFeatures),
    status: str(fd, "status") || "YAYINDA",
  };
}

// ---- SEFERLER (TourDeparture) ----

interface DepartureInput {
  id?: string;
  departureDate: string; // yyyy-MM-ddTHH:mm
  returnDate?: string;
  capacity?: number;
  status?: string;
  busId?: string; // sefere özel otobüs (boşsa turun varsayılanı)
}

interface ParsedDeparture {
  id?: string;
  departureDate: Date;
  returnDate: Date | null;
  capacity: number | null;
  status: string;
  busId: string | null;
}

// Form'dan gelen sefer JSON'unu ayrıştır: geçersiz tarihli satırlar atılır,
// dönüş kalkıştan önce olamaz, sonuç kalkış tarihine göre sıralanır.
function parseDepartures(raw: string): ParsedDeparture[] {
  let rows: DepartureInput[] = [];
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    rows = [];
  }
  const out: ParsedDeparture[] = [];
  for (const r of rows) {
    if (!r?.departureDate) continue;
    const dep = new Date(r.departureDate);
    if (Number.isNaN(dep.getTime())) continue;
    let ret = r.returnDate ? new Date(r.returnDate) : null;
    if (ret && (Number.isNaN(ret.getTime()) || ret < dep)) ret = null;
    out.push({
      id: r.id || undefined,
      departureDate: dep,
      returnDate: ret,
      capacity: r.capacity ? Math.max(1, Math.round(Number(r.capacity))) : null,
      status: r.status === "KAPALI" ? "KAPALI" : "AKTIF",
      busId: r.busId?.trim() || null,
    });
  }
  out.sort((a, b) => a.departureDate.getTime() - b.departureDate.getTime());
  return out;
}

// Turun listelerde/paylaşımda görünen kalkış-dönüşü: satışa açık en yakın sefer.
function primaryDates(deps: ParsedDeparture[]): {
  departureDate: Date;
  returnDate: Date | null;
} {
  const primary = deps.find((d) => d.status === "AKTIF") ?? deps[0];
  if (!primary) return { departureDate: new Date(), returnDate: null };
  return { departureDate: primary.departureDate, returnDate: primary.returnDate };
}

interface SeatConfig {
  bookingType: string;
  busId: string | null; // turun varsayılan otobüsü
  vehicleType: string | null; // otobüs yoksa elle girilen düzen
  seatRows: number | null;
  backRowFull: boolean;
}

interface SeatLayout {
  vehicleType: string;
  seatRows: number;
  backRowFull: boolean;
  seatMap: SeatMapRows | null; // serbest plan varsa koltuk kodları ondan gelir
}

// Düzenin koltuk kodları: serbest plan varsa numaralar, yoksa eski harfli düzen.
function layoutCodes(layout: SeatLayout): string[] {
  return layout.seatMap
    ? seatMapCodes(layout.seatMap)
    : seatCodes(layout.vehicleType as VehicleType, layout.seatRows, layout.backRowFull);
}

// Bir seferin etkin koltuk düzeni: seferin otobüsü > turun otobüsü > turdaki
// elle girilmiş alanlar. Koltuklar bu düzene göre üretilir.
async function resolveSeatLayout(
  seat: SeatConfig,
  departureBusId: string | null
): Promise<SeatLayout | null> {
  if (seat.bookingType !== "KOLTUK") return null;
  const busId = departureBusId ?? seat.busId;
  if (busId) {
    const bus = await prisma.bus.findUnique({ where: { id: busId } });
    if (bus) {
      return {
        vehicleType: bus.vehicleType,
        seatRows: bus.seatRows,
        backRowFull: bus.backRowFull,
        seatMap: parseSeatMap(bus.seatMap),
      };
    }
  }
  if (!seat.seatRows) return null;
  return {
    vehicleType: seat.vehicleType ?? "OTOBUS",
    seatRows: seat.seatRows,
    backRowFull: seat.backRowFull,
    seatMap: null,
  };
}

// Bir seferin koltuklarını (gerekiyorsa) yeniden üretir. Satılmış/kilitli/bloke
// koltuğu olan sefere DOKUNULMAZ — düzen değişikliği mevcut satışı bozmamalı.
async function syncDepartureSeats(
  tourId: string,
  departureId: string,
  layout: SeatLayout | null
): Promise<void> {
  if (!layout) return;
  const seats = await prisma.seat.findMany({
    where: { tourId, departureId },
    select: { code: true, status: true },
  });
  const hasActive = seats.some((s) => s.status !== "BOS");
  if (hasActive) return;

  const wanted = layoutCodes(layout);
  const current = seats.map((s) => s.code);
  const same =
    current.length === wanted.length && wanted.every((c) => current.includes(c));
  if (same) return;

  await prisma.seat.deleteMany({ where: { tourId, departureId } });
  await generateSeats(tourId, departureId, layout);
}

// Otobüsün düzeni değişince onu kullanan (henüz satış olmayan) seferlerin
// koltuklarını güncelle. Turun varsayılanı olarak kullanıldığı seferler dahil.
async function regenerateSeatsForBus(busId: string): Promise<void> {
  const departures = await prisma.tourDeparture.findMany({
    where: {
      OR: [{ busId }, { busId: null, tour: { busId } }],
    },
    select: { id: true, tourId: true, busId: true, tour: { select: { bookingType: true } } },
  });
  for (const d of departures) {
    if (d.tour.bookingType !== "KOLTUK") continue;
    const bus = await prisma.bus.findUnique({ where: { id: busId } });
    if (!bus) continue;
    await syncDepartureSeats(d.tourId, d.id, {
      vehicleType: bus.vehicleType,
      seatRows: bus.seatRows,
      backRowFull: bus.backRowFull,
      seatMap: parseSeatMap(bus.seatMap),
    });
  }
}

// Seferleri kaydet. Rezervasyonu olan sefer silinmez; formdan çıkarılmışsa
// satışa kapatılır. Yeni seferler için koltuklar otomatik üretilir.
async function saveDepartures(tourId: string, raw: string, seat: SeatConfig) {
  const submitted = parseDepartures(raw);
  const existing = await prisma.tourDeparture.findMany({
    where: { tourId },
    include: { _count: { select: { bookings: true } } },
  });
  const existingById = new Map(existing.map((d) => [d.id, d]));
  const keptIds = new Set<string>();

  for (let i = 0; i < submitted.length; i++) {
    const d = submitted[i];
    const current = d.id ? existingById.get(d.id) : undefined;
    // Koltuk düzeni seferin otobüsünden (yoksa turun otobüsünden) gelir.
    const layout = await resolveSeatLayout(seat, d.busId);
    if (current) {
      keptIds.add(current.id);
      await prisma.tourDeparture.update({
        where: { id: current.id },
        data: {
          departureDate: d.departureDate,
          returnDate: d.returnDate,
          capacity: seat.bookingType === "KONTENJAN" ? d.capacity : null,
          status: d.status,
          sortOrder: i,
          busId: d.busId,
        },
      });
      // Otobüs/düzen değiştiyse (ve satış yoksa) koltukları güncelle.
      await syncDepartureSeats(tourId, current.id, layout);
    } else {
      const created = await prisma.tourDeparture.create({
        data: {
          tourId,
          departureDate: d.departureDate,
          returnDate: d.returnDate,
          capacity: seat.bookingType === "KONTENJAN" ? d.capacity : null,
          status: d.status,
          sortOrder: i,
          busId: d.busId,
        },
      });
      keptIds.add(created.id);
      if (layout) {
        await generateSeats(tourId, created.id, layout);
      }
    }
  }

  // Formdan çıkarılan seferler: rezervasyonu varsa sil(me) — satışa kapat.
  for (const d of existing) {
    if (keptIds.has(d.id)) continue;
    if (d._count.bookings > 0) {
      await prisma.tourDeparture.update({
        where: { id: d.id },
        data: { status: "KAPALI" },
      });
    } else {
      await prisma.tourDeparture.delete({ where: { id: d.id } });
    }
  }

  // Hiç sefer kalmadıysa turun kendi tarihinden bir sefer aç (veri tutarlılığı).
  const remaining = await prisma.tourDeparture.count({ where: { tourId } });
  if (remaining === 0) {
    const tour = await prisma.tour.findUnique({ where: { id: tourId } });
    if (tour) {
      const created = await prisma.tourDeparture.create({
        data: {
          tourId,
          departureDate: tour.departureDate,
          returnDate: tour.returnDate,
          capacity: tour.bookingType === "KONTENJAN" ? tour.capacity : null,
        },
      });
      const layout = await resolveSeatLayout(seat, null);
      if (layout) {
        await generateSeats(tourId, created.id, layout);
      }
    }
  }

  await syncTourDates(tourId);
}

// Tour.departureDate/returnDate'i satışa açık en yakın seferden güncelle.
async function syncTourDates(tourId: string) {
  // Turun listelerde görünen tarihi: satışa açık EN YAKIN GELECEK sefer.
  // Böyle bir sefer yoksa (tur arşivdeyse) en son sefer.
  const upcoming = await prisma.tourDeparture.findFirst({
    where: { tourId, status: "AKTIF", departureDate: { gte: new Date() } },
    orderBy: { departureDate: "asc" },
  });
  const primary =
    upcoming ??
    (await prisma.tourDeparture.findFirst({
      where: { tourId },
      orderBy: { departureDate: "desc" },
    }));
  if (!primary) return;
  await prisma.tour.update({
    where: { id: tourId },
    data: { departureDate: primary.departureDate, returnDate: primary.returnDate },
  });
}

interface PlaceInput {
  type: string;
  name: string;
  address?: string;
  mapQuery?: string;
  nights?: number;
  price?: number;
  boardingTime?: string; // BINIS için "HH:MM"
  showOnMap?: boolean; // GEZI için
}

// Form'dan gelen JSON durak/otel listesini kaydet (önce mevcutları sil).
async function savePlaces(tourId: string, raw: string) {
  let places: PlaceInput[] = [];
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) places = parsed;
  } catch {
    places = [];
  }
  await prisma.tourPlace.deleteMany({ where: { tourId } });
  const valid = places.filter((p) => p.name?.trim());
  if (valid.length === 0) return;
  await prisma.tourPlace.createMany({
    data: valid.map((p, i) => {
      const type = p.type === "OTEL" ? "OTEL" : p.type === "BINIS" ? "BINIS" : "GEZI";
      const time = p.boardingTime?.trim();
      return {
        tourId,
        type,
        name: p.name.trim(),
        address: p.address?.trim() || null,
        mapQuery: (p.mapQuery?.trim() || p.address?.trim() || p.name.trim()) || null,
        nights: type === "OTEL" && p.nights ? Number(p.nights) : null,
        price: type === "BINIS" && p.price ? Math.round(Number(p.price)) : null,
        // Biniş saati yalnız biniş noktalarında ve "HH:MM" biçiminde tutulur.
        boardingTime: type === "BINIS" && time && isValidClockTime(time) ? time : null,
        // Gezilecek yer haritada gösterilsin mi (diğer tiplerde her zaman evet).
        showOnMap: type === "GEZI" ? p.showOnMap !== false : true,
        sortOrder: i,
      };
    }),
  });
}

// Bir seferin koltuklarını üret (koltuklar sefere bağlıdır).
async function generateSeats(tourId: string, departureId: string, layout: SeatLayout) {
  const data = layoutCodes(layout).map((code) => ({
    tourId,
    departureId,
    code,
    status: "BOS",
  }));
  if (data.length) await prisma.seat.createMany({ data });
}

function seatConfigOf(data: {
  bookingType: string;
  busId?: string | null;
  vehicleType?: string | null;
  seatRows?: number | null;
  backRowFull?: boolean;
}): SeatConfig {
  return {
    bookingType: data.bookingType,
    busId: data.busId ?? null,
    vehicleType: data.vehicleType ?? null,
    seatRows: data.seatRows ?? null,
    backRowFull: data.backRowFull ?? false,
  };
}

export async function createTour(fd: FormData) {
  await requireAdmin();

  // Veritabanı işi ayrı: redirect() kendi sinyalini throw ettiği için ASLA
  // try bloğunun içinde çağrılmamalı, yoksa başarılı kayıt hataya düşer.
  let tourId: string;
  try {
    const data = await tourDataFromForm(fd);
    const slug = await uniqueSlug(data.title);
    const tour = await prisma.tour.create({ data: { ...data, slug } });
    // Koltuklar sefer bazlı üretilir; saveDepartures her yeni sefer için üretir.
    await saveDepartures(tour.id, str(fd, "departures"), seatConfigOf(data));
    await savePlaces(tour.id, str(fd, "places"));
    tourId = tour.id;
  } catch (e) {
    const ref = newErrorRef();
    console.error("[tur oluşturma hatası]", ref, e);
    redirect(`/admin/turlar/yeni?hata=${encodeURIComponent(tourSaveErrorMessage(e, ref))}`);
  }

  revalidatePath("/");
  revalidatePath("/admin/turlar");
  revalidatePath(`/admin/turlar/${tourId}`);
  redirect("/admin/turlar");
}

export async function updateTour(id: string, fd: FormData) {
  await requireAdmin();

  try {
    const data = await tourDataFromForm(fd);
    const slug = await uniqueSlug(data.title, id);

    await prisma.tour.update({ where: { id }, data: { ...data, slug } });
    await saveDepartures(id, str(fd, "departures"), seatConfigOf(data));

    // Koltuklar saveDepartures içinde her seferin kendi aracına göre güncellenir
    // (satışı olan sefere dokunulmaz).
    await savePlaces(id, str(fd, "places"));
  } catch (e) {
    const ref = newErrorRef();
    console.error("[tur güncelleme hatası]", ref, e);
    redirect(`/admin/turlar/${id}?hata=${encodeURIComponent(tourSaveErrorMessage(e, ref))}`);
  }

  revalidatePath("/");
  revalidatePath("/admin/turlar");
  revalidatePath(`/admin/turlar/${id}`);
  redirect("/admin/turlar");
}

export async function deleteTour(id: string) {
  await requireAdmin();
  await prisma.tour.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin/turlar");
}

// ---- KOLTUK YÖNETİMİ (BLOKE) ----
// Acente görevlisi ön/istenen koltukları online satışa kapatır (BLOKE) veya açar (BOS).
// Satılı/kilitli koltuklara dokunulmaz.
export async function toggleSeatBlock(
  tourId: string,
  departureId: string,
  code: string,
  block: boolean
) {
  await requireAdmin();
  await prisma.seat.updateMany({
    where: { tourId, departureId, code, status: block ? "BOS" : "BLOKE" },
    data: { status: block ? "BLOKE" : "BOS" },
  });
  revalidatePath(`/admin/turlar/${tourId}/koltuklar`);
  revalidatePath("/");
}

// ---- OTOBÜSLER (FİLO) ----
// Araç tanımı koltuk düzenini ve plakayı taşır. Turlar/seferler buradan araç
// seçer; koltuk şeması araca göre birebir oluşur ve hatırlatma mesajlarında
// plaka yazılır.

// Koltuk planı formdan JSON olarak gelir (BusForm'daki çizim aracı). Gönderilmişse
// geçerli olmak zorunda: bozuk plan sessizce eski düzene düşürülmez.
function busDataFromForm(fd: FormData) {
  const vehicleType = str(fd, "vehicleType") || "OTOBUS";
  const rawMap = str(fd, "seatMap");
  const seatMap = parseSeatMap(rawMap);
  const seatMapError =
    rawMap.trim() && !seatMap
      ? "Koltuk planı geçersiz: numaralar 1–999 arası ve tekrarsız olmalı, en az bir koltuk bulunmalı."
      : null;
  const seatRows = seatMap ? seatMap.length : Math.max(1, num(fd, "seatRows") || 12);
  const door = optNum(fd, "doorAfterRow");
  return {
    data: {
      name: str(fd, "name"),
      plate: str(fd, "plate").toLocaleUpperCase("tr"),
      vehicleType,
      seatLayout: seatMap
        ? seatMapLayoutLabel(seatMap)
        : VEHICLES[vehicleType as VehicleType]?.layout ?? VEHICLES.OTOBUS.layout,
      seatRows,
      doorAfterRow: door != null && door >= 1 && door <= seatRows ? door : null,
      backRowFull: seatMap ? false : str(fd, "backRowFull") === "on",
      seatMap: seatMap ? JSON.stringify(seatMap) : null,
      notes: str(fd, "notes"),
      active: fd.get("active") === "on",
    },
    seatMapError,
  };
}

// Bir aracın koltuk kodları (serbest plan ya da eski harfli düzen).
function busCodes(b: {
  vehicleType: string;
  seatRows: number;
  backRowFull: boolean;
  seatMap: string | null;
}): string[] {
  const map = parseSeatMap(b.seatMap);
  return map
    ? seatMapCodes(map)
    : seatCodes((b.vehicleType as VehicleType) in VEHICLES ? (b.vehicleType as VehicleType) : "OTOBUS", b.seatRows, b.backRowFull);
}

export async function createBus(fd: FormData) {
  await requireAdmin();
  const { data, seatMapError } = busDataFromForm(fd);
  if (seatMapError) {
    redirect(`/admin/otobusler/yeni?hata=${encodeURIComponent(seatMapError)}`);
  }
  if (!data.name || !data.plate) {
    redirect(
      `/admin/otobusler?hata=${encodeURIComponent("Otobüs adı ve plaka zorunludur.")}`
    );
  }
  await prisma.bus.create({ data });
  revalidatePath("/admin/otobusler");
  revalidatePath("/admin/turlar");
  redirect("/admin/otobusler");
}

export async function updateBus(id: string, fd: FormData) {
  await requireAdmin();
  const { data, seatMapError } = busDataFromForm(fd);
  if (seatMapError) {
    redirect(`/admin/otobusler/${id}?hata=${encodeURIComponent(seatMapError)}`);
  }
  if (!data.name || !data.plate) {
    redirect(
      `/admin/otobusler/${id}?hata=${encodeURIComponent("Otobüs adı ve plaka zorunludur.")}`
    );
  }

  // Koltuk NUMARALARI değişiyorsa, bu aracı kullanan bir seferde satılmış/kilitli/
  // kapalı koltuk varken izin verilmez: seferdeki koltuklar eski numaralarla
  // kayıtlı, yeni plan onları göstermez ve dolu koltuk boş görünürdü.
  // (Yalnız yerleşim/kapı değişip numaralar aynı kalıyorsa serbest.)
  const before = await prisma.bus.findUnique({ where: { id } });
  if (before) {
    const oldCodes = new Set(busCodes(before));
    const newCodes = busCodes(data);
    const sameCodes =
      oldCodes.size === newCodes.length && newCodes.every((c) => oldCodes.has(c));
    if (!sameCodes) {
      const activeSeats = await prisma.seat.count({
        where: {
          status: { not: "BOS" },
          departure: { OR: [{ busId: id }, { busId: null, tour: { busId: id } }] },
        },
      });
      if (activeSeats > 0) {
        redirect(
          `/admin/otobusler/${id}?hata=${encodeURIComponent(
            `Bu otobüsü kullanan seferlerde ${activeSeats} satılmış/kilitli/kapalı koltuk var; koltuk numaralarını değiştirmek mevcut satışları bozar. Numaraları aynı bırakıp yalnız yerleşimi/kapıyı değiştirebilir ya da yeni bir otobüs ekleyip seferde onu seçebilirsiniz.`
          )}`
        );
      }
    }
  }
  await prisma.bus.update({ where: { id }, data });

  // Düzen değiştiyse bu otobüsü kullanan ve HENÜZ SATIŞ OLMAYAN seferlerin
  // koltuklarını yeniden üret; satış başlamış seferlere dokunulmaz.
  await regenerateSeatsForBus(id);

  revalidatePath("/admin/otobusler");
  revalidatePath("/admin/turlar");
  redirect("/admin/otobusler");
}

export async function deleteBus(id: string) {
  await requireAdmin();
  // Kullanımdaki otobüs silinmez (turların/seferlerin düzeni bozulmasın).
  const [tourCount, departureCount] = await Promise.all([
    prisma.tour.count({ where: { busId: id } }),
    prisma.tourDeparture.count({ where: { busId: id } }),
  ]);
  if (tourCount + departureCount > 0) {
    redirect(
      `/admin/otobusler?hata=${encodeURIComponent(
        `Bu otobüs ${tourCount + departureCount} tur/seferde kullanılıyor. Silmek yerine "Pasif" yapın.`
      )}`
    );
  }
  await prisma.bus.delete({ where: { id } });
  revalidatePath("/admin/otobusler");
}

export async function toggleBus(id: string, active: boolean) {
  await requireAdmin();
  await prisma.bus.update({ where: { id }, data: { active } });
  revalidatePath("/admin/otobusler");
}

// ---- AFİŞ ----

export async function createBanner(fd: FormData) {
  await requireAdmin();
  await prisma.banner.create({
    data: {
      title: str(fd, "title"),
      subtitle: str(fd, "subtitle"),
      image: str(fd, "image"),
      linkUrl: str(fd, "linkUrl"),
      sortOrder: num(fd, "sortOrder"),
      active: fd.get("active") === "on",
    },
  });
  revalidatePath("/");
  revalidatePath("/admin/afisler");
  redirect("/admin/afisler");
}

export async function updateBanner(id: string, fd: FormData) {
  await requireAdmin();
  await prisma.banner.update({
    where: { id },
    data: {
      title: str(fd, "title"),
      subtitle: str(fd, "subtitle"),
      image: str(fd, "image"),
      linkUrl: str(fd, "linkUrl"),
      sortOrder: num(fd, "sortOrder"),
      active: fd.get("active") === "on",
    },
  });
  revalidatePath("/");
  revalidatePath("/admin/afisler");
  redirect("/admin/afisler");
}

export async function deleteBanner(id: string) {
  await requireAdmin();
  await prisma.banner.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin/afisler");
}

export async function toggleBanner(id: string, active: boolean) {
  await requireAdmin();
  await prisma.banner.update({ where: { id }, data: { active } });
  revalidatePath("/");
  revalidatePath("/admin/afisler");
}

// ---- ÖZELLİKLER (AMENITY) ----

export async function createAmenity(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) redirect("/admin/ozellikler");
  await prisma.amenity.create({
    data: {
      name,
      icon: str(fd, "icon"),
      sortOrder: num(fd, "sortOrder"),
      active: fd.get("active") === "on",
    },
  });
  revalidatePath("/admin/ozellikler");
  revalidatePath("/admin/turlar");
  redirect("/admin/ozellikler");
}

export async function updateAmenity(id: string, fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) redirect(`/admin/ozellikler/${id}`);
  await prisma.amenity.update({
    where: { id },
    data: {
      name,
      icon: str(fd, "icon"),
      sortOrder: num(fd, "sortOrder"),
      active: fd.get("active") === "on",
    },
  });
  revalidatePath("/admin/ozellikler");
  revalidatePath("/admin/turlar");
  redirect("/admin/ozellikler");
}

export async function deleteAmenity(id: string) {
  await requireAdmin();
  await prisma.amenity.delete({ where: { id } });
  revalidatePath("/admin/ozellikler");
  revalidatePath("/admin/turlar");
}

export async function toggleAmenity(id: string, active: boolean) {
  await requireAdmin();
  await prisma.amenity.update({ where: { id }, data: { active } });
  revalidatePath("/admin/ozellikler");
  revalidatePath("/admin/turlar");
}

// ---- REZERVASYON ----

interface ManualPassengerInput {
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  seatCode?: string;
  gender?: "E" | "K";
}

export async function createManualBooking(fd: FormData) {
  await requireAdmin();

  const tourId = str(fd, "tourId");
  const tour = await prisma.tour.findUnique({ where: { id: tourId } });
  if (!tour) {
    redirect(
      `/admin/rezervasyonlar/yeni?hata=${encodeURIComponent("Tur bulunamadı.")}`
    );
  }

  let rawPassengers: ManualPassengerInput[] = [];
  try {
    const parsed = JSON.parse(str(fd, "passengers") || "[]");
    if (Array.isArray(parsed)) rawPassengers = parsed;
  } catch {
    rawPassengers = [];
  }

  const passengers = rawPassengers
    .filter((p) => p.firstName?.trim() && p.lastName?.trim())
    .map((p) => ({
      firstName: p.firstName!.trim(),
      lastName: p.lastName!.trim(),
      idNumber: p.idNumber?.trim() || undefined,
      seatCode: p.seatCode?.trim() || undefined,
      gender: p.gender === "E" || p.gender === "K" ? p.gender : undefined,
    }));

  let seatCodes: string[] = [];
  try {
    const parsed = JSON.parse(str(fd, "seatCodes") || "[]");
    if (Array.isArray(parsed)) seatCodes = parsed.map((c) => String(c));
  } catch {
    seatCodes = [];
  }

  const totalRaw = fd.get("totalAmount");
  const totalOverride =
    totalRaw != null && totalRaw !== "" ? Number(totalRaw) : null;

  const methodRaw = str(fd, "paymentMethod");
  const method: "NAKIT" | "HAVALE" | "KREDI_KARTI" =
    methodRaw === "HAVALE" || methodRaw === "KREDI_KARTI" ? methodRaw : "NAKIT";

  const base = {
    tourId,
    departureId: str(fd, "departureId") || undefined,
    contactName: str(fd, "contactName"),
    contactPhone: str(fd, "contactPhone"),
    contactEmail: str(fd, "contactEmail"),
    passengers,
    seatCodes: tour!.bookingType === "KOLTUK" ? seatCodes : undefined,
    quantity: tour!.bookingType === "KONTENJAN" ? num(fd, "quantity") : undefined,
    totalOverride,
  };

  const back = (error: string) =>
    `/admin/rezervasyonlar/yeni?tur=${tourId}&hata=${encodeURIComponent(error)}`;

  // Kredi kartı: iyzico güvenli ödeme sayfasına yönlendir (kart orada girilir).
  if (method === "KREDI_KARTI") {
    const contactEmail = str(fd, "contactEmail");
    if (!/^\S+@\S+\.\S+$/.test(contactEmail) || !isValidPhone(str(fd, "contactPhone"))) {
      redirect(back("Kredi kartı ödemesi için geçerli bir e-posta ve cep telefonu girilmeli (iyzico zorunlu tutar)."));
    }
    const card = await createManualCardBooking(base);
    if (!card.ok) redirect(back(card.error));

    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("host") ?? "localhost:3000";
    let redirectUrl: string | null = null;
    try {
      ({ redirectUrl } = await startPayment({
        bookingId: card.bookingId,
        amount: card.amount,
        currency: tour!.currency,
        contactName: base.contactName,
        contactEmail: base.contactEmail,
        contactPhone: base.contactPhone,
        tourTitle: tour!.title,
        baseUrl: `${proto}://${host}`,
      }));
    } catch (e) {
      // iyzico başlatılamadı: kilitli koltukları geri bırak, görevliye nedeni göster.
      await cancelBooking(card.bookingId);
      redirect(back(`iyzico ödeme sayfası açılamadı: ${e instanceof Error ? e.message : "bilinmeyen hata"}`));
    }
    revalidatePath("/admin/rezervasyonlar");
    redirect(redirectUrl!);
  }

  const result = await createManualPaidBooking({ ...base, paymentMethod: method });
  if (!result.ok) {
    redirect(back(result.error));
  }

  revalidatePath("/admin/rezervasyonlar");
  revalidatePath("/");
  redirect("/admin/rezervasyonlar");
}

// ---- YAŞ DOĞRULAMA (çocuk / bebek) ----
// Görevli, müşterinin yüklediği kimlik belgesini panelde görüp yaşı onaylar.
// Onay yalnız bir kayıt/işaret: fiyat rezervasyon anında belgeye göre
// hesaplandığı için burada tutar değişmez.
export async function setPassengerAgeVerified(
  passengerId: string,
  verified: boolean
) {
  await requireAdmin();
  const passenger = await prisma.passenger.update({
    where: { id: passengerId },
    data: { ageVerified: verified },
    select: { bookingId: true },
  });
  revalidatePath(`/admin/rezervasyonlar/${passenger.bookingId}`);
  revalidatePath("/admin/rezervasyonlar");
}

// Kimlik belgesini kalıcı olarak sil (KVKK: iş bittiğinde belgeyi tutmayın).
// Onay kaydı (ageVerified) korunur; yalnız dosya ve referansı kaldırılır.
export async function deletePassengerDocument(passengerId: string) {
  await requireAdmin();
  const passenger = await prisma.passenger.findUnique({
    where: { id: passengerId },
    select: { bookingId: true, idDocument: true },
  });
  if (!passenger) return;

  if (passenger.idDocument) {
    const { idDocumentPath } = await import("@/lib/id-documents");
    const filePath = idDocumentPath(passenger.idDocument);
    if (filePath) {
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath).catch(() => {
        // Dosya zaten yoksa sorun değil; referansı temizlemeye devam et.
      });
    }
  }
  await prisma.passenger.update({
    where: { id: passengerId },
    data: { idDocument: null },
  });
  revalidatePath(`/admin/rezervasyonlar/${passenger.bookingId}`);
}

// Durum değişikliği. İPTAL burada ELE ALINMAZ: iptal koltuk boşaltma, puan
// geri alımı ve müşteri bildirimi gerektirdiği için cancelBookingAction'a
// aittir. Buraya "IPTAL" gelirse sessizce yanlış iş yapmak yerine reddediyoruz.
export async function setBookingStatus(id: string, status: string) {
  await requireAdmin();
  if (status === "IPTAL") {
    throw new Error(
      "İptal için cancelBookingAction kullanılmalı (koltuk boşaltma ve bildirim gerekiyor)."
    );
  }
  // Hedef durum ne olursa olsun: mevcut durumu IPTAL olan bir rezervasyon
  // buradan değiştirilemez. İptalde koltuk zaten BOS'a alınmıştır — kaydı
  // "ödendi" gibi bir duruma geri çekmek koltuğun ikinci kez satılmış
  // olabileceği gerçeğini gizler (otobüste iki yolcu tek koltuk). İptal
  // edilmiş bir rezervasyon yeniden aktifleştirilemez; gerekirse yeni bir
  // rezervasyon açılmalı.
  const current = await prisma.booking.findUnique({
    where: { id },
    select: { status: true },
  });
  if (current?.status === "IPTAL") {
    throw new Error(
      "Bu rezervasyon iptal edilmiş; durumu buradan değiştirilemez. İptal edilmiş rezervasyon yeniden aktifleştirilemez — gerekirse müşteri için yeni bir rezervasyon açın."
    );
  }
  await prisma.booking.update({ where: { id }, data: { status } });
  revalidatePath("/admin/rezervasyonlar");
  revalidatePath(`/admin/rezervasyonlar/${id}`);
}

// Görevli iptali: koltuğu serbest bırakır, puanı geri alır, müşteriye
// gerekçeli iptal e-postası gönderir. useActionState imzası.
export async function cancelBookingAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();

  const bookingId = String(fd.get("bookingId") ?? "").trim();
  const reason = String(fd.get("reason") ?? "").trim();
  if (!bookingId) return { ok: false, error: "Rezervasyon belirtilmedi." };
  if (!reason) return { ok: false, error: "İptal nedeni yazılmalı — bu metin müşteriye gidiyor." };

  const res = await cancelBookingByAdmin(bookingId, reason);
  if (!res.ok) return { ok: false, error: res.error ?? "İptal edilemedi." };

  revalidatePath("/admin/rezervasyonlar");
  revalidatePath(`/admin/rezervasyonlar/${bookingId}`);
  revalidatePath("/");

  return {
    ok: true,
    message: "Rezervasyon iptal edildi, koltuklar serbest bırakıldı ve müşteriye bilgi e-postası gönderildi.",
  };
}

export async function deleteBooking(id: string) {
  await requireAdmin();
  await prisma.booking.delete({ where: { id } });
  revalidatePath("/admin/rezervasyonlar");
  redirect("/admin/rezervasyonlar");
}

// ---- YORUMLAR ----

export async function createReview(fd: FormData) {
  await requireAdmin();
  const rating = Math.min(5, Math.max(1, num(fd, "rating") || 5));
  await prisma.review.create({
    data: {
      author: str(fd, "author"),
      rating,
      text: str(fd, "text"),
      location: str(fd, "location") || null,
      sortOrder: num(fd, "sortOrder"),
      active: fd.get("active") === "on",
    },
  });
  revalidatePath("/");
  revalidatePath("/admin/yorumlar");
  redirect("/admin/yorumlar");
}

export async function deleteReview(id: string) {
  await requireAdmin();
  await prisma.review.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin/yorumlar");
}

export async function toggleReview(id: string, active: boolean) {
  await requireAdmin();
  await prisma.review.update({ where: { id }, data: { active } });
  revalidatePath("/");
  revalidatePath("/admin/yorumlar");
}
