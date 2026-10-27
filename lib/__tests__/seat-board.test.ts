import { describe, it, expect, beforeAll } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";
import {
  getSeatBoard,
  unseatPassenger,
  placePassenger,
  swapPassengers,
} from "@/lib/seat-board";
import type { PrismaClient } from "@/lib/generated/prisma/client";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

// createTestBooking tek rezervasyon üretiyor; takas testleri için AYNI sefere
// ikinci bir rezervasyon gerekiyor.
async function addBooking(
  tourId: string,
  departureId: string,
  opts: { seatCode: string; gender: "E" | "K"; status?: string }
) {
  const status = opts.status ?? "ODENDI";
  await prisma.seat.updateMany({
    where: { departureId, code: opts.seatCode },
    data: { status: status === "ODENDI" ? "SATILDI" : "KILITLI", gender: opts.gender },
  });
  const booking = await prisma.booking.create({
    data: {
      tourId,
      departureId,
      status,
      totalAmount: 1000,
      contactName: "İkinci Müşteri",
      contactPhone: "5559998877",
      contactEmail: `ikinci-${Date.now()}-${Math.random()}@example.com`,
      quantity: 1,
      passengers: {
        create: [
          {
            firstName: "Diğer",
            lastName: "Yolcu",
            seatCode: opts.seatCode,
            gender: opts.gender,
            nationality: "TC",
          },
        ],
      },
    },
    include: { passengers: true },
  });
  return { bookingId: booking.id, passenger: booking.passengers[0] };
}

const seatAt = (departureId: string, code: string) =>
  prisma.seat.findFirstOrThrow({ where: { departureId, code } });
const passengerAt = (id: string) => prisma.passenger.findUniqueOrThrow({ where: { id } });

// Yan yana kuralının devreye girmesi için 2+2 düzen gerekiyor; varsayılan
// test turu 1+1 (komşusuz).
const useSideBySideLayout = (tourId: string) =>
  prisma.tour.update({ where: { id: tourId }, data: { seatLayout: "2+2" } });

describe("unseatPassenger", () => {
  it("koltuğu boşaltır ama rezervasyonu ve diğer yolcuyu bırakır", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, { seatCodes: ["1A", "1B"] });
    const [first, second] = await prisma.passenger.findMany({
      where: { bookingId },
      orderBy: { seatCode: "asc" },
    });

    expect(await unseatPassenger(first.id)).toEqual({ ok: true });

    expect((await seatAt(departureId, "1A")).status).toBe("BOS");
    expect((await seatAt(departureId, "1A")).gender).toBeNull();
    expect((await passengerAt(first.id)).seatCode).toBeNull();
    // Rezervasyon ayakta, diğer yolcu yerinde.
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("ODENDI");
    expect((await passengerAt(second.id)).seatCode).toBe("1B");
    expect((await seatAt(departureId, "1B")).status).toBe("SATILDI");
  });

  it("iptal edilmiş rezervasyonun yolcusuna dokunmaz", async () => {
    const { bookingId } = await createTestBooking(prisma, { status: "IPTAL", seatCodes: ["1A"] });
    const passenger = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });
    expect((await unseatPassenger(passenger.id)).ok).toBe(false);
    expect((await passengerAt(passenger.id)).seatCode).toBe("1A");
  });
});

describe("placePassenger", () => {
  it("koltuksuz yolcuyu oturtur ve rezervasyon durumuna göre koltuğu işaretler", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, { seatCodes: ["1A"] });
    const passenger = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });
    await unseatPassenger(passenger.id);

    expect(await placePassenger(passenger.id, "3B")).toEqual({ ok: true });
    expect((await seatAt(departureId, "3B")).status).toBe("SATILDI");
    expect((await seatAt(departureId, "3B")).gender).toBe("E");
    expect((await passengerAt(passenger.id)).seatCode).toBe("3B");
  });

  it("BEKLIYOR rezervasyonun koltuğunu KILITLI yazar", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["1A"],
    });
    const passenger = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });

    expect((await placePassenger(passenger.id, "2A")).ok).toBe(true);
    expect((await seatAt(departureId, "2A")).status).toBe("KILITLI");
    expect((await seatAt(departureId, "1A")).status).toBe("BOS");
  });

  it("dolu hedefi reddeder ve hiçbir şeyi değiştirmez", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, { seatCodes: ["1A", "1B"] });
    const passenger = await prisma.passenger.findFirstOrThrow({
      where: { bookingId, seatCode: "1A" },
    });

    expect((await placePassenger(passenger.id, "1B")).ok).toBe(false);
    expect((await passengerAt(passenger.id)).seatCode).toBe("1A");
    expect((await seatAt(departureId, "1A")).status).toBe("SATILDI");
  });

  it("yan yana cinsiyet kuralını ihlal eden hedefi reddeder", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, { seatCodes: ["1A"] });
    await useSideBySideLayout(tourId);
    await prisma.seat.updateMany({
      where: { departureId, code: "2B" },
      data: { status: "SATILDI", gender: "K" },
    });
    const passenger = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });

    expect((await placePassenger(passenger.id, "2A")).ok).toBe(false);
    expect((await seatAt(departureId, "1A")).status).toBe("SATILDI");
    expect((await seatAt(departureId, "2A")).status).toBe("BOS");
    expect((await passengerAt(passenger.id)).seatCode).toBe("1A");
  });
});

