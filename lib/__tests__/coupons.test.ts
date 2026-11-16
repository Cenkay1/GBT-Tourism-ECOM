import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma, createTestBooking } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

let n = 0;
async function uye(points = 10000) {
  n++;
  return prisma.user.create({
    data: {
      email: `kupon${n}.${Date.now()}@example.com`,
      name: `Kupon Üye ${n}`,
      emailVerified: new Date(),
      points,
      lifetimePoints: points,
    },
  });
}

describe("pointsToLira / liraToPoints", () => {
  it("100 puan = 1 TL", async () => {
    const { pointsToLira, liraToPoints, POINTS_PER_LIRA } = await import("@/lib/coupons");
    expect(POINTS_PER_LIRA).toBe(100);
    expect(pointsToLira(10000)).toBe(100);
    expect(liraToPoints(100)).toBe(10000);
  });

  it("küsurat aşağı yuvarlanır (eksik puanla kupon çıkmaz)", async () => {
    const { pointsToLira } = await import("@/lib/coupons");
    expect(pointsToLira(199)).toBe(1);
    expect(pointsToLira(99)).toBe(0);
  });

  it("geçersiz girdi 0 döner", async () => {
    const { pointsToLira } = await import("@/lib/coupons");
    expect(pointsToLira(-5)).toBe(0);
    expect(pointsToLira(Number.NaN)).toBe(0);
  });
});

describe("redeemPointsForCoupon", () => {
  it("puanı düşer ve kupon üretir", async () => {
    const { redeemPointsForCoupon } = await import("@/lib/coupons");
    const user = await uye(10000);

    const res = await redeemPointsForCoupon(user.id, 5000);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const coupon = (await prisma.coupon.findUnique({ where: { id: res.couponId } }))!;
    expect(coupon.amount).toBe(50); // 5000 puan / 100 = 50 TL
    expect(coupon.pointsSpent).toBe(5000);
    expect(coupon.status).toBe("AKTIF");
    expect(coupon.userId).toBe(user.id);
    expect(coupon.code).toMatch(/^[A-Z0-9-]+$/);

    // Puan bakiyesi düştü, ömür boyu puan DOKUNULMADI (kademe korunur).
    const after = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    expect(after.points).toBe(5000);
    expect(after.lifetimePoints).toBe(10000);

    // Defter satırı yazıldı (defter toplamı = bakiye kuralı).
    const ledger = await prisma.pointsLedger.findFirst({
      where: { userId: user.id, reason: "KUPON" },
    });
    expect(ledger!.delta).toBe(-5000);
  });

  it("bakiyeden fazla puan çevrilemez", async () => {
    const { redeemPointsForCoupon } = await import("@/lib/coupons");
    const user = await uye(1000);
    const res = await redeemPointsForCoupon(user.id, 5000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("puan");

    const after = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    expect(after.points).toBe(1000); // dokunulmadı
  });

  it("1 TL'den az karşılık gelen puan çevrilemez", async () => {
    const { redeemPointsForCoupon } = await import("@/lib/coupons");
    const user = await uye(10000);
    const res = await redeemPointsForCoupon(user.id, 50);
    expect(res.ok).toBe(false);
  });

  it("her kupon kodu tekildir", async () => {
    const { redeemPointsForCoupon } = await import("@/lib/coupons");
    const user = await uye(100000);
    const kodlar = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await redeemPointsForCoupon(user.id, 1000);
      expect(res.ok).toBe(true);
      if (res.ok) {
        const c = (await prisma.coupon.findUnique({ where: { id: res.couponId } }))!;
        kodlar.add(c.code);
      }
    }
    expect(kodlar.size).toBe(5);
  });
});

