import { describe, it, expect, beforeAll } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";
import {
  awardLoyaltyForBooking,
  revokeLoyaltyForBooking,
} from "@/lib/loyalty";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// vitest.setup.ts DATABASE_URL'i geçici kopyaya çevirdiği için lib/loyalty.ts
// içindeki global prisma singleton'ı da aynı dosyaya bağlanır.
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

async function makeUser(points = 0) {
  return prisma.user.create({
    data: {
      email: `u${Date.now()}${Math.random()}@example.com`,
      points,
      lifetimePoints: points,
      tier: "BRONZE",
    },
  });
}

describe("revokeLoyaltyForBooking", () => {
  it("yazılmış puanı bakiyeden ve ömür boyu toplamdan düşer", async () => {
    const user = await makeUser(500);
    const { bookingId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 2000,
    });
    await awardLoyaltyForBooking(bookingId);

    await revokeLoyaltyForBooking(bookingId);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.points).toBe(500);
    expect(after?.lifetimePoints).toBe(500);
  });

  it("ledger'a negatif IPTAL satırı yazar", async () => {
    const user = await makeUser();
    const { bookingId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 1500,
    });
    await awardLoyaltyForBooking(bookingId);

    await revokeLoyaltyForBooking(bookingId);

    const rows = await prisma.pointsLedger.findMany({
      where: { bookingId, reason: "IPTAL" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(-1500);
  });

  it("loyaltyAwardedAt'i temizler ki tekrar ödemede puan yeniden yazılabilsin", async () => {
    const user = await makeUser();
    const { bookingId } = await createTestBooking(prisma, { userId: user.id });
    await awardLoyaltyForBooking(bookingId);

    await revokeLoyaltyForBooking(bookingId);

    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.loyaltyAwardedAt).toBeNull();
  });

  it("kademeyi yeniden hesaplar", async () => {
    const user = await makeUser();
    const { bookingId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 25000, // SILVER eşiği 20000
    });
    await awardLoyaltyForBooking(bookingId);
    const mid = await prisma.user.findUnique({ where: { id: user.id } });
    expect(mid?.tier).toBe("SILVER");

    await revokeLoyaltyForBooking(bookingId);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.tier).toBe("BRONZE");
  });

  it("puanı yazılmamış rezervasyonda hiçbir şey yapmaz", async () => {
    const user = await makeUser(300);
    const { bookingId } = await createTestBooking(prisma, { userId: user.id });

    await revokeLoyaltyForBooking(bookingId);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.points).toBe(300);
  });

  it("idempotenttir — ikinci çağrı bakiyeyi bir daha düşürmez", async () => {
    const user = await makeUser();
    const { bookingId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 1000,
    });
    await awardLoyaltyForBooking(bookingId);
    await revokeLoyaltyForBooking(bookingId);

    await revokeLoyaltyForBooking(bookingId);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.points).toBe(0);
  });

  it("misafir rezervasyonunda (userId yok) sessizce çıkar", async () => {
    const { bookingId } = await createTestBooking(prisma, { userId: null });

    await expect(revokeLoyaltyForBooking(bookingId)).resolves.toBeUndefined();
  });

  it("kısmi geri alımda deftere TAM kazanım değil, bakiyeden GERÇEKTEN düşülen miktar yazılır", async () => {
    // Bugün puan harcama özelliği yok; bu senaryo bakiyenin başka bir yoldan
    // (örn. elle düzeltme) kazanılandan daha aza düşmüş olmasını simüle eder.
    const user = await makeUser();
    const { bookingId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 2000,
    });
    await awardLoyaltyForBooking(bookingId); // points: 0 -> 2000, lifetimePoints: 0 -> 2000

    // Bakiyeyi elle düşür (harcanmış gibi) — lifetimePoints'e dokunma.
    await prisma.user.update({
      where: { id: user.id },
      data: { points: 500 }, // kazanılan 2000'den az
    });

    await revokeLoyaltyForBooking(bookingId);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    // Bakiye eksiye düşmedi (clamp hâlâ çalışıyor).
    expect(after?.points).toBeGreaterThanOrEqual(0);
    expect(after?.points).toBe(0); // max(0, 500 - 2000)

    const rows = await prisma.pointsLedger.findMany({
      where: { bookingId },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2); // KAZANIM + IPTAL

    const iptalRow = rows.find((r) => r.reason === "IPTAL");
    expect(iptalRow).toBeDefined();

    // Deftere yazılan değer TAM kazanım tutarı (-2000) DEĞİL, bakiyeden
    // GERÇEKTEN düşülen miktar (500 - 0 = 500) olmalı.
    expect(iptalRow?.delta).toBe(-500);
    expect(iptalRow?.delta).not.toBe(-2000);

    // Defter bütünlüğü: KAZANIM (+2000) ile IPTAL (-500) toplamı, bu
    // rezervasyonun bakiyede yarattığı gerçek net etkiyle (+1500) eşleşmeli —
    // tam kazanım tutarının geri alındığı (yanlış) senaryodaki 0 ile DEĞİL.
    const ledgerSum = rows.reduce((sum, r) => sum + r.delta, 0);
    expect(ledgerSum).toBe(1500);
  });
});
