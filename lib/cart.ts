// Sepet — koltuk seçiminde başlayan 15 dakikalık tutma.
//
// Önceden tutma ÖDEME adımında başlıyordu: müşteri koltuk seçip forma geçerken
// koltuk hâlâ boştu ve başkası alabiliyordu. Artık "Sepete Ekle" denince
// koltuk anında kilitlenir ve geri sayım başlar.
//
// Kilit Seat satırının üzerinde durur (holdToken + holdExpiresAt). Ayrı bir
// SeatHold tablosu kurulmadı: Seat zaten @@unique([departureId, code])
// taşıyor, yani iki kişi aynı anda aynı koltuğa bastığında yarış koşulu
// mevcut kısıtla çözülüyor ve her koltuk okuması tek sorguda kalıyor.
//
// Sepet kimliği httpOnly çerezde (lib/cart-actions.ts); bu modül yalnız
// anahtarı alır, çerezi hiç bilmez — böylece testten doğrudan çağrılabiliyor.
import { prisma } from "@/lib/db";
import {
  HOLD_MINUTES,
  allowedGendersFor,
  genderBlockMessage,
  parseSeatMap,
  type Gender,
} from "@/lib/shared";

// Bir sepette en çok kaç koltuk olabilir (SeatMap'teki MAX_SEATS ile aynı).
export const MAX_CART_SEATS = 6;

export type CartResult = { ok: true } | { ok: false; error: string };

export interface CartSeat {
  code: string;
  gender: Gender | null;
}

export interface CartView {
  tourId: string;
  tourSlug: string;
  tourTitle: string;
  currency: string;
  departureId: string;
  departureDate: string; // ISO
  seats: CartSeat[];
  unitPrice: number;
  total: number;
  expiresAt: string; // ISO — sepetteki EN ERKEN biten kilit
  expiresInSeconds: number;
}

function holdUntil(): Date {
  return new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
}

// Sepetin canlı (süresi dolmamış) koltuk satırları.
async function liveRows(cartToken: string) {
  if (!cartToken) return [];
  return prisma.seat.findMany({
    where: {
      holdToken: cartToken,
      status: "KILITLI",
      holdExpiresAt: { gt: new Date() },
    },
    orderBy: { code: "asc" },
  });
}

// Koltuğu sepete ekle (ya da süresini yenile).
//
// Atomiklik: tek updateMany, where koşulu "BOŞ ya da zaten benim" diyor.
// count === 0 ise koltuk başkasına gitmiş demektir — kontrol edip sonra
// yazmak yerine koşullu yazmak yarışı baştan engelliyor.
export async function addSeatToCart(
  cartToken: string,
  input: { tourId: string; departureId: string; code: string; gender: Gender }
): Promise<CartResult> {
  if (!cartToken) return { ok: false, error: "Sepet açılamadı. Sayfayı yenileyin." };
  if (input.gender !== "E" && input.gender !== "K")
    return { ok: false, error: "Yolcunun cinsiyetini seçin." };

  const departure = await prisma.tourDeparture.findFirst({
    where: { id: input.departureId, tourId: input.tourId },
    include: { tour: { select: { busId: true, seatLayout: true } } },
  });
  if (!departure) return { ok: false, error: "Sefer bulunamadı." };
  if (departure.status !== "AKTIF")
    return { ok: false, error: "Bu sefer satışa kapalı." };

  const mine = await liveRows(cartToken);
  const already = mine.find((s) => s.code === input.code && s.departureId === input.departureId);

  // Sepet tek seferin koltuklarını tutar: fiyat, tarih ve kontenjan sefere
  // bağlı, karışık sepet tek rezervasyona dönüşemez.
  const otherDeparture = mine.find((s) => s.departureId !== input.departureId);
  if (otherDeparture)
    return {
      ok: false,
      error:
        "Sepetinizde başka bir sefere ait koltuk var. Önce sepeti boşaltın ya da o seferle devam edin.",
    };

  if (!already && mine.length >= MAX_CART_SEATS)
    return { ok: false, error: `Sepete en fazla ${MAX_CART_SEATS} koltuk ekleyebilirsiniz.` };

  // Yan yana cinsiyet kuralı — koltuk şemasındakiyle AYNI fonksiyon, böylece
  // müşteri iki yerde birebir aynı mesajı görür. Kendi sepetimdeki koltuklar
  // kuralı bağlamaz (aynı rezervasyonda seyahat edenler serbest).
  const allSeats = await prisma.seat.findMany({
    where: { departureId: input.departureId },
    select: { code: true, gender: true, status: true, holdToken: true },
  });
  const takenGenders: Record<string, Gender> = {};
  for (const s of allSeats) {
    if ((s.status === "SATILDI" || s.status === "KILITLI") && (s.gender === "E" || s.gender === "K"))
      takenGenders[s.code] = s.gender;
  }
  const myCodes = new Set(mine.map((s) => s.code));
  const busId = departure.busId ?? departure.tour.busId;
  const bus = busId ? await prisma.bus.findUnique({ where: { id: busId } }) : null;
  const rule = allowedGendersFor(
    input.code,
    {
      seatMap: parseSeatMap(bus?.seatMap),
      layout: bus?.seatLayout ?? departure.tour.seatLayout ?? "2+2",
    },
    takenGenders,
    myCodes
  );
  const blocked = genderBlockMessage(input.code, input.gender, rule);
  if (blocked) return { ok: false, error: blocked };

  const res = await prisma.seat.updateMany({
    where: {
      departureId: input.departureId,
      code: input.code,
      // Boş koltuk ya da süresi geçmemiş BENİM kilidim. Başkasının kilidi ve
      // satılmış/bloke koltuk bu koşula girmez.
      OR: [
        { status: "BOS" },
        { status: "KILITLI", holdToken: cartToken, holdExpiresAt: { gt: new Date() } },
      ],
    },
    data: {
      status: "KILITLI",
      gender: input.gender,
      holdToken: cartToken,
      holdExpiresAt: holdUntil(),
    },
  });

  if (res.count === 0)
    return {
      ok: false,
      error: `${input.code} koltuğu az önce başka bir misafir tarafından alındı. Lütfen başka koltuk seçin.`,
    };

  return { ok: true };
}

