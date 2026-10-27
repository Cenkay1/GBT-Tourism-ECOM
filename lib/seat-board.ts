// Sefer bazlı koltuk tahtası: kim hangi koltukta oturuyor ve görevli bunu
// nasıl değiştirir.
//
// Neden ayrı dosya: lib/booking.ts satın alma akışını (fiyat, kilit, ödeme)
// taşıyor, lib/tours.ts ise turun okunuşunu. Buradaki iş "oturma düzenini
// elle düzenlemek" — kendi okuma modeli ve kendi üç işlemi olan ayrı bir
// konu. İkisine de bağımlı değil; yalnız prisma + lib/shared kullanır
// (lib/booking.ts BURAYA bağımlıdır, tersi değil — döngü olmasın).
//
// TUTARLILIK NOTU: koltuğun doluluğu İKİ yerde yazılı — Seat.status/gender ve
// Passenger.seatCode. İkisini ayrı ayrı yazan her işlem tek transaction
// içinde çalışmak zorunda; yoksa "koltuk dolu ama yolcusu yok" gibi hayalet
// kayıtlar kalır. getSeatBoard böyle bir uyuşmazlık görürse GİZLEMEZ,
// issues[] içinde raporlar.

import { prisma } from "@/lib/db";
import {
  seatNeighbors,
  parseSeatMap,
  type Gender,
  type SeatMapRows,
} from "@/lib/shared";

// Rezervasyonu "canlı" sayan durumlar: koltuğu bunlar tutar.
const LIVE_BOOKING_STATUSES = ["ODENDI", "BEKLIYOR"] as const;
// Koltuğun bir yolcu tarafından tutulduğunu gösteren durumlar.
const HELD_SEAT_STATUSES = ["SATILDI", "KILITLI"] as const;

export interface SeatOccupant {
  passengerId: string;
  fullName: string;
  gender: Gender | null;
  ageBand: string | null;
  seatCode: string | null; // koltuksuz yolcuda null
  bookingId: string;
  bookingStatus: string; // ODENDI | BEKLIYOR
  holdExpiresAt: string | null; // ISO — BEKLIYOR rezervasyonun son anı
  contactName: string;
  contactPhone: string;
  partySeats: string[]; // aynı rezervasyondaki DİĞER yolcuların koltukları
  partySize: number; // rezervasyondaki toplam yolcu sayısı
}

export type SeatIssueKind =
  // Koltuk dolu görünüyor ama onu tutan canlı bir yolcu yok.
  | "SAHIPSIZ_KOLTUK"
  // Yolcu bu koltukta yazılı ama koltuk boş/kapalı ya da hiç yok.
  | "KAYITSIZ_YOLCU"
  // Aynı koltuğa birden fazla yolcu yazılmış.
  | "CIFT_YOLCU";

export interface SeatIssue {
  seatCode: string;
  kind: SeatIssueKind;
  message: string;
}

export interface SeatBoard {
  occupants: Record<string, SeatOccupant>; // koltuk kodu → yolcu
  unseated: SeatOccupant[]; // koltuğu olmayan yolcular
  issues: SeatIssue[];
}

function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

function asGender(value: string | null): Gender | null {
  return value === "E" || value === "K" ? value : null;
}

