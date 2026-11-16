// İndirim kuponları ve puan harcama.
//
// Puan sistemi bugüne kadar yalnız BİRİKİYORDU: kazanım, hoşgeldin ve iptalde
// geri alma vardı ama harcama yolu yoktu. Kupon o boşluğu kapatıyor.
//
// Kur: POINTS_PER_LIRA puan = 1 ₺. Kazanım 1 ₺ = 1 puan olduğu için efektif
// iskonto %1'dir. Müşteri "20.000 puanım var" görüp 20.000 ₺ beklemesin diye
// ekranlarda puanın TL karşılığı AÇIKÇA yazılır.
import { prisma } from "@/lib/db";
import { randomInt } from "node:crypto";
import { tierForPoints } from "@/lib/loyalty";
import { POINTS_PER_LIRA, MIN_REDEEM_POINTS } from "@/lib/coupons-limits";

// Kur ve alt sınır lib/coupons-limits.ts'te (istemci de okuyor).
export { POINTS_PER_LIRA, MIN_REDEEM_POINTS };

export type CouponResult = { ok: true; couponId: string } | { ok: false; error: string };
export type ValidateResult =
  | { ok: true; couponId: string; amount: number; code: string }
  | { ok: false; error: string };

// Puanın TL karşılığı — aşağı yuvarlanır: eksik puanla kupon çıkmaz.
export function pointsToLira(points: number): number {
  if (!Number.isFinite(points) || points <= 0) return 0;
  return Math.floor(points / POINTS_PER_LIRA);
}

export function liraToPoints(lira: number): number {
  if (!Number.isFinite(lira) || lira <= 0) return 0;
  return Math.round(lira * POINTS_PER_LIRA);
}

// Okunması kolay kupon kodu: karıştırılan karakterler (0/O, 1/I/L) dışarıda.
// Telefonda okunacağı için harf grupları tireyle ayrılıyor.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCouponCode(): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `GBT-${pick(4)}-${pick(4)}`;
}

// Kodu çakışmayana kadar dener. Alfabe 31 karakter, 8 hane → çakışma pratikte
// yok; yine de UNIQUE kısıtına güvenip döngüyle garantiye alıyoruz.
async function uniqueCouponCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newCouponCode();
    const exists = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Kupon kodu üretilemedi.");
}

// Müşteri puanını kupona çevirir.
//
// Puan ANINDA düşülür (kupon elde edildiği an harcanmış sayılır) ve deftere
// "KUPON" satırı yazılır. lifetimePoints'e DOKUNULMAZ: kademe hak edilmiş bir
// geçmiştir, puanı harcamak müşteriyi kademe düşürmemeli.
export async function redeemPointsForCoupon(
  userId: string,
  points: number
): Promise<CouponResult> {
  const amount = pointsToLira(points);
  if (!Number.isInteger(points) || points < MIN_REDEEM_POINTS || amount < 1)
    return {
      ok: false,
      error: `En az ${MIN_REDEEM_POINTS} puan çevirebilirsiniz (${MIN_REDEEM_POINTS} puan = 1 ₺).`,
    };

  const code = await uniqueCouponCode();

  try {
    return await prisma.$transaction(async (tx) => {
      // Yarış durumuna karşı: puanı ancak bakiye YETİYORSA düş. Koşullu
      // updateMany, iki sekmeden aynı anda çevirip bakiyeyi eksiye
      // düşürmeyi engeller.
      const res = await tx.user.updateMany({
        where: { id: userId, points: { gte: points } },
        data: { points: { decrement: points } },
      });
      if (res.count === 0) {
        const current = await tx.user.findUnique({
          where: { id: userId },
          select: { points: true },
        });
        if (!current) return { ok: false as const, error: "Üye bulunamadı." };
        return {
          ok: false as const,
          error: `Yetersiz puan. Bakiyeniz ${current.points.toLocaleString("tr-TR")} puan.`,
        };
      }

      const coupon = await tx.coupon.create({
        data: {
          code,
          amount,
          userId,
          pointsSpent: points,
          status: "AKTIF",
          createdBy: "MUSTERI",
          note: `${points.toLocaleString("tr-TR")} puan karşılığı`,
        },
      });

      await tx.pointsLedger.create({
        data: {
          userId,
          delta: -points,
          reason: "KUPON",
          note: `${coupon.code} kuponu (${amount} ₺)`,
        },
      });

      return { ok: true as const, couponId: coupon.id };
    });
  } catch {
    return { ok: false, error: "Kupon oluşturulamadı. Lütfen tekrar deneyin." };
  }
}

// Admin kuponu — puan karşılığı DEĞİL (kampanya, özür, telefonla indirim).
// userId verilmezse kodu bilen herkes kullanabilir.
export async function createAdminCoupon(input: {
  amount: number;
  note: string;
  userId?: string | null;
  expiresAt?: Date | null;
}): Promise<CouponResult> {
  const amount = Math.floor(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 1)
    return { ok: false, error: "Kupon tutarı en az 1 ₺ olmalı." };

  if (input.userId) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!user) return { ok: false, error: "Üye bulunamadı." };
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: await uniqueCouponCode(),
      amount,
      userId: input.userId ?? null,
      pointsSpent: 0,
      status: "AKTIF",
      createdBy: "ADMIN",
      note: input.note.trim(),
      expiresAt: input.expiresAt ?? null,
    },
  });
  return { ok: true, couponId: coupon.id };
}

