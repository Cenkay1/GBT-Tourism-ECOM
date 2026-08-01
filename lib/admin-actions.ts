"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSessionEmail } from "@/lib/auth";
import { VEHICLES, VehicleType } from "@/lib/shared";
import { createManualPaidBooking } from "@/lib/booking";

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

async function tourDataFromForm(fd: FormData) {
  const bookingType = str(fd, "bookingType");
  const images = str(fd, "images")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const highlights = str(fd, "highlights")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const returnDateRaw = str(fd, "returnDate");
  const coverImage = str(fd, "coverImage") || images[0] || "";
  const vehicleType =
    bookingType === "KOLTUK" ? (str(fd, "vehicleType") || "OTOBUS") : null;
  const seatLayout =
    vehicleType && VEHICLES[vehicleType as VehicleType]
      ? VEHICLES[vehicleType as VehicleType].layout
      : null;

  return {
    title: str(fd, "title"),
    destination: str(fd, "destination"),
    category: str(fd, "category"),
    bookingType,
    departureDate: new Date(str(fd, "departureDate")),
    returnDate: returnDateRaw ? new Date(returnDateRaw) : null,
    departureLocation: str(fd, "departureLocation"),
    durationDays: num(fd, "durationDays") || 1,
    price: num(fd, "price"),
    currency: str(fd, "currency") || "TRY",
    coverImage,
    images: JSON.stringify(images.length ? images : coverImage ? [coverImage] : []),
    description: str(fd, "description"),
    highlights: JSON.stringify(highlights),
    capacity: bookingType === "KONTENJAN" ? optNum(fd, "capacity") : null,
    vehicleType,
    seatLayout,
    seatRows: bookingType === "KOLTUK" ? optNum(fd, "seatRows") : null,
    status: str(fd, "status") || "YAYINDA",
  };
}

interface PlaceInput {
  type: string;
  name: string;
  address?: string;
  mapQuery?: string;
  nights?: number;
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
    data: valid.map((p, i) => ({
      tourId,
      type: p.type === "OTEL" ? "OTEL" : "DURAK",
      name: p.name.trim(),
      address: p.address?.trim() || null,
      mapQuery: (p.mapQuery?.trim() || p.address?.trim() || p.name.trim()) || null,
      nights: p.type === "OTEL" && p.nights ? Number(p.nights) : null,
      sortOrder: i,
    })),
  });
}

async function generateSeats(tourId: string, vehicleType: string, rows: number) {
  const v = VEHICLES[vehicleType as VehicleType] ?? VEHICLES.OTOBUS;
  const cols = [...v.left, ...v.right];
  const data = [];
  for (let r = 1; r <= rows; r++) {
    for (const c of cols) {
      data.push({ tourId, code: `${r}${c}`, status: "BOS" });
    }
  }
  if (data.length) await prisma.seat.createMany({ data });
}

export async function createTour(fd: FormData) {
  await requireAdmin();
  const data = await tourDataFromForm(fd);
  const slug = await uniqueSlug(data.title);
  const tour = await prisma.tour.create({ data: { ...data, slug } });

  if (data.bookingType === "KOLTUK" && data.seatRows) {
    await generateSeats(tour.id, data.vehicleType ?? "OTOBUS", data.seatRows);
  }
  await savePlaces(tour.id, str(fd, "places"));
  revalidatePath("/");
  revalidatePath("/admin/turlar");
  redirect("/admin/turlar");
}

export async function updateTour(id: string, fd: FormData) {
  await requireAdmin();
  const data = await tourDataFromForm(fd);
  const slug = await uniqueSlug(data.title, id);

  const existing = await prisma.tour.findUnique({
    where: { id },
    include: { seats: true },
  });

  await prisma.tour.update({ where: { id }, data: { ...data, slug } });

  // Araç tipi/sıra değiştiyse ve satılmış-kilitli koltuk yoksa yeniden üret
  if (data.bookingType === "KOLTUK" && data.seatRows) {
    const hasActive = existing?.seats.some((s) => s.status !== "BOS");
    const layoutChanged =
      existing?.vehicleType !== data.vehicleType ||
      existing?.seatRows !== data.seatRows;
    if (!hasActive && layoutChanged) {
      await prisma.seat.deleteMany({ where: { tourId: id } });
      await generateSeats(id, data.vehicleType ?? "OTOBUS", data.seatRows);
    }
  }
  await savePlaces(id, str(fd, "places"));
  revalidatePath("/");
  revalidatePath("/admin/turlar");
  redirect("/admin/turlar");
}

export async function deleteTour(id: string) {
  await requireAdmin();
  await prisma.tour.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin/turlar");
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

  const result = await createManualPaidBooking({
    tourId,
    contactName: str(fd, "contactName"),
    contactPhone: str(fd, "contactPhone"),
    contactEmail: str(fd, "contactEmail"),
    passengers,
    seatCodes: tour!.bookingType === "KOLTUK" ? seatCodes : undefined,
    quantity: tour!.bookingType === "KONTENJAN" ? num(fd, "quantity") : undefined,
    totalOverride,
  });

  if (!result.ok) {
    redirect(
      `/admin/rezervasyonlar/yeni?tur=${tourId}&hata=${encodeURIComponent(result.error)}`
    );
  }

  revalidatePath("/admin/rezervasyonlar");
  revalidatePath("/");
  redirect("/admin/rezervasyonlar");
}

export async function setBookingStatus(id: string, status: string) {
  await requireAdmin();
  await prisma.booking.update({ where: { id }, data: { status } });
  revalidatePath("/admin/rezervasyonlar");
  revalidatePath(`/admin/rezervasyonlar/${id}`);
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