// Bir seferin oturma düzeni: koltuk kodundan yolcuya, artı koltuksuz kalanlar
// ve veri uyuşmazlıkları.
export async function getSeatBoard(
  tourId: string,
  departureId: string
): Promise<SeatBoard> {
  const [bookings, seats] = await Promise.all([
    prisma.booking.findMany({
      where: { tourId, departureId, status: { in: [...LIVE_BOOKING_STATUSES] } },
      include: { passengers: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.seat.findMany({ where: { tourId, departureId } }),
  ]);

  const seatByCode = new Map(seats.map((s) => [s.code, s]));
  const occupants: Record<string, SeatOccupant> = {};
  const unseated: SeatOccupant[] = [];
  const issues: SeatIssue[] = [];

  for (const booking of bookings) {
    const seatsOfBooking = booking.passengers
      .map((p) => p.seatCode)
      .filter((c): c is string => Boolean(c));

    for (const p of booking.passengers) {
      const occupant: SeatOccupant = {
        passengerId: p.id,
        fullName: fullName(p),
        gender: asGender(p.gender),
        ageBand: p.ageBand,
        seatCode: p.seatCode,
        bookingId: booking.id,
        bookingStatus: booking.status,
        holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
        contactName: booking.contactName,
        contactPhone: booking.contactPhone,
        partySeats: seatsOfBooking.filter((c) => c !== p.seatCode),
        partySize: booking.passengers.length,
      };

      if (!p.seatCode) {
        unseated.push(occupant);
        continue;
      }

      // Aynı koltuğa ikinci yolcu: ilkini yerinde bırakıp uyuşmazlığı
      // raporluyoruz. İkincisini sessizce ezersek görevli sorunu hiç görmez.
      if (occupants[p.seatCode]) {
        issues.push({
          seatCode: p.seatCode,
          kind: "CIFT_YOLCU",
          message: `${p.seatCode} koltuğuna iki yolcu yazılmış: ${occupants[p.seatCode].fullName} ve ${occupant.fullName}.`,
        });
        unseated.push(occupant);
        continue;
      }

      occupants[p.seatCode] = occupant;

      const seat = seatByCode.get(p.seatCode);
      if (!seat || !HELD_SEAT_STATUSES.includes(seat.status as "SATILDI")) {
        issues.push({
          seatCode: p.seatCode,
          kind: "KAYITSIZ_YOLCU",
          message: seat
            ? `${p.seatCode} koltuğunda ${occupant.fullName} yazılı ama koltuk "${seat.status}" kayıtlı.`
            : `${p.seatCode} koltuğunda ${occupant.fullName} yazılı ama bu seferde böyle bir koltuk yok.`,
        });
      }
    }
  }

  for (const seat of seats) {
    if (!HELD_SEAT_STATUSES.includes(seat.status as "SATILDI")) continue;
    if (occupants[seat.code]) continue;
    issues.push({
      seatCode: seat.code,
      kind: "SAHIPSIZ_KOLTUK",
      message: `${seat.code} koltuğu dolu görünüyor ama onu tutan bir yolcu yok.`,
    });
  }

  return { occupants, unseated, issues };
}

// --- İŞLEMLER ---

export interface SeatOpResult {
  ok: boolean;
  error?: string;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface SeatContext {
  passenger: { id: string; seatCode: string | null; gender: Gender };
  tourId: string;
  departureId: string | null;
  expectedStatus: "SATILDI" | "KILITLI";
  seats: { id: string; code: string; status: string; gender: string | null }[];
  layout: { seatMap: SeatMapRows | null; layout: string };
}

export interface SeatOpOptions {
  // Yolcunun bu rezervasyona ait olduğunu doğrula (changeBookingSeat'in
  // imzası bookingId aldığı için gerekli — başka rezervasyonun yolcusu
  // yanlışlıkla taşınmasın).
  requireBookingId?: string;
  // Yolcunun hâlihazırda bir koltuğu olmasını şart koş (taşıma vs. oturtma).
  requireSeated?: boolean;
}

// Bir yolcunun koltuk işlemine girebilmesi için gereken her şeyi yükler ve
// ortak ön koşulları doğrular. Hata metni döner, fırlatmaz.
async function loadContext(
  tx: Tx,
  passengerId: string,
  opts?: SeatOpOptions
): Promise<{ ctx: SeatContext } | { error: string }> {
  const passenger = await tx.passenger.findUnique({
    where: { id: passengerId },
    include: { booking: { include: { tour: true, departure: true } } },
  });
  if (!passenger) return { error: "Yolcu bulunamadı." };
  if (opts?.requireBookingId && passenger.bookingId !== opts.requireBookingId)
    return { error: "Yolcu bu rezervasyona ait değil." };
  if (opts?.requireSeated && !passenger.seatCode)
    return { error: "Yolcu veya koltuk bilgisi geçersiz." };

  const booking = passenger.booking;
  if (booking.tour.bookingType !== "KOLTUK")
    return { error: "Bu tur koltuk seçimli değil." };
  if (!LIVE_BOOKING_STATUSES.includes(booking.status as "ODENDI"))
    return { error: "Bu rezervasyonun koltuğu değiştirilemez." };
  if (
    booking.status === "BEKLIYOR" &&
    booking.holdExpiresAt &&
    booking.holdExpiresAt < new Date()
  )
    return { error: "Rezervasyon süresi dolmuş." };

  const gender = asGender(passenger.gender);
  if (!gender) return { error: "Yolcunun cinsiyeti kayıtlı değil." };

  const seats = await tx.seat.findMany({
    where: { tourId: booking.tourId, departureId: booking.departureId },
    select: { id: true, code: true, status: true, gender: true },
  });

  // Düzen önceliği lib/booking.ts ile AYNI: seferin otobüsü > turun otobüsü.
  const busId = booking.departure?.busId ?? booking.tour.busId;
  const bus = busId ? await tx.bus.findUnique({ where: { id: busId } }) : null;

  return {
    ctx: {
      passenger: { id: passenger.id, seatCode: passenger.seatCode, gender },
      tourId: booking.tourId,
      departureId: booking.departureId,
      expectedStatus: booking.status === "ODENDI" ? "SATILDI" : "KILITLI",
      seats,
      layout: {
        seatMap: parseSeatMap(bus?.seatMap),
        layout: bus?.seatLayout ?? booking.tour.seatLayout ?? "2+2",
      },
    },
  };
}

// Yan yana cinsiyet kuralı, İŞLEM SONRASI duruma göre.
//
// Tek tek "şu an komşusu kim" diye bakmak takasta yanlış cevap verir: iki
// yolcu yer değiştirince komşuluklar da değişir, hatta birbirlerinin komşusu
// olabilirler. Bu yüzden önce koltuk→cinsiyet haritasının işlem sonrası hali
// kurulur, kontrol onun üstünde yapılır.
function buildGenderAfter(
  seats: SeatContext["seats"],
  moves: { code: string; gender: Gender | null }[]
): Map<string, Gender | null> {
  const after = new Map<string, Gender | null>();
  for (const seat of seats) {
    const held = HELD_SEAT_STATUSES.includes(seat.status as "SATILDI");
    after.set(seat.code, held ? asGender(seat.gender) : null);
  }
  for (const move of moves) after.set(move.code, move.gender);
  return after;
}

// Kurala takılan komşu koltuğun kodunu döndürür, sorun yoksa null.
function genderConflict(
  code: string,
  gender: Gender,
  after: Map<string, Gender | null>,
  layout: SeatContext["layout"]
): string | null {
  for (const neighbor of seatNeighbors(code, layout)) {
    const other = after.get(neighbor);
    if (other && other !== gender) return neighbor;
  }
  return null;
}

function conflictError(code: string, neighbor: string): string {
  return `${code} koltuğu yan yana cinsiyet kuralına uygun değil (${neighbor} koltuğunda farklı cinsiyette bir yolcu var).`;
}

// Yolcuyu hedef koltuğa yerleştiren çekirdek. Hem "koltuksuz yolcuyu oturt"
// hem "başka koltuğa taşı" bunu kullanır.
//
// Asimetri kasıtlı: hedefi KAPMAK koşullu ve atomik (count !== 1 ise başka
// biri önce davranmış, transaction geri alınır), kaynağı BIRAKMAK ise
// idempotent — bırakma zaten "boşalt" demek, bozuk bir kayıt yüzünden
// düzeltmenin tamamı engellenmemeli.
async function placeInto(
  tx: Tx,
  ctx: SeatContext,
  targetCode: string
): Promise<SeatOpResult> {
  if (ctx.passenger.seatCode === targetCode) return { ok: true };

  const target = ctx.seats.find((s) => s.code === targetCode);
  if (!target || target.status !== "BOS")
    return { ok: false, error: "Hedef koltuk boş değil veya bu seferde bulunmuyor." };

  const after = buildGenderAfter(ctx.seats, [
    ...(ctx.passenger.seatCode ? [{ code: ctx.passenger.seatCode, gender: null }] : []),
    { code: targetCode, gender: ctx.passenger.gender },
  ]);
  const clash = genderConflict(targetCode, ctx.passenger.gender, after, ctx.layout);
  if (clash) return { ok: false, error: conflictError(targetCode, clash) };

  const claimed = await tx.seat.updateMany({
    where: { id: target.id, status: "BOS" },
    data: { status: ctx.expectedStatus, gender: ctx.passenger.gender },
  });
  if (claimed.count !== 1) throw new Error("Koltuk az önce doldu.");

  if (ctx.passenger.seatCode) {
    const source = ctx.seats.find((s) => s.code === ctx.passenger.seatCode);
    if (source)
      await tx.seat.updateMany({
        where: { id: source.id, status: { in: [...HELD_SEAT_STATUSES] } },
        data: { status: "BOS", gender: null },
      });
  }

  await tx.passenger.update({
    where: { id: ctx.passenger.id },
    data: { seatCode: targetCode },
  });
  return { ok: true };
}

// Yerleştirmenin transaction içi hali. lib/booking.ts changeBookingSeat de
// bunu çağırır (requireBookingId + requireSeated ile) — yerleştirme mantığı
// iki yerde kopyalanmasın diye dışa açık.
export async function placePassengerInTx(
  tx: Tx,
  passengerId: string,
  targetCode: string,
  opts?: SeatOpOptions
): Promise<SeatOpResult> {
  const loaded = await loadContext(tx, passengerId, opts);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  return placeInto(tx, loaded.ctx, targetCode);
}

function wrap(label: string, fn: () => Promise<SeatOpResult>) {
  return fn().catch((error) => {
    console.error(`[${label}]`, error);
    return {
      ok: false,
      error: "İşlem tamamlanamadı — koltuk durumu değişmiş olabilir. Sayfayı yenileyip tekrar deneyin.",
    };
  });
}

// "Koltuktan çıkar": yolcu koltuksuz kalır, rezervasyon ayakta durur.
// Rezervasyonun diğer yolcularına, tutara, puana dokunmaz; müşteriye
// bildirim GİTMEZ (iptal değil, yer düzenlemesi).
export async function unseatPassenger(passengerId: string): Promise<SeatOpResult> {
  return wrap("Koltuktan çıkarma hatası", () =>
    prisma.$transaction(async (tx) => {
      const loaded = await loadContext(tx, passengerId);
      if ("error" in loaded) return { ok: false, error: loaded.error };
      const { ctx } = loaded;
      const code = ctx.passenger.seatCode;
      if (!code) return { ok: true }; // zaten koltuksuz

      // Aynı koltuğa başka bir canlı yolcu da yazılıysa (CIFT_YOLCU
      // uyuşmazlığı) koltuğu boşaltmıyoruz — orada hâlâ biri oturuyor.
      // Yalnız bu yolcunun kaydı çözülür.
      const alsoClaimed = await tx.passenger.count({
        where: {
          id: { not: passengerId },
          seatCode: code,
          booking: {
            tourId: ctx.tourId,
            departureId: ctx.departureId,
            status: { in: [...LIVE_BOOKING_STATUSES] },
          },
        },
      });

      if (alsoClaimed === 0) {
        const seat = ctx.seats.find((s) => s.code === code);
        if (seat)
          await tx.seat.updateMany({
            where: { id: seat.id, status: { in: [...HELD_SEAT_STATUSES] } },
            data: { status: "BOS", gender: null },
          });
      }

      await tx.passenger.update({ where: { id: passengerId }, data: { seatCode: null } });
      return { ok: true };
    })
  );
}

// Koltuksuz yolcuyu oturtur ya da oturan yolcuyu BOŞ bir koltuğa taşır.
export async function placePassenger(
  passengerId: string,
  targetCode: string
): Promise<SeatOpResult> {
  return wrap("Koltuk yerleştirme hatası", () =>
    prisma.$transaction((tx) => placePassengerInTx(tx, passengerId, targetCode))
  );
}

// İki oturan yolcunun koltuklarını değiştirir. Aynı ya da farklı
// rezervasyonlardan olabilirler; durumları farklıysa (ODENDI ↔ BEKLIYOR)
// koltuk statüleri de birlikte takas edilir.
export async function swapPassengers(
  passengerAId: string,
  passengerBId: string
): Promise<SeatOpResult> {
  if (passengerAId === passengerBId) return { ok: false, error: "Aynı yolcu seçildi." };

  return wrap("Koltuk takası hatası", () =>
    prisma.$transaction(async (tx) => {
      const loadedA = await loadContext(tx, passengerAId);
      if ("error" in loadedA) return { ok: false, error: loadedA.error };
      const loadedB = await loadContext(tx, passengerBId);
      if ("error" in loadedB) return { ok: false, error: loadedB.error };
      const a = loadedA.ctx;
      const b = loadedB.ctx;

      if (a.tourId !== b.tourId || a.departureId !== b.departureId)
        return { ok: false, error: "İki yolcu aynı seferde değil." };

      const codeA = a.passenger.seatCode;
      const codeB = b.passenger.seatCode;
      if (!codeA || !codeB)
        return { ok: false, error: "Takas için iki yolcunun da koltuğu olmalı." };
      // Bozuk veride iki yolcu aynı koltuğa yazılmış olabilir (CIFT_YOLCU).
      // Takas o durumda anlamsız ve aynı satırı iki kez yazardı.
      if (codeA === codeB)
        return { ok: false, error: "İki yolcu da aynı koltukta görünüyor — önce birini koltuktan çıkarın." };

      const seatA = a.seats.find((s) => s.code === codeA);
      const seatB = a.seats.find((s) => s.code === codeB);
      if (!seatA || !seatB) return { ok: false, error: "Koltuklardan biri bu seferde bulunamadı." };
      if (seatA.status !== a.expectedStatus || seatB.status !== b.expectedStatus)
        return { ok: false, error: "Koltuk durumları rezervasyonlarla uyuşmuyor." };

      // Kural kontrolü takas SONRASI düzene göre, iki yolcu için de.
      const after = buildGenderAfter(a.seats, [
        { code: codeA, gender: b.passenger.gender },
        { code: codeB, gender: a.passenger.gender },
      ]);
      const clashA = genderConflict(codeB, a.passenger.gender, after, a.layout);
      if (clashA) return { ok: false, error: conflictError(codeB, clashA) };
      const clashB = genderConflict(codeA, b.passenger.gender, after, a.layout);
      if (clashB) return { ok: false, error: conflictError(codeA, clashB) };

      // Koşullu yazım: aradaki milisaniyede koltuklardan biri değiştiyse
      // count 0 gelir ve transaction geri alınır.
      const movedA = await tx.seat.updateMany({
        where: { id: seatA.id, status: a.expectedStatus },
        data: { status: b.expectedStatus, gender: b.passenger.gender },
      });
      const movedB = await tx.seat.updateMany({
        where: { id: seatB.id, status: b.expectedStatus },
        data: { status: a.expectedStatus, gender: a.passenger.gender },
      });
      if (movedA.count !== 1 || movedB.count !== 1)
        throw new Error("Takas sırasında koltuk durumu değişti.");

      await tx.passenger.update({ where: { id: a.passenger.id }, data: { seatCode: codeB } });
      await tx.passenger.update({ where: { id: b.passenger.id }, data: { seatCode: codeA } });
      return { ok: true };
    })
  );
}
