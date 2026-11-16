import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma, createTestBooking } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

describe("deleteBookingRecord — koltuk serbest bırakma", () => {
  it("silinen rezervasyonun koltukları BOŞ'a döner", async () => {
    const { deleteBookingRecord } = await import("@/lib/booking");
    const { departureId, bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      seatCodes: ["1A", "1B"],
    });

    // Ön koşul: koltuklar satılı.
    const before = await prisma.seat.findMany({
      where: { departureId, code: { in: ["1A", "1B"] } },
    });
    expect(before.every((s) => s.status === "SATILDI")).toBe(true);

    const res = await deleteBookingRecord(bookingId);
    expect(res.ok).toBe(true);

    // Rezervasyon gitti.
    expect(await prisma.booking.findUnique({ where: { id: bookingId } })).toBeNull();

    // ASIL KONTROL: koltuklar artık boş ve cinsiyetsiz. Bu düzeltilmeden önce
    // SATILDI kalıyordu ve koltuk tahtasında "sahipsiz dolu koltuk" (turuncu
    // tutarsız kayıt) olarak görünüyordu.
    const after = await prisma.seat.findMany({
      where: { departureId, code: { in: ["1A", "1B"] } },
    });
    expect(after).toHaveLength(2);
    for (const s of after) {
      expect(s.status).toBe("BOS");
      expect(s.gender).toBeNull();
    }
  });

  it("BEKLIYOR rezervasyonun kilitli koltuklarını da bırakır", async () => {
    const { deleteBookingRecord } = await import("@/lib/booking");
    const { departureId, bookingId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["2A"],
    });

    expect((await deleteBookingRecord(bookingId)).ok).toBe(true);
    const seat = await prisma.seat.findFirst({
      where: { departureId, code: "2A" },
    });
    expect(seat!.status).toBe("BOS");
  });

  it("BAŞKA seferin aynı kodlu koltuğuna dokunmaz", async () => {
    const { deleteBookingRecord } = await import("@/lib/booking");
    const a = await createTestBooking(prisma, { status: "ODENDI", seatCodes: ["1A"] });
    const b = await createTestBooking(prisma, { status: "ODENDI", seatCodes: ["1A"] });

    await deleteBookingRecord(a.bookingId);

    // b'nin 1A koltuğu HÂLÂ satılı olmalı — başka müşterinin koltuğu.
    const other = await prisma.seat.findFirst({
      where: { departureId: b.departureId, code: "1A" },
    });
    expect(other!.status).toBe("SATILDI");
  });

  it("olmayan rezervasyonda hata döner", async () => {
    const { deleteBookingRecord } = await import("@/lib/booking");
    expect((await deleteBookingRecord("yok-boyle-bir-rez")).ok).toBe(false);
  });
});

describe("deleteBookingRecord — puan geri alma", () => {
  it("üyeye yazılmış puanı geri alır", async () => {
    const { deleteBookingRecord } = await import("@/lib/booking");
    const { awardLoyaltyForBooking } = await import("@/lib/loyalty");

    const user = await prisma.user.create({
      data: {
        email: `sil${Date.now()}@example.com`,
        name: "Puanlı Üye",
        emailVerified: new Date(),
      },
    });
    const { bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      userId: user.id,
      totalAmount: 5000,
    });

    await awardLoyaltyForBooking(bookingId);
    const awarded = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    expect(awarded.points).toBeGreaterThan(0);

    expect((await deleteBookingRecord(bookingId)).ok).toBe(true);

    // Puan geri alınmış olmalı: silinen rezervasyonun puanı üyede kalmamalı.
    const after = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    expect(after.points).toBe(0);
  });

  it("misafir rezervasyonda puan işlemi gerekmez", async () => {
    const { deleteBookingRecord } = await import("@/lib/booking");
    const { bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      userId: null,
    });
    expect((await deleteBookingRecord(bookingId)).ok).toBe(true);
  });
});

describe("releaseOrphanSeats — mevcut bozuk kayıtların onarımı", () => {
  it("yolcusu olmayan dolu koltuğu boşaltır", async () => {
    const { releaseOrphanSeats } = await import("@/lib/booking");
    const { departureId, bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      seatCodes: ["1A", "1B"],
    });

    // Eski hatalı davranışı taklit et: rezervasyonu koltukları bırakmadan sil.
    await prisma.booking.delete({ where: { id: bookingId } });
    const stuck = await prisma.seat.findMany({
      where: { departureId, code: { in: ["1A", "1B"] } },
    });
    expect(stuck.every((s) => s.status === "SATILDI")).toBe(true);

    const res = await releaseOrphanSeats(departureId);
    expect(res.released).toBe(2);

    const after = await prisma.seat.findMany({
      where: { departureId, code: { in: ["1A", "1B"] } },
    });
    for (const s of after) {
      expect(s.status).toBe("BOS");
      expect(s.gender).toBeNull();
    }
  });

  it("YOLCUSU OLAN koltuğa dokunmaz", async () => {
    const { releaseOrphanSeats } = await import("@/lib/booking");
    const { departureId } = await createTestBooking(prisma, {
      status: "ODENDI",
      seatCodes: ["1A"],
    });

    const res = await releaseOrphanSeats(departureId);
    expect(res.released).toBe(0);
    const seat = await prisma.seat.findFirst({ where: { departureId, code: "1A" } });
    expect(seat!.status).toBe("SATILDI");
  });

  it("BLOKE koltuğa dokunmaz — admin kasten kapatmış olabilir", async () => {
    const { releaseOrphanSeats } = await import("@/lib/booking");
    const { departureId } = await createTestBooking(prisma, {
      status: "ODENDI",
      seatCodes: ["1A"],
    });
    await prisma.seat.updateMany({
      where: { departureId, code: "2A" },
      data: { status: "BLOKE" },
    });

    await releaseOrphanSeats(departureId);
    const seat = await prisma.seat.findFirst({ where: { departureId, code: "2A" } });
    expect(seat!.status).toBe("BLOKE");
  });

  it("İPTAL rezervasyonun koltuğunu sahipli saymaz (iptal koltuğu bırakmıştır)", async () => {
    const { releaseOrphanSeats } = await import("@/lib/booking");
    const { departureId, bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      seatCodes: ["1A"],
    });
    // Rezervasyonu IPTAL yap ama koltuğu bilerek SATILDI bırak (bozuk veri).
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "IPTAL" },
    });

    const res = await releaseOrphanSeats(departureId);
    expect(res.released).toBe(1);
    const seat = await prisma.seat.findFirst({ where: { departureId, code: "1A" } });
    expect(seat!.status).toBe("BOS");
  });
});
