// Sadakat puan sistemi — kazanım, kademe hesabı ve rezervasyon puanı yazımı.
// İş kuralı: kazanım = ödenen tutar (1 ₺ = 1 puan), kayıtta +WELCOME_POINTS hoşgeldin.
// Kademeler ömür boyu (lifetime) puana göre. Eşikler, ortalama tur fiyatı (~20.000 ₺)
// baz alınarak belirlenmiştir: Gümüş ≈ 1 tur, Altın ≈ 3 tur, Platin ≈ 7-8 tur.
import { prisma } from "@/lib/db";

export const EARN_RATE = 1; // 1 ₺ harcama = 1 puan
export const WELCOME_POINTS = 500; // kayıt (hoşgeldin) puanı

export type Tier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

interface TierDef {
  key: Tier;
  label: string;
  min: number; // bu kademe için gereken ömür boyu puan
  perk: string; // kademe avantajı (gösterim amaçlı)
  color: string; // rozet rengi (tailwind sınıf grubu)
}

// Artan eşiklere göre sıralı — tierForPoints yüksekten aşağı tarar.
// Eşikler ~20.000 ₺ ortalama tur fiyatına göre (1 ₺ = 1 puan).
export const TIERS: TierDef[] = [
  { key: "BRONZE", label: "Bronz", min: 0, perk: "Üyelere özel kampanya bildirimleri", color: "amber" },
  { key: "SILVER", label: "Gümüş", min: 20000, perk: "Erken rezervasyon önceliği", color: "slate" },
  { key: "GOLD", label: "Altın", min: 60000, perk: "Seçili turlarda öncelikli koltuk", color: "yellow" },
  { key: "PLATINUM", label: "Platin", min: 150000, perk: "Kişiye özel seyahat danışmanı", color: "indigo" },
];

// Bir ödeme tutarı için kazanılacak puan.
export function earnedFor(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * EARN_RATE);
}

// Ömür boyu puana göre kademe.
export function tierForPoints(lifetimePoints: number): Tier {
  let result: Tier = "BRONZE";
  for (const t of TIERS) {
    if (lifetimePoints >= t.min) result = t.key;
  }
  return result;
}

export function tierDef(tier: string): TierDef {
  return TIERS.find((t) => t.key === tier) ?? TIERS[0];
}

// Kademe + sonraki kademeye ilerleme bilgisi (UI için).
export function tierInfo(lifetimePoints: number) {
  const current = tierDef(tierForPoints(lifetimePoints));
  const currentIndex = TIERS.findIndex((t) => t.key === current.key);
  const next = TIERS[currentIndex + 1] ?? null;
  const toNext = next ? Math.max(0, next.min - lifetimePoints) : 0;
  // Mevcut kademe tabanı ile sonraki kademe eşiği arasındaki ilerleme yüzdesi.
  const progress = next
    ? Math.min(100, Math.round(((lifetimePoints - current.min) / (next.min - current.min)) * 100))
    : 100;
  return { current, next, toNext, progress };
}

// Rezervasyona sadakat puanı yaz — idempotent (loyaltyAwardedAt ile korunur).
// Online ve nakit/elden satış dahil, ödeme işaretlendiğinde çağrılır.
export async function awardLoyaltyForBooking(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;
  if (!booking.userId) return; // misafir rezervasyon → puan yok
  if (booking.loyaltyAwardedAt) return; // zaten yazılmış
  if (booking.status !== "ODENDI") return; // yalnızca ödenmiş

  const points = earnedFor(booking.totalAmount);
  if (points <= 0) {
    // Puan yok ama tekrar denememek için işaretle.
    await prisma.booking.update({
      where: { id: bookingId },
      data: { loyaltyAwardedAt: new Date() },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Yarış durumuna karşı: yalnızca henüz işaretlenmemişse işaretle.
    const res = await tx.booking.updateMany({
      where: { id: bookingId, loyaltyAwardedAt: null },
      data: { loyaltyAwardedAt: new Date() },
    });
    if (res.count === 0) return; // başka bir işlem yazmış

    const user = await tx.user.update({
      where: { id: booking.userId! },
      data: {
        points: { increment: points },
        lifetimePoints: { increment: points },
      },
    });
    const newTier = tierForPoints(user.lifetimePoints);
    if (newTier !== user.tier) {
      await tx.user.update({ where: { id: user.id }, data: { tier: newTier } });
    }
    await tx.pointsLedger.create({
      data: {
        userId: booking.userId!,
        bookingId,
        delta: points,
        reason: "KAZANIM",
        note: `Rezervasyon ${bookingId.slice(-8).toUpperCase()}`,
      },
    });
  });
}

// Kayıt (hoşgeldin) puanı — Auth.js createUser event'inde bir kez çağrılır.
export async function grantWelcome(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        points: { increment: WELCOME_POINTS },
        lifetimePoints: { increment: WELCOME_POINTS },
      },
    });
    const newTier = tierForPoints(user.lifetimePoints);
    if (newTier !== user.tier) {
      await tx.user.update({ where: { id: user.id }, data: { tier: newTier } });
    }
    await tx.pointsLedger.create({
      data: { userId, delta: WELCOME_POINTS, reason: "HOSGELDIN", note: "Üyelik hoşgeldin puanı" },
    });
  });
}

