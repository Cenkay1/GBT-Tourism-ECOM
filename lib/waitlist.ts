// Yedek liste — otobüs/kontenjan DOLUYKEN alınan koltuksuz talep.
//
// Yedek kayıt bir rezervasyon DEĞİLDİR: koltuk ayrılmaz, para alınmaz,
// kontenjan/ciro/koltuk tahtası sayımlarına girmez (bkz. prisma/schema.prisma
// Waitlist). Yerleştirme kararı acentenindir; otomatik bildirim ya da otomatik
// yerleştirme yoktur.
//
// Yetki kontrolü ve önbellek tazeleme burada DEĞİL, sarmalayıcı server
// action'larda (lib/waitlist-actions.ts ve lib/admin-actions.ts).
import { prisma } from "@/lib/db";
import { WAITLIST_MAX_QUANTITY } from "@/lib/waitlist-limits";

export type WaitlistResult = { ok: true; id: string } | { ok: false; error: string };

export interface CreateWaitlistInput {
  tourId: string;
  departureId?: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  quantity: number;
  note: string;
  userId?: string | null;
}

export { WAITLIST_MAX_QUANTITY };

function isEmailLike(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// Sefer satışa kapalı mı (yani yedek liste anlamlı mı)?
//
// Ölçüt bilerek lib/tours.ts'teki sayımla AYNI: KONTENJAN turunda satılmış
// sayı, ODENDI + BEKLIYOR rezervasyonların quantity toplamıdır (lib/tours.ts:278).
// Farklı bir ölçüt kullanılsaydı müşteri "tükendi" görürken yedek liste "yer
// var" diyebilir ya da tersi olabilirdi.
export async function departureIsFullOnServer(
  tourId: string,
  departureId?: string | null
): Promise<boolean> {
  const tour = await prisma.tour.findUnique({
    where: { id: tourId },
    select: { bookingType: true, capacity: true },
  });
  if (!tour) return false;

  if (tour.bookingType === "KOLTUK") {
    const free = await prisma.seat.count({
      where: {
        tourId,
        ...(departureId ? { departureId } : {}),
        status: "BOS",
      },
    });
    return free === 0;
  }

  const departure = departureId
    ? await prisma.tourDeparture.findUnique({
        where: { id: departureId },
        select: { capacity: true },
      })
    : null;
  const capacity = departure?.capacity ?? tour.capacity ?? 0;
  const rows = await prisma.booking.findMany({
    where: {
      tourId,
      ...(departureId ? { departureId } : {}),
      OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }],
    },
    select: { quantity: true },
  });
  const sold = rows.reduce((t, r) => t + r.quantity, 0);
  return capacity - sold <= 0;
}

// Bir seferde yedek listede BEKLEYEN toplam kişi sayısı. Admin 2. otobüs
// kararını bu sayıya bakarak veriyor, o yüzden kayıt sayısı değil KİŞİ sayısı.
export async function waitlistCountFor(departureId: string): Promise<number> {
  const rows = await prisma.waitlist.findMany({
    where: { departureId, status: "BEKLIYOR" },
    select: { quantity: true },
  });
  return rows.reduce((t, r) => t + r.quantity, 0);
}

