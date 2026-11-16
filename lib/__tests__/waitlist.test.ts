import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma, createTestBooking } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

// Yardımcı: dolu olmayan bir sefer kurar (createTestBooking 2 koltuk satar,
// 6 koltuklu minibüste 4 boş kalır).
async function setup() {
  const { tourId, departureId } = await createTestBooking(prisma, {
    status: "ODENDI",
    seatCodes: ["1A", "1B"],
  });
  return { tourId, departureId };
}

async function fillAllSeats(departureId: string) {
  await prisma.seat.updateMany({
    where: { departureId },
    data: { status: "SATILDI", gender: "E" },
  });
}

describe("createWaitlistEntry", () => {
  it("dolu seferde kayıt açar", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry } = await import("@/lib/waitlist");

    const res = await createWaitlistEntry({
      tourId,
      departureId,
      contactName: "Ahmet Kaya",
      contactPhone: "5551112233",
      contactEmail: "ahmet@example.com",
      quantity: 2,
      note: "İki kişi, pencere kenarı olursa iyi olur",
    });
    expect(res.ok).toBe(true);

    const row = await prisma.waitlist.findFirst({ where: { departureId } });
    expect(row).not.toBeNull();
    expect(row!.contactName).toBe("Ahmet Kaya");
    expect(row!.quantity).toBe(2);
    expect(row!.status).toBe("BEKLIYOR");
    expect(row!.bookingId).toBeNull();
  });

  it("BOŞ YER VARKEN kayıt açmaz — müşteri normal rezervasyon yapmalı", async () => {
    const { tourId, departureId } = await setup();
    const { createWaitlistEntry } = await import("@/lib/waitlist");

    const res = await createWaitlistEntry({
      tourId,
      departureId,
      contactName: "Boş Yer",
      contactPhone: "5551112233",
      contactEmail: "bos@example.com",
      quantity: 1,
      note: "",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("yer");
  });

  it("eksik iletişim bilgisi reddedilir", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry } = await import("@/lib/waitlist");

    for (const bad of [
      { contactName: "", contactPhone: "5551112233", contactEmail: "a@b.co" },
      { contactName: "Ad", contactPhone: "", contactEmail: "a@b.co" },
      { contactName: "Ad", contactPhone: "5551112233", contactEmail: "gecersiz" },
    ]) {
      const res = await createWaitlistEntry({
        tourId,
        departureId,
        quantity: 1,
        note: "",
        ...bad,
      });
      expect(res.ok).toBe(false);
    }
  });

  it("kişi sayısı en az 1, en çok 9 olur", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry } = await import("@/lib/waitlist");
    const base = {
      tourId,
      departureId,
      contactName: "Ad",
      contactPhone: "5551112233",
      contactEmail: "a@b.co",
      note: "",
    };
    expect((await createWaitlistEntry({ ...base, quantity: 0 })).ok).toBe(false);
    expect((await createWaitlistEntry({ ...base, quantity: 10 })).ok).toBe(false);
  });

  it("kontenjan sayımını ETKİLEMEZ", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry } = await import("@/lib/waitlist");

    const before = await prisma.booking.count({ where: { departureId } });
    await createWaitlistEntry({
      tourId,
      departureId,
      contactName: "Sayım",
      contactPhone: "5551112233",
      contactEmail: "sayim@example.com",
      quantity: 3,
      note: "",
    });
    // Yedek kayıt bir rezervasyon DEĞİL: Booking tablosuna hiçbir şey eklenmez.
    expect(await prisma.booking.count({ where: { departureId } })).toBe(before);
  });
});