// Ödemede girilen kodu doğrula.
//
// userId: kuponu kullanmak isteyen kişi (misafirse null). Sahibi olan kupon
// YALNIZ sahibine açıktır — aksi halde kodu ele geçiren biri başkasının
// puanını harcardı. Sahibi olmayan (admin) kupon herkese açıktır.
export async function validateCoupon(
  code: string,
  userId: string | null
): Promise<ValidateResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, error: "Kupon kodu girin." };

  const coupon = await prisma.coupon.findUnique({ where: { code: normalized } });
  if (!coupon) return { ok: false, error: "Kupon bulunamadı. Kodu kontrol edin." };

  if (coupon.status === "KULLANILDI")
    return { ok: false, error: "Bu kupon daha önce kullanılmış." };
  if (coupon.status === "IPTAL") return { ok: false, error: "Bu kupon iptal edilmiş." };
  if (coupon.expiresAt && coupon.expiresAt < new Date())
    return { ok: false, error: "Bu kuponun süresi geçmiş." };
  if (coupon.status !== "AKTIF")
    return { ok: false, error: "Bu kupon kullanılabilir durumda değil." };

  if (coupon.userId && coupon.userId !== userId)
    return {
      ok: false,
      error: "Bu kupon başka bir hesaba ait. Kuponun sahibi hesabıyla giriş yapmalı.",
    };

  return { ok: true, couponId: coupon.id, amount: coupon.amount, code: coupon.code };
}

// Kuponu bir rezervasyona bağla ve kullanıldı işaretle.
//
// Booking.couponId UNIQUE: aynı kupon iki rezervasyona bağlanamaz. Buradaki
// koşullu updateMany ise iki eşzamanlı ödemenin aynı kuponu kullanmasını
// engeller (yalnız hâlâ AKTIF ise işaretlenir).
export async function markCouponUsed(
  couponId: string,
  bookingId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await prisma.coupon.updateMany({
    where: { id: couponId, status: "AKTIF" },
    data: { status: "KULLANILDI", usedAt: new Date() },
  });
  if (res.count === 0)
    return { ok: false, error: "Kupon az önce kullanılmış ya da geçersiz." };

  try {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { couponId },
    });
  } catch {
    // Bağlama başarısız olduysa kuponu geri aç — müşteri kuponunu
    // kaybetmesin.
    await prisma.coupon.updateMany({
      where: { id: couponId, status: "KULLANILDI" },
      data: { status: "AKTIF", usedAt: null },
    });
    return { ok: false, error: "Kupon rezervasyona bağlanamadı." };
  }
  return { ok: true };
}

// Kuponu yeniden kullanılabilir yap — rezervasyon iptal/süre dolumu olduğunda.
// Müşteri kuponunu kaybetmemeli: puanını harcayarak almıştı.
export async function releaseCoupon(
  couponId: string
): Promise<{ ok: boolean; error?: string }> {
  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!coupon) return { ok: false, error: "Kupon bulunamadı." };

  await prisma.$transaction([
    prisma.booking.updateMany({
      where: { couponId },
      data: { couponId: null, couponAmount: 0 },
    }),
    prisma.coupon.update({
      where: { id: couponId },
      data: { status: "AKTIF", usedAt: null },
    }),
  ]);
  return { ok: true };
}

// Admin üyenin puanını elle değiştirir (ekleme ya da düşme).
//
// Defter kuralı: PointsLedger.delta toplamı == User.points. Bu yüzden düşme
// bakiyeyi eksiye indirecekse deftere GERÇEKTEN uygulanan miktar yazılır.
// Eklemede lifetimePoints de artar: puan hak edilmiş sayılır ve kademe yükselir.
export async function adjustUserPoints(
  userId: string,
  delta: number,
  note: string
): Promise<{ ok: boolean; error?: string; applied?: number }> {
  const amount = Math.trunc(Number(delta));
  if (!Number.isFinite(amount) || amount === 0)
    return { ok: false, error: "Sıfırdan farklı bir puan miktarı girin." };

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) return { ok: false as const, error: "Üye bulunamadı." };

      const nextPoints = Math.max(0, user.points + amount);
      const applied = nextPoints - user.points; // düşmede bakiye kadarı
      if (applied === 0)
        return { ok: false as const, error: "Bakiye zaten sıfır, düşülecek puan yok." };

      // Ömür boyu puan yalnız EKLEMEDE artar; düşme kademeyi geri almaz
      // (kademe geçmişte hak edilmiştir).
      const nextLifetime =
        applied > 0 ? user.lifetimePoints + applied : user.lifetimePoints;

      await tx.user.update({
        where: { id: userId },
        data: {
          points: nextPoints,
          lifetimePoints: nextLifetime,
          tier: tierForPoints(nextLifetime),
        },
      });

      await tx.pointsLedger.create({
        data: {
          userId,
          delta: applied,
          reason: "DUZELTME",
          note: note.trim() || "Görevli puan düzeltmesi",
        },
      });

      return { ok: true as const, applied };
    });
  } catch {
    return { ok: false, error: "Puan güncellenemedi." };
  }
}

// Bir üyenin kuponları (en yeni önce).
export async function listUserCoupons(userId: string) {
  return prisma.coupon.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