describe("validateCoupon", () => {
  it("aktif kuponu bulur (kod büyük/küçük harf duyarsız)", async () => {
    const { redeemPointsForCoupon, validateCoupon } = await import("@/lib/coupons");
    const user = await uye(10000);
    const res = await redeemPointsForCoupon(user.id, 5000);
    if (!res.ok) throw new Error(res.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: res.couponId } }))!;

    const ok = await validateCoupon(coupon.code.toLowerCase(), user.id);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.amount).toBe(50);
  });

  it("olmayan kod reddedilir", async () => {
    const { validateCoupon } = await import("@/lib/coupons");
    expect((await validateCoupon("YOKBOYLEKOD", null)).ok).toBe(false);
  });

  it("BAŞKA üyenin kuponu kullanılamaz", async () => {
    const { redeemPointsForCoupon, validateCoupon } = await import("@/lib/coupons");
    const sahip = await uye(10000);
    const yabanci = await uye(0);
    const res = await redeemPointsForCoupon(sahip.id, 5000);
    if (!res.ok) throw new Error(res.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: res.couponId } }))!;

    const denied = await validateCoupon(coupon.code, yabanci.id);
    expect(denied.ok).toBe(false);
    // Misafir (userId null) de kullanamaz.
    expect((await validateCoupon(coupon.code, null)).ok).toBe(false);
  });

  it("admin kuponu (sahipsiz) herkes kullanabilir", async () => {
    const { createAdminCoupon, validateCoupon } = await import("@/lib/coupons");
    const res = await createAdminCoupon({ amount: 250, note: "Kampanya" });
    if (!res.ok) throw new Error(res.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: res.couponId } }))!;

    expect((await validateCoupon(coupon.code, null)).ok).toBe(true);
    const biri = await uye(0);
    expect((await validateCoupon(coupon.code, biri.id)).ok).toBe(true);
  });

  it("kullanılmış kupon ikinci kez geçmez", async () => {
    const { createAdminCoupon, validateCoupon, markCouponUsed } = await import(
      "@/lib/coupons"
    );
    const res = await createAdminCoupon({ amount: 100, note: "" });
    if (!res.ok) throw new Error(res.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: res.couponId } }))!;
    const { bookingId } = await createTestBooking(prisma, { status: "BEKLIYOR" });

    expect((await markCouponUsed(coupon.id, bookingId)).ok).toBe(true);
    expect((await validateCoupon(coupon.code, null)).ok).toBe(false);
  });

  it("süresi geçmiş kupon geçmez", async () => {
    const { createAdminCoupon, validateCoupon } = await import("@/lib/coupons");
    const res = await createAdminCoupon({
      amount: 100,
      note: "",
      expiresAt: new Date(Date.now() - 86400000),
    });
    if (!res.ok) throw new Error(res.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: res.couponId } }))!;
    expect((await validateCoupon(coupon.code, null)).ok).toBe(false);
  });
});

describe("markCouponUsed", () => {
  it("kuponu kullanıldı işaretler ve rezervasyona bağlar", async () => {
    const { createAdminCoupon, markCouponUsed } = await import("@/lib/coupons");
    const res = await createAdminCoupon({ amount: 100, note: "" });
    if (!res.ok) throw new Error(res.error);
    const { bookingId } = await createTestBooking(prisma, { status: "BEKLIYOR" });

    expect((await markCouponUsed(res.couponId, bookingId)).ok).toBe(true);
    const coupon = (await prisma.coupon.findUnique({ where: { id: res.couponId } }))!;
    expect(coupon.status).toBe("KULLANILDI");
    expect(coupon.usedAt).not.toBeNull();
  });

  it("aynı kupon iki rezervasyona bağlanamaz", async () => {
    const { createAdminCoupon, markCouponUsed } = await import("@/lib/coupons");
    const res = await createAdminCoupon({ amount: 100, note: "" });
    if (!res.ok) throw new Error(res.error);
    const a = await createTestBooking(prisma, { status: "BEKLIYOR" });
    const b = await createTestBooking(prisma, { status: "BEKLIYOR" });

    expect((await markCouponUsed(res.couponId, a.bookingId)).ok).toBe(true);
    expect((await markCouponUsed(res.couponId, b.bookingId)).ok).toBe(false);
  });
});

describe("releaseCoupon", () => {
  it("rezervasyon iptal olunca kupon yeniden kullanılabilir", async () => {
    const { createAdminCoupon, markCouponUsed, releaseCoupon, validateCoupon } =
      await import("@/lib/coupons");
    const res = await createAdminCoupon({ amount: 100, note: "" });
    if (!res.ok) throw new Error(res.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: res.couponId } }))!;
    const { bookingId } = await createTestBooking(prisma, { status: "BEKLIYOR" });

    await markCouponUsed(res.couponId, bookingId);
    expect((await releaseCoupon(res.couponId)).ok).toBe(true);
    expect((await validateCoupon(coupon.code, null)).ok).toBe(true);
  });
});