describe("markWaitlistConverted", () => {
  it("dönüşümü işaretler ve rezervasyonu bağlar", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry, markWaitlistConverted } = await import("@/lib/waitlist");

    await createWaitlistEntry({
      tourId,
      departureId,
      contactName: "Dönüşen",
      contactPhone: "5551112233",
      contactEmail: "d@example.com",
      quantity: 1,
      note: "",
    });
    const row = (await prisma.waitlist.findFirst({ where: { departureId } }))!;
    const { bookingId } = await createTestBooking(prisma, { status: "ODENDI" });

    const res = await markWaitlistConverted(row.id, bookingId);
    expect(res.ok).toBe(true);

    const after = (await prisma.waitlist.findUnique({ where: { id: row.id } }))!;
    expect(after.status).toBe("DONUSTURULDU");
    expect(after.bookingId).toBe(bookingId);
    expect(after.handledAt).not.toBeNull();
  });

  it("ikinci kez dönüştürülemez", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry, markWaitlistConverted } = await import("@/lib/waitlist");
    await createWaitlistEntry({
      tourId,
      departureId,
      contactName: "Tek",
      contactPhone: "5551112233",
      contactEmail: "t@example.com",
      quantity: 1,
      note: "",
    });
    const row = (await prisma.waitlist.findFirst({ where: { departureId } }))!;
    const a = await createTestBooking(prisma, { status: "ODENDI" });
    const b = await createTestBooking(prisma, { status: "ODENDI" });

    expect((await markWaitlistConverted(row.id, a.bookingId)).ok).toBe(true);
    const second = await markWaitlistConverted(row.id, b.bookingId);
    expect(second.ok).toBe(false);

    // İlk bağlantı korunur.
    const after = (await prisma.waitlist.findUnique({ where: { id: row.id } }))!;
    expect(after.bookingId).toBe(a.bookingId);
  });
});

describe("moveWaitlistEntry", () => {
  it("kaydı başka sefere taşır", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry, moveWaitlistEntry } = await import("@/lib/waitlist");
    await createWaitlistEntry({
      tourId,
      departureId,
      contactName: "Taşınan",
      contactPhone: "5551112233",
      contactEmail: "ta@example.com",
      quantity: 1,
      note: "",
    });
    const row = (await prisma.waitlist.findFirst({ where: { departureId } }))!;

    // 2. otobüs yeni bir sefer olarak açılır.
    const ikinci = await prisma.tourDeparture.create({
      data: { tourId, departureDate: new Date(Date.now() + 8 * 86400000), status: "AKTIF" },
    });

    expect((await moveWaitlistEntry(row.id, ikinci.id)).ok).toBe(true);
    const after = (await prisma.waitlist.findUnique({ where: { id: row.id } }))!;
    expect(after.departureId).toBe(ikinci.id);
    expect(after.status).toBe("BEKLIYOR");
  });

  it("başka TURUN seferine taşınamaz", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry, moveWaitlistEntry } = await import("@/lib/waitlist");
    await createWaitlistEntry({
      tourId,
      departureId,
      contactName: "Yabancı",
      contactPhone: "5551112233",
      contactEmail: "y@example.com",
      quantity: 1,
      note: "",
    });
    const row = (await prisma.waitlist.findFirst({ where: { departureId } }))!;
    const other = await setup();

    const res = await moveWaitlistEntry(row.id, other.departureId);
    expect(res.ok).toBe(false);
  });
});

describe("cancelWaitlistEntry", () => {
  it("iptal eder ve notu saklar", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry, cancelWaitlistEntry } = await import("@/lib/waitlist");
    await createWaitlistEntry({
      tourId,
      departureId,
      contactName: "İptal",
      contactPhone: "5551112233",
      contactEmail: "i@example.com",
      quantity: 1,
      note: "",
    });
    const row = (await prisma.waitlist.findFirst({ where: { departureId } }))!;

    expect((await cancelWaitlistEntry(row.id, "Müşteri vazgeçti")).ok).toBe(true);
    const after = (await prisma.waitlist.findUnique({ where: { id: row.id } }))!;
    expect(after.status).toBe("IPTAL");
    expect(after.handledNote).toBe("Müşteri vazgeçti");
    expect(after.handledAt).not.toBeNull();
  });
});

describe("waitlistCountFor", () => {
  it("sadece BEKLIYOR kayıtların kişi sayısını toplar", async () => {
    const { tourId, departureId } = await setup();
    await fillAllSeats(departureId);
    const { createWaitlistEntry, cancelWaitlistEntry, waitlistCountFor } = await import(
      "@/lib/waitlist"
    );
    const base = {
      tourId,
      departureId,
      contactPhone: "5551112233",
      note: "",
    };
    await createWaitlistEntry({ ...base, contactName: "A", contactEmail: "a@x.co", quantity: 2 });
    await createWaitlistEntry({ ...base, contactName: "B", contactEmail: "b@x.co", quantity: 3 });
    await createWaitlistEntry({ ...base, contactName: "C", contactEmail: "c@x.co", quantity: 4 });

    const cRow = (await prisma.waitlist.findFirst({
      where: { departureId, contactEmail: "c@x.co" },
    }))!;
    await cancelWaitlistEntry(cRow.id, "vazgeçti");

    // 2 + 3 = 5 (iptal edilen 4 sayılmaz)
    expect(await waitlistCountFor(departureId)).toBe(5);
  });
});