describe("swapPassengers", () => {
  it("iki yolcunun koltuklarını birlikte değiştirir", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, { seatCodes: ["1A"] });
    const a = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });
    const { passenger: b } = await addBooking(tourId, departureId, { seatCode: "3A", gender: "E" });

    expect(await swapPassengers(a.id, b.id)).toEqual({ ok: true });

    expect((await passengerAt(a.id)).seatCode).toBe("3A");
    expect((await passengerAt(b.id)).seatCode).toBe("1A");
    expect((await seatAt(departureId, "1A")).status).toBe("SATILDI");
    expect((await seatAt(departureId, "3A")).status).toBe("SATILDI");
  });

  it("farklı durumdaki rezervasyonlarda koltuk statülerini de takas eder", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, { seatCodes: ["1A"] });
    const paid = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });
    const { passenger: waiting } = await addBooking(tourId, departureId, {
      seatCode: "3A",
      gender: "E",
      status: "BEKLIYOR",
    });

    expect((await swapPassengers(paid.id, waiting.id)).ok).toBe(true);

    // Ödenmiş yolcu 3A'ya geçtiği için 3A SATILDI, bekleyen 1A'ya geçtiği için 1A KILITLI.
    expect((await seatAt(departureId, "3A")).status).toBe("SATILDI");
    expect((await seatAt(departureId, "1A")).status).toBe("KILITLI");
  });

  it("takas SONRASI oluşacak cinsiyet ihlalini reddeder", async () => {
    // 1A ve 1B yan yana (2+2). 1A'daki E ile 3A'daki K takas edilirse
    // 1A'ya K gelir ve yanındaki 1B'de E kalır — kurala aykırı.
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, {
      seatCodes: ["1A", "1B"],
    });
    await useSideBySideLayout(tourId);
    const a = await prisma.passenger.findFirstOrThrow({ where: { bookingId, seatCode: "1A" } });
    const { passenger: b } = await addBooking(tourId, departureId, { seatCode: "3A", gender: "K" });

    expect((await swapPassengers(a.id, b.id)).ok).toBe(false);
    expect((await passengerAt(a.id)).seatCode).toBe("1A");
    expect((await passengerAt(b.id)).seatCode).toBe("3A");
    expect((await seatAt(departureId, "1A")).gender).toBe("E");
    expect((await seatAt(departureId, "3A")).gender).toBe("K");
  });

  it("koltuksuz yolcuyla takası reddeder", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, { seatCodes: ["1A"] });
    const a = await prisma.passenger.findFirstOrThrow({ where: { bookingId } });
    const { passenger: b } = await addBooking(tourId, departureId, { seatCode: "3A", gender: "E" });
    await unseatPassenger(b.id);

    expect((await swapPassengers(a.id, b.id)).ok).toBe(false);
    expect((await passengerAt(a.id)).seatCode).toBe("1A");
  });
});

describe("getSeatBoard", () => {
  it("koltuk sahiplerini, rezervasyon arkadaşlarını ve koltuksuzları döndürür", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, {
      seatCodes: ["1A", "1B"],
    });
    const [first, second] = await prisma.passenger.findMany({
      where: { bookingId },
      orderBy: { seatCode: "asc" },
    });
    await unseatPassenger(second.id);

    const board = await getSeatBoard(tourId, departureId);

    expect(board.occupants["1A"].passengerId).toBe(first.id);
    expect(board.occupants["1A"].bookingStatus).toBe("ODENDI");
    expect(board.occupants["1A"].partySize).toBe(2);
    expect(board.occupants["1A"].partySeats).toEqual([]); // diğer yolcu artık koltuksuz
    expect(board.occupants["1B"]).toBeUndefined();
    expect(board.unseated.map((o) => o.passengerId)).toEqual([second.id]);
    expect(board.issues).toEqual([]);
  });

  it("aynı rezervasyonun diğer koltuklarını listeler", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, {
      seatCodes: ["1A", "1B"],
    });
    const first = await prisma.passenger.findFirstOrThrow({ where: { bookingId, seatCode: "1A" } });
    const board = await getSeatBoard(tourId, departureId);

    expect(board.occupants["1A"].passengerId).toBe(first.id);
    expect(board.occupants["1A"].partySeats).toEqual(["1B"]);
  });

  it("iptal edilen rezervasyonun yolcularını saymaz", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, { seatCodes: ["1A"] });
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "IPTAL" } });

    const board = await getSeatBoard(tourId, departureId);
    expect(board.occupants).toEqual({});
    expect(board.unseated).toEqual([]);
    // Koltuk hâlâ SATILDI ama sahibi yok — bu uyuşmazlık raporlanmalı.
    expect(board.issues.map((i) => [i.seatCode, i.kind])).toEqual([["1A", "SAHIPSIZ_KOLTUK"]]);
  });

  it("koltuğu boş kayıtlı olan yolcuyu uyuşmazlık olarak işaretler", async () => {
    const { bookingId, departureId, tourId } = await createTestBooking(prisma, { seatCodes: ["1A"] });
    // Yalnız koltuk satırını boşa çekiyoruz; yolcu hâlâ 1A'da yazılı.
    await prisma.seat.updateMany({
      where: { departureId, code: "1A" },
      data: { status: "BOS", gender: null },
    });
    void bookingId;

    const board = await getSeatBoard(tourId, departureId);
    expect(board.issues.map((i) => i.kind)).toEqual(["KAYITSIZ_YOLCU"]);
    // Yolcu yine de tahtada görünür ki görevli sorunu oradan düzeltebilsin.
    expect(board.occupants["1A"]).toBeDefined();
  });
});