describe("adjustUserPoints (admin)", () => {
  it("puan ekler ve deftere yazar", async () => {
    const { adjustUserPoints } = await import("@/lib/coupons");
    const user = await uye(1000);

    const res = await adjustUserPoints(user.id, 500, "Telefon kampanyası");
    expect(res.ok).toBe(true);

    const after = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    expect(after.points).toBe(1500);
    // Eklenen puan ömür boyu puana da yazılır: kademe hak edilmiş sayılır.
    expect(after.lifetimePoints).toBe(1500);

    const ledger = await prisma.pointsLedger.findFirst({
      where: { userId: user.id, reason: "DUZELTME" },
      orderBy: { createdAt: "desc" },
    });
    expect(ledger!.delta).toBe(500);
    expect(ledger!.note).toContain("Telefon");
  });

  it("puan düşer ama bakiyeyi eksiye indirmez", async () => {
    const { adjustUserPoints } = await import("@/lib/coupons");
    const user = await uye(300);

    const res = await adjustUserPoints(user.id, -1000, "Düzeltme");
    expect(res.ok).toBe(true);
    const after = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    expect(after.points).toBe(0);

    // Deftere GERÇEKTEN uygulanan miktar yazılır (defter toplamı = bakiye).
    const ledger = await prisma.pointsLedger.findFirst({
      where: { userId: user.id, reason: "DUZELTME" },
      orderBy: { createdAt: "desc" },
    });
    expect(ledger!.delta).toBe(-300);
  });

  it("sıfır değişiklik reddedilir", async () => {
    const { adjustUserPoints } = await import("@/lib/coupons");
    const user = await uye(100);
    expect((await adjustUserPoints(user.id, 0, "")).ok).toBe(false);
  });

  it("kademe yeniden hesaplanır", async () => {
    const { adjustUserPoints } = await import("@/lib/coupons");
    const user = await uye(0);
    await adjustUserPoints(user.id, 25000, "Gümüşe çıkar");
    const after = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    expect(after.tier).toBe("SILVER");
  });
});

