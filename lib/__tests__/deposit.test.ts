// Ön satış (kapora) ve tahsilat defteri testleri.
//
// Kritik davranışlar:
//   • Kapora yukarı yuvarlanır, toplamı aşmaz.
//   • Ön ödemede rezervasyon ODENDI olur (koltuk ayrılır) ama bakiye açık kalır.
//   • paidAmount defterden TÜRETİLİR: satır silinince bakiye geri açılır.
//   • Aynı iyzico ödemesi iki kez işlenmez (callback tekrarı).
//   • Puan yalnız bakiye kapanınca yazılır.
//   • Son ödeme tarihi geçen eksik ödemeli rezervasyon iptal edilir ve koltuk açılır.
import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  depositFor,
  balanceOf,
  paymentStateOf,
  balanceDueDateFor,
  whatsappNumber,
} from "@/lib/shared";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma, createTestBooking } from "./helpers/db";

// E-posta/SMS gönderimi testlerde ağa çıkmasın.
vi.mock("@/lib/notify", () => ({
  sendSms: vi.fn(async () => true),
  sendEmail: vi.fn(async () => true),
  smsConfigured: () => false,
  emailConfigured: () => false,
}));

let prisma: PrismaClient;
beforeAll(async () => {
  prisma = await getTestPrisma();
});

describe("depositFor", () => {
  it("yüzdeyi yukarı yuvarlar (küsurat acentenin lehine)", () => {
    expect(depositFor(1000, 25)).toBe(250);
    expect(depositFor(999, 25)).toBe(250); // 249.75 → 250
    expect(depositFor(101, 25)).toBe(26); // 25.25 → 26
  });

  it("oran 0 veya geçersizse kapora yoktur", () => {
    expect(depositFor(1000, 0)).toBe(0);
    expect(depositFor(1000, -5)).toBe(0);
    expect(depositFor(1000, Number.NaN)).toBe(0);
  });

  it("hiçbir koşulda toplamı aşmaz", () => {
    expect(depositFor(1000, 100)).toBe(1000);
    expect(depositFor(1000, 150)).toBe(1000);
  });

  it("tutar sıfır ya da negatifse 0 döner", () => {
    expect(depositFor(0, 25)).toBe(0);
    expect(depositFor(-500, 25)).toBe(0);
  });
});

describe("balanceOf / paymentStateOf", () => {
  it("kalan bakiye negatife düşmez", () => {
    expect(balanceOf(1000, 1200)).toBe(0);
    expect(balanceOf(1000, 250)).toBe(750);
  });

  it("ödeme durumunu doğru sınıflar", () => {
    expect(paymentStateOf(1000, 0)).toBe("ODENMEDI");
    expect(paymentStateOf(1000, 250)).toBe("ON_ODEME");
    expect(paymentStateOf(1000, 1000)).toBe("TAMAM");
    // Fazla tahsilat da "tamam" sayılır (eksik gösterip görevliyi yanıltmasın).
    expect(paymentStateOf(1000, 1500)).toBe("TAMAM");
  });
});

describe("balanceDueDateFor", () => {
  it("kalkıştan verilen gün kadar önceyi döndürür", () => {
    const dep = new Date("2026-12-20T08:00:00.000Z");
    const due = balanceDueDateFor(dep, 5);
    expect(due.toISOString()).toBe("2026-12-15T08:00:00.000Z");
  });

  it("gün sayısı geçersizse varsayılan 5 güne düşer", () => {
    const dep = new Date("2026-12-20T08:00:00.000Z");
    expect(balanceDueDateFor(dep, 0).toISOString()).toBe("2026-12-15T08:00:00.000Z");
    expect(balanceDueDateFor(dep, Number.NaN).toISOString()).toBe(
      "2026-12-15T08:00:00.000Z"
    );
  });
});

describe("whatsappNumber", () => {
  it("10 ve 11 haneli numaraları aynı uluslararası biçime çevirir", () => {
    expect(whatsappNumber("05321234567")).toBe("905321234567");
    expect(whatsappNumber("5321234567")).toBe("905321234567");
    expect(whatsappNumber("0(532) 123 45 67")).toBe("905321234567");
    expect(whatsappNumber("905321234567")).toBe("905321234567");
  });
});

