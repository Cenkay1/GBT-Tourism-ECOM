import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";
import { cancelBookingByAdmin, changeBookingSeat } from "@/lib/booking";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// E-posta gerçekten gönderilmesin; çağrıldığını doğrulamak yeterli.
// lib/booking.ts bu modülü dinamik import ettiği için mock devreye girer.
const sendCancellation = vi.fn(async () => {});
vi.mock("@/lib/notifications", () => ({
  sendBookingCancellation: (...args: unknown[]) => sendCancellation(...(args as [])),
  sendBookingConfirmation: async () => {},
  sendAgeVerificationRequest: async () => {},
}));

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

describe("cancelBookingByAdmin", () => {
  it("moves a paid passenger and releases only the old seat", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, { seatCodes: ["1A"] });
    const passenger = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });
    expect(await changeBookingSeat(bookingId, passenger.id, "2A")).toEqual({ ok: true });
    expect((await prisma.passenger.findUniqueOrThrow({ where: { id: passenger.id } })).seatCode).toBe("2A");
    expect((await prisma.seat.findFirstOrThrow({ where: { departureId, code: "1A" } })).status).toBe("BOS");
    expect((await prisma.seat.findFirstOrThrow({ where: { departureId, code: "2A" } })).status).toBe("SATILDI");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).totalAmount).toBe(2000);
  });

  it("rejects occupied targets and passengers from another booking", async () => {
    const first = await createTestBooking(prisma, { seatCodes: ["1A", "1B"] });
    const other = await createTestBooking(prisma);
    const passenger = await prisma.passenger.findFirstOrThrow({ where: { bookingId: first.bookingId } });
    const outsider = await prisma.passenger.findFirstOrThrow({ where: { bookingId: other.bookingId } });
    expect((await changeBookingSeat(first.bookingId, passenger.id, "1B")).ok).toBe(false);
    expect((await changeBookingSeat(first.bookingId, outsider.id, "2A")).ok).toBe(false);
    expect((await prisma.passenger.findUniqueOrThrow({ where: { id: passenger.id } })).seatCode).toBe("1A");
  });

  it("keeps pending seat locks and other departures unchanged", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, { status: "BEKLIYOR", seatCodes: ["1A"] });
    const other = await prisma.tourDeparture.create({ data: { tourId, departureDate: new Date() } });
    const otherSeat = await prisma.seat.create({ data: { tourId, departureId: other.id, code: "1A", status: "SATILDI", gender: "K" } });
    const passenger = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });
    expect((await changeBookingSeat(bookingId, passenger.id, "2A")).ok).toBe(true);
    expect((await prisma.seat.findFirstOrThrow({ where: { departureId, code: "2A" } })).status).toBe("KILITLI");
    expect((await prisma.seat.findUniqueOrThrow({ where: { id: otherSeat.id } })).status).toBe("SATILDI");
  });

  it("rejects a gender conflict without releasing the old seat", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, { seatCodes: ["1A"] });
    await prisma.tour.update({ where: { id: tourId }, data: { seatLayout: "2+2" } });
    await prisma.seat.updateMany({ where: { departureId, code: "2B" }, data: { status: "SATILDI", gender: "K" } });
    const passenger = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });
    expect((await changeBookingSeat(bookingId, passenger.id, "2A")).ok).toBe(false);
    expect((await prisma.seat.findFirstOrThrow({ where: { departureId, code: "1A" } })).status).toBe("SATILDI");
    expect((await prisma.seat.findFirstOrThrow({ where: { departureId, code: "2A" } })).status).toBe("BOS");
  });

  it("rejects cancelled and expired bookings", async () => {
    const { bookingId } = await createTestBooking(prisma, { status: "IPTAL", seatCodes: ["1A"] });
    const passenger = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });
    expect((await changeBookingSeat(bookingId, passenger.id, "2A")).ok).toBe(false);
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "BEKLIYOR", holdExpiresAt: new Date(0) } });
    expect((await changeBookingSeat(bookingId, passenger.id, "2A")).ok).toBe(false);
  });

  it("SATILDI koltukları boşa alır", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      status: "ODENDI",
      seatCodes: ["1A", "1B"],
    });

    const res = await cancelBookingByAdmin(bookingId, "Müşteri vazgeçti");

    expect(res.ok).toBe(true);
    const seats = await prisma.seat.findMany({
      where: { departureId, code: { in: ["1A", "1B"] } },
    });
    expect(seats.every((s) => s.status === "BOS")).toBe(true);
    expect(seats.every((s) => s.gender === null)).toBe(true);
  });

  it("KILITLI koltukları da boşa alır", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["2A"],
    });

    await cancelBookingByAdmin(bookingId, "Ödeme gelmedi");

    const seat = await prisma.seat.findFirst({ where: { departureId, code: "2A" } });
    expect(seat?.status).toBe("BOS");
  });

  it("rezervasyonu IPTAL'e çeker", async () => {
    const { bookingId } = await createTestBooking(prisma);

    await cancelBookingByAdmin(bookingId, "Tur iptal oldu");

    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.status).toBe("IPTAL");
  });

  it("aynı seferdeki başka rezervasyonun koltuğuna dokunmaz", async () => {
    const first = await createTestBooking(prisma, { seatCodes: ["1A"] });
    // Aynı sefere ikinci bir rezervasyon ekle.
    await prisma.seat.updateMany({
      where: { departureId: first.departureId, code: "3A" },
      data: { status: "SATILDI", gender: "K" },
    });
    await prisma.booking.create({
      data: {
        tourId: first.tourId,
        departureId: first.departureId,
        status: "ODENDI",
        totalAmount: 1000,
        contactName: "Diğer",
        contactPhone: "5550000000",
        contactEmail: "diger@example.com",
        quantity: 1,
        passengers: { create: [{ firstName: "A", lastName: "B", seatCode: "3A" }] },
      },
    });

    await cancelBookingByAdmin(first.bookingId, "Test");

    const other = await prisma.seat.findFirst({
      where: { departureId: first.departureId, code: "3A" },
    });
    expect(other?.status).toBe("SATILDI");
  });

  it("iptal e-postasını nedeniyle birlikte gönderir", async () => {
    sendCancellation.mockClear();
    const { bookingId } = await createTestBooking(prisma);

    await cancelBookingByAdmin(bookingId, "Otobüs arızası");

    expect(sendCancellation).toHaveBeenCalledWith(bookingId, "Otobüs arızası", undefined);
  });

  it("notify:false ile e-posta göndermez", async () => {
    sendCancellation.mockClear();
    const { bookingId } = await createTestBooking(prisma);

    await cancelBookingByAdmin(bookingId, "Sessiz iptal", { notify: false });

    expect(sendCancellation).not.toHaveBeenCalled();
  });

  it("neden boşsa reddeder", async () => {
    const { bookingId } = await createTestBooking(prisma);

    const res = await cancelBookingByAdmin(bookingId, "   ");

    expect(res.ok).toBe(false);
    expect(res.error).toContain("neden");
  });

  it("zaten iptal edilmişse ikinci çağrı sorun çıkarmaz", async () => {
    const { bookingId } = await createTestBooking(prisma);
    await cancelBookingByAdmin(bookingId, "İlk");

    const res = await cancelBookingByAdmin(bookingId, "İkinci");

    expect(res.ok).toBe(true);
  });

  it("olmayan rezervasyonda hata döndürür", async () => {
    const res = await cancelBookingByAdmin("yok-boyle-bir-id", "Test");

    expect(res.ok).toBe(false);
    expect(res.error).toContain("bulunamadı");
  });

  it("zaten iptal edilmiş rezervasyonda yan etkiler yine çalışır (e-posta tekrar gider)", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      seatCodes: ["1A", "1B"],
    });
    await cancelBookingByAdmin(bookingId, "İlk iptal");
    sendCancellation.mockClear();

    const res = await cancelBookingByAdmin(bookingId, "İkinci iptal");

    expect(res.ok).toBe(true);
    // Erken çıkış transaction'ı atlasa da yan etki (e-posta) tekrar çalışmalı.
    expect(sendCancellation).toHaveBeenCalledTimes(1);
    const seats = await prisma.seat.findMany({
      where: { departureId, code: { in: ["1A", "1B"] } },
    });
    expect(seats.every((s) => s.status === "BOS")).toBe(true);
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.status).toBe("IPTAL");
  });

  it("yarıda kalmış iptalin (koltuk boşalmış ama puan geri alınmamış) puanını tamamlar", async () => {
    const user = await prisma.user.create({
      data: {
        email: `yarida${Date.now()}${Math.random()}@example.com`,
        points: 500,
        lifetimePoints: 500,
        tier: "BRONZE",
      },
    });
    const { bookingId, departureId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 2000,
      seatCodes: ["1A", "1B"],
    });
    const { awardLoyaltyForBooking } = await import("@/lib/loyalty");
    await awardLoyaltyForBooking(bookingId);

    // Veritabanını elle "yarıda kalmış iptal" durumuna getir: transaction
    // (koltuk + durum) daha önce tamamlanmış ama yan etkiler (puan geri
    // alma) hiç çalışmamış gibi — loyaltyAwardedAt hâlâ dolu.
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "IPTAL" } });
    await prisma.seat.updateMany({
      where: { departureId, code: { in: ["1A", "1B"] } },
      data: { status: "BOS", gender: null },
    });

    const res = await cancelBookingByAdmin(bookingId, "Yarıda kalmış iptali tamamla");

    expect(res.ok).toBe(true);
    const afterUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(afterUser?.points).toBe(500); // 500 + 2000 kazanım - 2000 geri alım = 500
    const afterBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(afterBooking?.loyaltyAwardedAt).toBeNull();
  });
});