// Birden çok seferin bekleyen sayısı — tur sayfası tek sorguda alsın
// (sefer başına ayrı sorgu N+1 olurdu).
export async function waitlistCountsFor(
  departureIds: string[]
): Promise<Record<string, number>> {
  if (departureIds.length === 0) return {};
  const rows = await prisma.waitlist.findMany({
    where: { departureId: { in: departureIds }, status: "BEKLIYOR" },
    select: { departureId: true, quantity: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.departureId) continue;
    out[r.departureId] = (out[r.departureId] ?? 0) + r.quantity;
  }
  return out;
}

export async function createWaitlistEntry(
  input: CreateWaitlistInput
): Promise<WaitlistResult> {
  const contactName = input.contactName.trim();
  const contactPhone = input.contactPhone.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  const note = input.note.trim();
  const quantity = Number(input.quantity);

  if (!contactName) return { ok: false, error: "Adınızı yazın." };
  if (!contactPhone) return { ok: false, error: "Telefon numaranızı yazın." };
  if (!isEmailLike(contactEmail))
    return { ok: false, error: "Geçerli bir e-posta adresi yazın." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > WAITLIST_MAX_QUANTITY)
    return {
      ok: false,
      error: `Kişi sayısı 1 ile ${WAITLIST_MAX_QUANTITY} arasında olmalı.`,
    };

  const tour = await prisma.tour.findUnique({
    where: { id: input.tourId },
    select: { id: true },
  });
  if (!tour) return { ok: false, error: "Tur bulunamadı." };

  if (input.departureId) {
    const dep = await prisma.tourDeparture.findFirst({
      where: { id: input.departureId, tourId: input.tourId },
      select: { id: true },
    });
    if (!dep) return { ok: false, error: "Sefer bulunamadı." };
  }

  // Yedek liste YALNIZ dolu seferde anlamlı. Yer varsa müşteri normal
  // rezervasyon yapmalı — aksi halde koltuğu boş dururken bekleme listesinde
  // kalır ve kimse onu aramaz.
  const full = await departureIsFullOnServer(input.tourId, input.departureId);
  if (!full)
    return {
      ok: false,
      error:
        "Bu seferde hâlâ boş yer var — yedek listeye gerek yok, doğrudan rezervasyon yapabilirsiniz.",
    };

  const row = await prisma.waitlist.create({
    data: {
      tourId: input.tourId,
      departureId: input.departureId ?? null,
      contactName,
      contactPhone,
      contactEmail,
      quantity,
      note,
      userId: input.userId ?? null,
      status: "BEKLIYOR",
    },
  });
  return { ok: true, id: row.id };
}

// Yedek kayıt rezervasyona çevrildi. Dönüşümün KENDİSİ burada yapılmaz —
// rezervasyonu admin mevcut elden satış akışıyla açar, bu fonksiyon yalnız
// kaydı işaretler ve oluşan rezervasyonu bağlar.
export async function markWaitlistConverted(
  id: string,
  bookingId: string
): Promise<WaitlistResult> {
  const row = await prisma.waitlist.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!row) return { ok: false, error: "Yedek kayıt bulunamadı." };
  // İkinci kez dönüştürmek, aynı kişiye iki rezervasyon açıldığını gizler.
  if (row.status === "DONUSTURULDU")
    return { ok: false, error: "Bu kayıt zaten rezervasyona çevrilmiş." };
  if (row.status === "IPTAL")
    return { ok: false, error: "İptal edilmiş kayıt rezervasyona çevrilemez." };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true },
  });
  if (!booking) return { ok: false, error: "Rezervasyon bulunamadı." };

  await prisma.waitlist.update({
    where: { id },
    data: { status: "DONUSTURULDU", bookingId, handledAt: new Date() },
  });
  return { ok: true, id };
}

// Bekleyeni başka sefere taşı — 2. otobüs yeni bir sefer olarak açıldığında
// ya da müşteri başka tarihe razı olduğunda.
//
// Hedef sefer AYNI TURA ait olmalı: farklı turun seferine taşımak fiyatı,
// konaklamayı ve programı değiştirir, o yüzden bu bir taşıma değil yeni
// taleptir.
export async function moveWaitlistEntry(
  id: string,
  departureId: string
): Promise<WaitlistResult> {
  const row = await prisma.waitlist.findUnique({
    where: { id },
    select: { id: true, tourId: true, status: true },
  });
  if (!row) return { ok: false, error: "Yedek kayıt bulunamadı." };
  if (row.status !== "BEKLIYOR")
    return { ok: false, error: "Yalnız bekleyen kayıtlar taşınabilir." };

  const dep = await prisma.tourDeparture.findFirst({
    where: { id: departureId, tourId: row.tourId },
    select: { id: true },
  });
  if (!dep)
    return {
      ok: false,
      error: "Hedef sefer bu tura ait değil. Başka turun seferine taşınamaz.",
    };

  await prisma.waitlist.update({ where: { id }, data: { departureId } });
  return { ok: true, id };
}

export async function cancelWaitlistEntry(
  id: string,
  note: string
): Promise<WaitlistResult> {
  const row = await prisma.waitlist.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!row) return { ok: false, error: "Yedek kayıt bulunamadı." };
  if (row.status === "DONUSTURULDU")
    return { ok: false, error: "Rezervasyona çevrilmiş kayıt iptal edilemez." };

  await prisma.waitlist.update({
    where: { id },
    data: { status: "IPTAL", handledNote: note.trim(), handledAt: new Date() },
  });
  return { ok: true, id };
}

export async function updateWaitlistNote(
  id: string,
  note: string
): Promise<WaitlistResult> {
  const row = await prisma.waitlist.findUnique({ where: { id }, select: { id: true } });
  if (!row) return { ok: false, error: "Yedek kayıt bulunamadı." };
  await prisma.waitlist.update({ where: { id }, data: { handledNote: note.trim() } });
  return { ok: true, id };
}