describe("tahsilat defteri", () => {
  it("ön ödeme alınan rezervasyon ODENDI olur ama bakiyesi açık kalır", async () => {
    const { bookingId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      totalAmount: 4000,
    });
    const { markBookingPaid } = await import("@/lib/booking");

    const res = await markBookingPaid(bookingId, "TEST-KAPORA", {
      notify: false,
      collected: 1000,
      collectionMethod: "ONLINE",
      collectionPaymentId: "iyz-1",
    });
    expect(res.ok).toBe(true);

    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.status).toBe("ODENDI");
    expect(b.paidAmount).toBe(1000);
    expect(balanceOf(b.totalAmount, b.paidAmount)).toBe(3000);
    // Koltuklar ayrılmış olmalı: ön ödeme koltuğu rezerve eder.
    const soldSeats = await prisma.seat.count({
      where: { tourId: b.tourId, status: "SATILDI" },
    });
    expect(soldSeats).toBe(2);
    // Son ödeme tarihi ve kalan ödeme bağlantısı tanımlanmış olmalı.
    expect(b.balanceDueAt).not.toBeNull();
    expect(b.balanceToken).toBeTruthy();
  });

  it("aynı iyzico ödemesi iki kez tahsilat yazmaz", async () => {
    const { bookingId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      totalAmount: 4000,
    });
    const { markBookingPaid } = await import("@/lib/booking");

    await markBookingPaid(bookingId, "TEST", {
      notify: false,
      collected: 1000,
      collectionPaymentId: "iyz-tekrar",
    });
    // Callback ikinci kez geldi.
    await markBookingPaid(bookingId, "TEST", {
      notify: false,
      collected: 1000,
      collectionPaymentId: "iyz-tekrar",
    });

    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.paidAmount).toBe(1000);
    expect(await prisma.collection.count({ where: { bookingId } })).toBe(1);
  });

  it("kalan ödeme deftere eklenir ve bakiyeyi kapatır", async () => {
    const { bookingId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      totalAmount: 4000,
    });
    const { markBookingPaid } = await import("@/lib/booking");

    await markBookingPaid(bookingId, "KAPORA", {
      notify: false,
      collected: 1000,
      collectionPaymentId: "iyz-a",
    });
    // Müşteri kalanı sonradan ödedi (rezervasyon zaten ODENDI).
    await markBookingPaid(bookingId, "KALAN", {
      notify: false,
      collected: 3000,
      collectionPaymentId: "iyz-b",
    });

    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.paidAmount).toBe(4000);
    expect(balanceOf(b.totalAmount, b.paidAmount)).toBe(0);
    expect(await prisma.collection.count({ where: { bookingId } })).toBe(2);
  });

  it("paidAmount defterden türetilir: satır silinince bakiye geri açılır", async () => {
    const { bookingId } = await createTestBooking(prisma, { totalAmount: 3000 });
    const { recordCollection, deleteCollection } = await import("@/lib/collections");

    await recordCollection({
      bookingId,
      amount: 1200,
      method: "NAKIT",
      notify: false,
    });
    const row = await prisma.collection.findFirstOrThrow({ where: { bookingId } });
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).paidAmount
    ).toBe(1200);

    const del = await deleteCollection(row.id);
    expect(del.ok).toBe(true);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).paidAmount
    ).toBe(0);
  });

  it("iyzico ile eşlenmiş tahsilat defterden silinemez", async () => {
    const { bookingId } = await createTestBooking(prisma, { totalAmount: 3000 });
    const { recordCollection, deleteCollection } = await import("@/lib/collections");

    await recordCollection({
      bookingId,
      amount: 3000,
      method: "ONLINE",
      paymentId: "iyz-kilitli",
      notify: false,
    });
    const row = await prisma.collection.findFirstOrThrow({ where: { bookingId } });

    const del = await deleteCollection(row.id);
    expect(del.ok).toBe(false);
    expect(del.error).toMatch(/iade/i);
  });

  it("negatif düzeltme tahsil edileni aşamaz", async () => {
    const { bookingId } = await createTestBooking(prisma, { totalAmount: 3000 });
    const { recordCollection } = await import("@/lib/collections");

    await recordCollection({ bookingId, amount: 500, method: "NAKIT", notify: false });
    const res = await recordCollection({
      bookingId,
      amount: -900,
      method: "NAKIT",
      notify: false,
    });
    expect(res.ok).toBe(false);
  });
});

describe("sadakat puanı", () => {
  it("açık bakiye varken puan yazılmaz, bakiye kapanınca yazılır", async () => {
    const user = await prisma.user.create({
      data: { email: `puan-${Date.now()}@example.com`, name: "Puan Test" },
    });
    const { bookingId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      totalAmount: 2000,
      userId: user.id,
    });
    const { markBookingPaid } = await import("@/lib/booking");

    await markBookingPaid(bookingId, "KAPORA", {
      notify: false,
      collected: 500,
      collectionPaymentId: `iyz-puan-a-${bookingId}`,
    });
    let fresh = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(fresh.loyaltyAwardedAt).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).points).toBe(0);

    await markBookingPaid(bookingId, "KALAN", {
      notify: false,
      collected: 1500,
      collectionPaymentId: `iyz-puan-b-${bookingId}`,
    });
    fresh = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(fresh.loyaltyAwardedAt).not.toBeNull();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).points
    ).toBeGreaterThan(0);
  });
});