export async function removeSeatFromCart(
  cartToken: string,
  departureId: string,
  code: string
): Promise<CartResult> {
  if (!cartToken) return { ok: false, error: "Sepet bulunamadı." };

  // Yalnız BENİM kilidim bırakılır: holdToken koşulu başka müşterinin
  // koltuğunu boşaltmayı engelliyor.
  const res = await prisma.seat.updateMany({
    where: { departureId, code, status: "KILITLI", holdToken: cartToken },
    data: { status: "BOS", gender: null, holdToken: null, holdExpiresAt: null },
  });
  if (res.count === 0)
    return { ok: false, error: "Bu koltuk sepetinizde değil." };
  return { ok: true };
}

export async function clearCart(cartToken: string): Promise<{ released: number }> {
  if (!cartToken) return { released: 0 };
  const res = await prisma.seat.updateMany({
    where: { holdToken: cartToken, status: "KILITLI" },
    data: { status: "BOS", gender: null, holdToken: null, holdExpiresAt: null },
  });
  return { released: res.count };
}

// Sepetin görünümü — başlıktaki sepet paneli ve koltuk şeması bunu okuyor.
export async function getCart(cartToken: string): Promise<CartView | null> {
  const rows = await liveRows(cartToken);
  if (rows.length === 0) return null;

  const departureId = rows[0].departureId;
  if (!departureId) return null;

  const departure = await prisma.tourDeparture.findUnique({
    where: { id: departureId },
    include: {
      tour: { select: { id: true, slug: true, title: true, price: true, currency: true } },
    },
  });
  if (!departure) return null;

  // Kalan süre: sepetteki EN ERKEN biten kilit. Müşteriye en kötü durumu
  // göstermek doğru olan — o an geldiğinde bir koltuk gerçekten gider.
  const earliest = rows.reduce<Date>(
    (min, r) => (r.holdExpiresAt && r.holdExpiresAt < min ? r.holdExpiresAt : min),
    rows[0].holdExpiresAt ?? new Date()
  );

  const unitPrice = departure.tour.price;
  return {
    tourId: departure.tour.id,
    tourSlug: departure.tour.slug,
    tourTitle: departure.tour.title,
    currency: departure.tour.currency,
    departureId,
    departureDate: departure.departureDate.toISOString(),
    seats: rows.map((r) => ({
      code: r.code,
      gender: r.gender === "E" || r.gender === "K" ? r.gender : null,
    })),
    unitPrice,
    total: rows.length * unitPrice,
    expiresAt: earliest.toISOString(),
    expiresInSeconds: Math.max(0, Math.floor((earliest.getTime() - Date.now()) / 1000)),
  };
}

// Rezervasyona dönüşte: sepet alanlarını temizle, kilidi rezervasyona devret.
// Kilit statüsü KILITLI kalır — koltuk hâlâ tutuluyor, artık süresi
// Booking.holdExpiresAt'tan okunuyor.
export async function detachCartSeats(
  cartToken: string,
  departureId: string,
  codes: string[]
): Promise<void> {
  if (!cartToken || codes.length === 0) return;
  await prisma.seat.updateMany({
    where: { holdToken: cartToken, departureId, code: { in: codes } },
    data: { holdToken: null, holdExpiresAt: null },
  });
}