describe("kuponun rezervasyona uygulanması", () => {
  async function kontenjanTuru(price = 1000) {
    const departureDate = new Date(Date.now() + 30 * 86400000);
    const tour = await prisma.tour.create({
      data: {
        slug: `kupon-tur-${++n}-${Date.now()}`,
        title: "Kupon Turu",
        destination: "Test",
        category: "YURT_ICI",
        bookingType: "KONTENJAN",
        departureDate,
        departureLocation: "Test",
        price,
        coverImage: "",
        capacity: 20,
      },
    });
    const dep = await prisma.tourDeparture.create({
      data: { tourId: tour.id, departureDate, status: "AKTIF", capacity: 20 },
    });
    return { tour, dep };
  }

  const yolcular = [
    { firstName: "Bir", lastName: "A", gender: "E" as const, idNumber: "11111111110" },
    { firstName: "İki", lastName: "A", gender: "K" as const, idNumber: "12345678950" },
  ];

  it("kupon tutarı toplamdan düşer ve kupon kullanıldı olur", async () => {
    const { createPendingBooking } = await import("@/lib/booking");
    const { createAdminCoupon } = await import("@/lib/coupons");
    const { tour, dep } = await kontenjanTuru(1000);

    const c = await createAdminCoupon({ amount: 300, note: "Test" });
    if (!c.ok) throw new Error(c.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: c.couponId } }))!;

    const res = await createPendingBooking({
      tourId: tour.id,
      departureId: dep.id,
      contactName: "Kupon Müşteri",
      contactPhone: "5551112233",
      contactEmail: "kup@example.com",
      quantity: 2,
      passengers: yolcular,
      couponCode: coupon.code,
    });
    if (!res.ok) throw new Error(res.error);

    const booking = (await prisma.booking.findUnique({ where: { id: res.bookingId } }))!;
    // 2 × 1000 = 2000, kupon 300 → 1700
    expect(booking.totalAmount).toBe(1700);
    expect(booking.couponAmount).toBe(300);
    expect(booking.couponId).toBe(c.couponId);

    const after = (await prisma.coupon.findUnique({ where: { id: c.couponId } }))!;
    expect(after.status).toBe("KULLANILDI");
  });

  it("kupon toplamdan büyükse tutar 0 olur ve artan YANAR", async () => {
    const { createPendingBooking } = await import("@/lib/booking");
    const { createAdminCoupon } = await import("@/lib/coupons");
    const { tour, dep } = await kontenjanTuru(500);

    const c = await createAdminCoupon({ amount: 5000, note: "Büyük kupon" });
    if (!c.ok) throw new Error(c.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: c.couponId } }))!;

    const res = await createPendingBooking({
      tourId: tour.id,
      departureId: dep.id,
      contactName: "Kupon Müşteri",
      contactPhone: "5551112233",
      contactEmail: "kup2@example.com",
      quantity: 2,
      passengers: yolcular,
      couponCode: coupon.code,
    });
    if (!res.ok) throw new Error(res.error);

    const booking = (await prisma.booking.findUnique({ where: { id: res.bookingId } }))!;
    expect(booking.totalAmount).toBe(0);
    // Yalnız GERÇEKTEN düşen kısım kaydedilir (1000, 5000 değil).
    expect(booking.couponAmount).toBe(1000);
  });

  it("geçersiz kuponla rezervasyon AÇILMAZ", async () => {
    const { createPendingBooking } = await import("@/lib/booking");
    const { tour, dep } = await kontenjanTuru(1000);

    const res = await createPendingBooking({
      tourId: tour.id,
      departureId: dep.id,
      contactName: "Kupon Müşteri",
      contactPhone: "5551112233",
      contactEmail: "kup3@example.com",
      quantity: 2,
      passengers: yolcular,
      couponCode: "GBT-YOKK-KODU",
    });
    expect(res.ok).toBe(false);

    // Müşteri indirim bekleyip tam ücret ödememeli: kayıt hiç açılmadı.
    const count = await prisma.booking.count({ where: { departureId: dep.id } });
    expect(count).toBe(0);
  });

  it("aynı kupon ikinci rezervasyonda kullanılamaz", async () => {
    const { createPendingBooking } = await import("@/lib/booking");
    const { createAdminCoupon } = await import("@/lib/coupons");
    const { tour, dep } = await kontenjanTuru(1000);

    const c = await createAdminCoupon({ amount: 100, note: "" });
    if (!c.ok) throw new Error(c.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: c.couponId } }))!;

    const base = {
      tourId: tour.id,
      departureId: dep.id,
      contactName: "Kupon Müşteri",
      contactPhone: "5551112233",
      quantity: 2,
      passengers: yolcular,
      couponCode: coupon.code,
    };

    const first = await createPendingBooking({ ...base, contactEmail: "a@example.com" });
    expect(first.ok).toBe(true);
    const second = await createPendingBooking({ ...base, contactEmail: "b@example.com" });
    expect(second.ok).toBe(false);
  });

  it("rezervasyon iptal olunca kupon yeniden kullanılabilir", async () => {
    const { createPendingBooking, cancelBooking } = await import("@/lib/booking");
    const { createAdminCoupon, validateCoupon } = await import("@/lib/coupons");
    const { tour, dep } = await kontenjanTuru(1000);

    const c = await createAdminCoupon({ amount: 200, note: "" });
    if (!c.ok) throw new Error(c.error);
    const coupon = (await prisma.coupon.findUnique({ where: { id: c.couponId } }))!;

    const res = await createPendingBooking({
      tourId: tour.id,
      departureId: dep.id,
      contactName: "Kupon Müşteri",
      contactPhone: "5551112233",
      contactEmail: "iptal@example.com",
      quantity: 2,
      passengers: yolcular,
      couponCode: coupon.code,
    });
    if (!res.ok) throw new Error(res.error);

    await cancelBooking(res.bookingId);

    // Müşteri kuponu PUANIYLA almıştı; iptal yüzünden kaybetmemeli.
    const check = await validateCoupon(coupon.code, null);
    expect(check.ok).toBe(true);
  });
});