describe("releaseUnpaidBalances", () => {
  it("son ödeme tarihi geçmiş eksik ödemeyi iptal eder ve koltukları açar", async () => {
    const { bookingId, tourId, departureId } = await createTestBooking(prisma, {
      status: "ODENDI",
      totalAmount: 4000,
      departureDate: new Date(Date.now() + 3 * 86400000), // kalkış ileride
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paidAmount: 1000,
        balanceDueAt: new Date(Date.now() - 86400000), // son ödeme dün
      },
    });

    const { releaseUnpaidBalances } = await import("@/lib/booking");
    const res = await releaseUnpaidBalances();
    expect(res.ids).toContain(bookingId);

    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.status).toBe("IPTAL");
    const busy = await prisma.seat.count({
      where: { tourId, departureId, status: { not: "BOS" } },
    });
    expect(busy).toBe(0);
  });

  it("bakiyesi kapalı rezervasyona dokunmaz", async () => {
    const { bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      totalAmount: 2000,
      departureDate: new Date(Date.now() + 3 * 86400000),
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { paidAmount: 2000, balanceDueAt: new Date(Date.now() - 86400000) },
    });

    const { releaseUnpaidBalances } = await import("@/lib/booking");
    const res = await releaseUnpaidBalances();
    expect(res.ids).not.toContain(bookingId);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status
    ).toBe("ODENDI");
  });

  it("kalkışı geçmiş sefere dokunmaz (tur yapıldıktan sonra iptal edilmez)", async () => {
    const { bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      totalAmount: 4000,
      departureDate: new Date(Date.now() - 2 * 86400000), // kalkış geçmişte
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { paidAmount: 1000, balanceDueAt: new Date(Date.now() - 10 * 86400000) },
    });

    const { releaseUnpaidBalances } = await import("@/lib/booking");
    const res = await releaseUnpaidBalances();
    expect(res.ids).not.toContain(bookingId);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status
    ).toBe("ODENDI");
  });
});

describe("koltuk kilidi", () => {
  it("ödeme tamamlanmayan rezervasyonun koltuğu kilit süresi dolunca serbest kalır", async () => {
    const { bookingId, tourId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["2A"],
    });
    // Kilit süresi geçmiş gibi davran.
    await prisma.booking.update({
      where: { id: bookingId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    const { releaseExpiredHolds } = await import("@/lib/booking");
    await releaseExpiredHolds();

    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status
    ).toBe("SURE_DOLDU");
    expect(
      await prisma.seat.count({ where: { tourId, status: { not: "BOS" } } })
    ).toBe(0);
  });

  it("vazgeçilen ödemede koltuk süre beklemeden bırakılır, ödenmiş koltuğa dokunulmaz", async () => {
    const { cancelBooking } = await import("@/lib/booking");

    // Henüz ödenmemiş: koltuk hemen boşa çıkmalı.
    const bekleyen = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["3A"],
    });
    await cancelBooking(bekleyen.bookingId);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: bekleyen.bookingId } })).status
    ).toBe("IPTAL");
    expect(
      await prisma.seat.count({ where: { tourId: bekleyen.tourId, status: { not: "BOS" } } })
    ).toBe(0);

    // Ödenmiş rezervasyon: aynı çağrı koltuğu ASLA boşaltmamalı — aksi halde
    // iyzico'nun tekrar gönderdiği bir callback satılmış koltuğu açardı.
    const odenmis = await createTestBooking(prisma, {
      status: "ODENDI",
      seatCodes: ["3A"],
    });
    await cancelBooking(odenmis.bookingId);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: odenmis.bookingId } })).status
    ).toBe("ODENDI");
    expect(
      await prisma.seat.count({ where: { tourId: odenmis.tourId, status: "SATILDI" } })
    ).toBe(1);
  });
});

describe("bakiye bildirimi", () => {
  it("elden satışta eksik tahsilat girilince müşteriye bakiye bildirimi gider", async () => {
    const { sendBalanceStatement } = await import("@/lib/notifications");
    const notify = await import("@/lib/notify");

    const { bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      totalAmount: 4000,
      paidAmount: 1000,
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { balanceDueAt: new Date(Date.now() + 5 * 86400000), balanceToken: "tok-test" },
    });

    vi.mocked(notify.sendEmail).mockClear();
    await sendBalanceStatement(bookingId);

    expect(notify.sendEmail).toHaveBeenCalledTimes(1);
    const [, subject, html] = vi.mocked(notify.sendEmail).mock.calls[0];
    // Konu satırı kalan tutarı taşımalı — müşteri açmadan görsün.
    expect(subject).toMatch(/Kalan/i);
    // Gövdede kalan tutar, son ödeme tarihi ve ödeme bağlantısı bulunmalı.
    expect(html).toMatch(/Kalan ödemeniz/);
    expect(html).toMatch(/Son ödeme tarihi/);
    expect(html).toMatch(/kalan-odeme\/tok-test/);
  });

  it("bakiyesi kapalı rezervasyonda bakiye bildirimi gönderilmez", async () => {
    const { sendBalanceStatement } = await import("@/lib/notifications");
    const notify = await import("@/lib/notify");

    const { bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      totalAmount: 2000,
    });

    vi.mocked(notify.sendEmail).mockClear();
    await sendBalanceStatement(bookingId);
    expect(notify.sendEmail).not.toHaveBeenCalled();
  });
});