// E-posta doğrulanınca (veya Google ile giriş): aynı e-postalı geçmiş MİSAFİR
// rezervasyonları bu kullanıcıya bağla; ödenmiş olanların puanını idempotent yaz.
export async function linkGuestBookings(userId: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  // SQLite'ta string eşitliği büyük/küçük harf duyarsız değildir; contactEmail
  // girildiği gibi saklanır. Bu yüzden misafir (userId=null) rezervasyonları çekip
  // e-postayı normalize ederek JS'te eşleştiriyoruz (veri hacmi küçük).
  const orphans = await prisma.booking.findMany({
    where: { userId: null },
    select: { id: true, status: true, contactEmail: true },
  });
  const candidates = orphans.filter(
    (b) => b.contactEmail.trim().toLowerCase() === normalized
  );
  if (candidates.length === 0) return;

  await prisma.booking.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { userId },
  });

  // Ödenmiş rezervasyonların puanını yaz (idempotent).
  for (const c of candidates) {
    if (c.status === "ODENDI") await awardLoyaltyForBooking(c.id);
  }
}

// Rezervasyon iptal/iade edildiğinde yazılmış sadakat puanını geri alır.
// İdempotent: loyaltyAwardedAt null ise hiçbir şey yapmaz.
//
// Geri alınacak miktar Booking.totalAmount'tan DEĞİL, ledger'daki o
// rezervasyona ait KAZANIM satırlarının toplamından okunur — tutar sonradan
// elle değiştirilmiş olabilir ve o zaman bakiye bozulurdu.
//
// Defter kuralı: PointsLedger.delta toplamı == User.points. Bakiye eksiye
// düşmesin diye sıfırda kesiliyor (clamp); bu durumda deftere YAZILAN satır
// da tam kazanım tutarı değil, bakiyeye GERÇEKTEN uygulanan fark
// (current.points - nextPoints) olmalı — aksi halde defter toplamı bakiyeyi
// yansıtmaz hâle gelir.
export async function revokeLoyaltyForBooking(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;
  if (!booking.userId) return; // misafir rezervasyon → puan yazılmamıştı
  if (!booking.loyaltyAwardedAt) return; // zaten geri alınmış ya da hiç yazılmamış

  const userId = booking.userId;

  await prisma.$transaction(async (tx) => {
    // Yarış durumuna karşı: yalnızca hâlâ işaretliyse geri al.
    const res = await tx.booking.updateMany({
      where: { id: bookingId, loyaltyAwardedAt: { not: null } },
      data: { loyaltyAwardedAt: null },
    });
    if (res.count === 0) return; // başka bir işlem geri almış

    const earned = await tx.pointsLedger.aggregate({
      where: { bookingId, reason: "KAZANIM" },
      _sum: { delta: true },
    });
    const points = earned._sum.delta ?? 0;
    if (points <= 0) return; // yazılmış kazanım yok

    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current) return;

    // Bakiye eksiye düşmesin: puan arada harcanmış olabilir.
    const nextPoints = Math.max(0, current.points - points);
    const nextLifetime = Math.max(0, current.lifetimePoints - points);

    await tx.user.update({
      where: { id: userId },
      data: {
        points: nextPoints,
        lifetimePoints: nextLifetime,
        tier: tierForPoints(nextLifetime),
      },
    });

    // Deftere, bakiyeden GERÇEKTEN düşülen miktar yazılır — tam kazanım
    // tutarı değil. Normalde (bakiye >= points) ikisi eşittir; bakiye arada
    // azalmışsa (örn. ileride eklenecek puan harcama özelliği) uygulanan
    // miktar daha az olur ve defter toplamı == bakiye kuralı bu şekilde korunur.
    const applied = current.points - nextPoints;
    const isPartial = applied < points;

    await tx.pointsLedger.create({
      data: {
        userId,
        bookingId,
        delta: -applied,
        reason: "IPTAL",
        note: isPartial
          ? `Rezervasyon ${bookingId.slice(-8).toUpperCase()} iptal edildi (kısmi geri alım: bakiye kazanımdan az)`
          : `Rezervasyon ${bookingId.slice(-8).toUpperCase()} iptal edildi`,
      },
    });
  });
}
