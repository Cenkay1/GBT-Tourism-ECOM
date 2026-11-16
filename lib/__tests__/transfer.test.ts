import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma, createTestBooking } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

let n = 0;

// Devredilecek yeni kişi — geçerli bilgilerle.
function yeniKisi(over: Record<string, unknown> = {}) {
  return {
    firstName: "Yeni",
    lastName: "Yolcu",
    email: `yeni${++n}.${Date.now()}@example.com`,
    phone: "5559998877",
    gender: "E" as const,
    idNumber: "11111111110",
    nationality: "TC" as const,
    birthDate: "1990-05-10",
    ...over,
  };
}

async function odenmisRezervasyon(opts?: {
  departureDate?: Date;
  seatCodes?: string[];
  userId?: string | null;
  totalAmount?: number;
}) {
  return createTestBooking(prisma, {
    status: "ODENDI",
    seatCodes: opts?.seatCodes ?? ["1A", "1B"],
    departureDate: opts?.departureDate ?? new Date(Date.now() + 20 * 86400000),
    userId: opts?.userId ?? null,
    totalAmount: opts?.totalAmount,
  });
}

async function ilkYolcu(bookingId: string) {
  return (await prisma.passenger.findFirst({ where: { bookingId } }))!;
}

describe("transferPassenger — uygunluk kuralları", () => {
  it("ödenmiş ve bakiyesiz rezervasyonda devir yapılır", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon();
    const p = await ilkYolcu(bookingId);

    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi(),
      actor: "MUSTERI",
      actorEmail: "sahip@example.com",
    });
    expect(res.ok).toBe(true);
  });

  it("BEKLIYOR rezervasyon devredilemez", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await createTestBooking(prisma, { status: "BEKLIYOR" });
    const p = await ilkYolcu(bookingId);

    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi(),
      actor: "MUSTERI",
      actorEmail: "x@example.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/ödeme|onayl/i);
  });

  it("açık bakiyeli rezervasyon devredilemez (adminde de)", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await createTestBooking(prisma, {
      status: "ODENDI",
      totalAmount: 2000,
      paidAmount: 500, // kapora
    });
    const p = await ilkYolcu(bookingId);

    for (const actor of ["MUSTERI", "ADMIN"] as const) {
      const res = await transferPassenger({
        bookingId,
        passengerId: p.id,
        to: yeniKisi(),
        actor,
        actorEmail: "x@example.com",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/bakiye|ödeme/i);
    }
  });

  it("kalkışa 24 saatten az kaldıysa devredilemez (admin de muaf değil)", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({
      departureDate: new Date(Date.now() + 10 * 3600 * 1000), // 10 saat
    });
    const p = await ilkYolcu(bookingId);

    for (const actor of ["MUSTERI", "ADMIN"] as const) {
      const res = await transferPassenger({
        bookingId,
        passengerId: p.id,
        to: yeniKisi(),
        actor,
        actorEmail: "x@example.com",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/24 saat/i);
    }
  });

  it("başka rezervasyonun yolcusu devredilemez", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const a = await odenmisRezervasyon();
    const b = await odenmisRezervasyon();
    const yabanci = await ilkYolcu(b.bookingId);

    const res = await transferPassenger({
      bookingId: a.bookingId,
      passengerId: yabanci.id,
      to: yeniKisi(),
      actor: "ADMIN",
      actorEmail: "admin@example.com",
    });
    expect(res.ok).toBe(false);
  });

  it("eksik/geçersiz bilgi reddedilir", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon();
    const p = await ilkYolcu(bookingId);

    const bozuk = [
      yeniKisi({ firstName: "" }),
      yeniKisi({ email: "gecersiz" }),
      yeniKisi({ phone: "123" }),
      yeniKisi({ idNumber: "123" }),
    ];
    for (const to of bozuk) {
      const res = await transferPassenger({
        bookingId,
        passengerId: p.id,
        to,
        actor: "MUSTERI",
        actorEmail: "x@example.com",
      });
      expect(res.ok).toBe(false);
    }
  });
});

describe("transferPassenger — yolcu satırı ve kayıt", () => {
  it("yolcu satırı yeni kişinin bilgileriyle güncellenir, koltuk korunur", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"] });
    const p = await ilkYolcu(bookingId);
    const eskiKoltuk = p.seatCode;

    const to = yeniKisi({ firstName: "Ayşe", lastName: "Kaya", gender: "E" });
    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to,
      actor: "MUSTERI",
      actorEmail: "sahip@example.com",
    });
    expect(res.ok).toBe(true);

    const after = (await prisma.passenger.findUnique({ where: { id: p.id } }))!;
    expect(after.firstName).toBe("Ayşe");
    expect(after.lastName).toBe("Kaya");
    expect(after.seatCode).toBe(eskiKoltuk); // koltuk değişmedi
    // Eski kişinin belgesi yeni kişiyi doğrulamaz.
    expect(after.idDocument).toBeNull();
    expect(after.ageVerified).toBe(false);
  });

  it("devir kaydı devredenin kimliğini saklar", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"] });
    const p = await ilkYolcu(bookingId);
    const eskiAd = p.firstName;

    await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi({ firstName: "Can" }),
      actor: "MUSTERI",
      actorEmail: "sahip@example.com",
    });

    const t = (await prisma.bookingTransfer.findFirst({ where: { bookingId } }))!;
    expect(t.fromFirstName).toBe(eskiAd);
    expect(t.toFirstName).toBe("Can");
    expect(t.actor).toBe("MUSTERI");
    expect(t.seatCode).toBe("1A");
    expect(t.priceDifference).toBe(0); // aynı tur
  });
});

describe("transferPassenger — yaş bandı şartı", () => {
  it("farklı yaş bandına devredilemez", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const departureDate = new Date(Date.now() + 20 * 86400000);
    const { bookingId } = await odenmisRezervasyon({ departureDate, seatCodes: ["1A"] });
    const p = await ilkYolcu(bookingId);
    // Yolcuyu ÇOCUK yap.
    const cocukDogum = new Date(departureDate);
    cocukDogum.setFullYear(cocukDogum.getFullYear() - 5);
    await prisma.passenger.update({
      where: { id: p.id },
      data: { birthDate: cocukDogum, ageBand: "CHILD" },
    });

    // Yetişkine devretmeye çalış.
    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi({ birthDate: "1990-01-01" }),
      actor: "MUSTERI",
      actorEmail: "x@example.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/yaş/i);
  });

  it("aynı yaş bandına devir yapılır", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"] });
    const p = await ilkYolcu(bookingId);
    await prisma.passenger.update({
      where: { id: p.id },
      data: { birthDate: new Date("1985-03-03"), ageBand: "ADULT" },
    });

    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi({ birthDate: "1992-07-07" }),
      actor: "MUSTERI",
      actorEmail: "x@example.com",
    });
    expect(res.ok).toBe(true);
  });
});

describe("transferPassenger — cinsiyet kuralı", () => {
  it("yan koltukta karşı cins varsa engellenir ve uygun koltuk önerilir", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { tourId, departureId, bookingId } = await odenmisRezervasyon({
      seatCodes: ["1A"],
    });
    // Komşuluk için serbest plan: 1A ve 1B yan yana.
    const bus = await prisma.bus.create({
      data: {
        name: "Plan", plate: "34 D 1", vehicleType: "OTOBUS",
        seatLayout: "2+2", seatRows: 3,
        seatMap: JSON.stringify([["1A", "1B"], ["2A", "2B"]]),
      },
    });
    await prisma.tourDeparture.update({ where: { id: departureId }, data: { busId: bus.id } });
    // 1B'de KADIN yolcu olsun (başka rezervasyon).
    await prisma.seat.updateMany({
      where: { departureId, code: "1B" },
      data: { status: "SATILDI", gender: "K" },
    });
    await prisma.seat.updateMany({
      where: { departureId, code: "2A" },
      data: { status: "BOS", gender: null },
    });
    expect(tourId).toBeTruthy();

    const p = await ilkYolcu(bookingId);
    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi({ gender: "E" }), // 1B'de kadın var → erkek olamaz
      actor: "MUSTERI",
      actorEmail: "x@example.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("1B");
      // Uygun boş koltuk önerilmeli.
      expect(res.suggestedSeats).toBeDefined();
      expect(res.suggestedSeats!.length).toBeGreaterThan(0);
    }
  });

  it("önerilen koltukla devir tamamlanır", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { departureId, bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"] });
    const bus = await prisma.bus.create({
      data: {
        name: "Plan2", plate: "34 D 2", vehicleType: "OTOBUS",
        seatLayout: "2+2", seatRows: 3,
        seatMap: JSON.stringify([["1A", "1B"], ["2A", "2B"]]),
      },
    });
    await prisma.tourDeparture.update({ where: { id: departureId }, data: { busId: bus.id } });
    await prisma.seat.updateMany({
      where: { departureId, code: "1B" },
      data: { status: "SATILDI", gender: "K" },
    });
    await prisma.seat.updateMany({
      where: { departureId, code: { in: ["2A", "2B"] } },
      data: { status: "BOS", gender: null },
    });

    const p = await ilkYolcu(bookingId);
    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi({ gender: "E" }),
      newSeatCode: "2A",
      actor: "MUSTERI",
      actorEmail: "x@example.com",
    });
    expect(res.ok).toBe(true);

    const after = (await prisma.passenger.findUnique({ where: { id: p.id } }))!;
    expect(after.seatCode).toBe("2A");
    // Eski koltuk boşaldı.
    const old = (await prisma.seat.findFirst({ where: { departureId, code: "1A" } }))!;
    expect(old.status).toBe("BOS");
  });
});

describe("transferPassenger — sahiplik geçişi", () => {
  it("tek yolcu devredilince sahiplik yeni kişiye geçer", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const sahip = await prisma.user.create({
      data: { email: `sahip${++n}.${Date.now()}@example.com`, emailVerified: new Date() },
    });
    const alan = await prisma.user.create({
      data: { email: `alan${++n}.${Date.now()}@example.com`, emailVerified: new Date() },
    });
    const { bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"], userId: sahip.id });
    const p = await ilkYolcu(bookingId);

    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi({ email: alan.email, firstName: "Alan" }),
      actor: "MUSTERI",
      actorEmail: sahip.email,
    });
    expect(res.ok).toBe(true);

    const b = (await prisma.booking.findUnique({ where: { id: bookingId } }))!;
    expect(b.userId).toBe(alan.id);
    expect(b.contactName).toContain("Alan");
    expect(b.ownerSince).not.toBeNull();
    // Rezervasyon HÂLÂ ödenmiş durumda: devir onu geçersiz kılmaz.
    expect(b.status).toBe("ODENDI");

    const t = (await prisma.bookingTransfer.findFirst({ where: { bookingId } }))!;
    expect(t.ownershipMoved).toBe(true);
  });

  it("2 yolcudan 1'i devredilince sahiplik GEÇMEZ", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const sahip = await prisma.user.create({
      data: { email: `sahip${++n}.${Date.now()}@example.com`, emailVerified: new Date() },
    });
    const { bookingId } = await odenmisRezervasyon({
      seatCodes: ["1A", "1B"],
      userId: sahip.id,
    });
    const p = await ilkYolcu(bookingId);

    await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi(),
      actor: "MUSTERI",
      actorEmail: sahip.email,
    });

    const b = (await prisma.booking.findUnique({ where: { id: bookingId } }))!;
    expect(b.userId).toBe(sahip.id); // sahip değişmedi
  });

  it("zincirleme devir (A→B→C) doğru çalışır", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"] });
    const p = await ilkYolcu(bookingId);

    const b1 = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi({ firstName: "Bora" }),
      actor: "MUSTERI",
      actorEmail: "a@example.com",
    });
    expect(b1.ok).toBe(true);

    const b2 = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi({ firstName: "Ceren", gender: "E" }),
      actor: "MUSTERI",
      actorEmail: "b@example.com",
    });
    expect(b2.ok).toBe(true);

    const after = (await prisma.passenger.findUnique({ where: { id: p.id } }))!;
    expect(after.firstName).toBe("Ceren");
    // İki devir kaydı da duruyor: geçmiş kaybolmaz.
    expect(await prisma.bookingTransfer.count({ where: { bookingId } })).toBe(2);
  });
});

describe("transferPassenger — BAŞKA tura devir", () => {
  async function hedefTur(price: number) {
    const departureDate = new Date(Date.now() + 25 * 86400000);
    const tour = await prisma.tour.create({
      data: {
        slug: `hedef-${++n}-${Date.now()}`,
        title: "Hedef Tur",
        destination: "Hedef",
        category: "YURT_ICI",
        bookingType: "KONTENJAN",
        departureDate,
        departureLocation: "Test",
        price,
        coverImage: "",
        capacity: 30,
      },
    });
    const dep = await prisma.tourDeparture.create({
      data: { tourId: tour.id, departureDate, status: "AKTIF", capacity: 30 },
    });
    return { tour, dep };
  }

  it("daha PAHALI tura devirde borç oluşur ve ödeme anahtarı üretilir", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    // Kaynak: tek yolcu, 1000 TL → yolcu payı 1000. Hedef 2500 → fark 1500.
    const { bookingId } = await odenmisRezervasyon({
      seatCodes: ["1A"],
      totalAmount: 1000,
    });
    const p = await ilkYolcu(bookingId);
    const { tour, dep } = await hedefTur(2500);

    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi(),
      targetTourId: tour.id,
      targetDepartureId: dep.id,
      actor: "ADMIN",
      actorEmail: "admin@example.com",
    });
    if (!res.ok) throw new Error(res.error);

    const t = (await prisma.bookingTransfer.findFirst({ where: { bookingId } }))!;
    expect(t.targetBookingId).not.toBeNull();
    expect(t.priceDifference).toBeGreaterThan(0);
    expect(t.differenceStatus).toBe("BEKLIYOR");
    expect(t.differenceToken).not.toBeNull();

    // Hedef rezervasyon açıldı ve açık bakiyesi var.
    const target = (await prisma.booking.findUnique({
      where: { id: t.targetBookingId! },
    }))!;
    expect(target.totalAmount).toBe(2500);
    expect(target.paidAmount).toBe(1000); // devredilen tutar aktarıldı
    expect(t.priceDifference).toBe(1500); // 2500 - 1000
  });

  it("daha UCUZ tura devirde iade bekler", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"] });
    const p = await ilkYolcu(bookingId);
    const { tour, dep } = await hedefTur(400);

    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi(),
      targetTourId: tour.id,
      targetDepartureId: dep.id,
      actor: "ADMIN",
      actorEmail: "admin@example.com",
    });
    if (!res.ok) throw new Error(res.error);

    const t = (await prisma.bookingTransfer.findFirst({ where: { bookingId } }))!;
    expect(t.priceDifference).toBeLessThan(0);
    expect(t.differenceStatus).toBe("IADE_BEKLIYOR");
  });

  it("kaynak rezervasyondaki yolcu ve koltuk serbest kalır", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { departureId, bookingId } = await odenmisRezervasyon({ seatCodes: ["1A", "1B"] });
    const p = await ilkYolcu(bookingId);
    const { tour, dep } = await hedefTur(1000);

    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi(),
      targetTourId: tour.id,
      targetDepartureId: dep.id,
      actor: "ADMIN",
      actorEmail: "admin@example.com",
    });
    if (!res.ok) throw new Error(res.error);

    // Yolcu kaynaktan silindi.
    expect(await prisma.passenger.findUnique({ where: { id: p.id } })).toBeNull();
    // Koltuğu boşaldı.
    const seat = (await prisma.seat.findFirst({ where: { departureId, code: p.seatCode! } }))!;
    expect(seat.status).toBe("BOS");
    // Kaynak rezervasyonun tutarı ve kişi sayısı düştü.
    const src = (await prisma.booking.findUnique({ where: { id: bookingId } }))!;
    expect(src.quantity).toBe(1);
  });

  it("kalkışı 5 günden yakın hedef tura devirde fark PEŞİN istenir", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"] });
    const p = await ilkYolcu(bookingId);
    // Hedef kalkış 3 gün sonra.
    const departureDate = new Date(Date.now() + 3 * 86400000);
    const tour = await prisma.tour.create({
      data: {
        slug: `yakin-${++n}-${Date.now()}`,
        title: "Yakın Tur",
        destination: "Y",
        category: "YURT_ICI",
        bookingType: "KONTENJAN",
        departureDate,
        departureLocation: "T",
        price: 3000,
        coverImage: "",
        capacity: 10,
        depositPercent: 25, // ön ödeme açık ama 5 gün kuralı kapatacak
      },
    });
    const dep = await prisma.tourDeparture.create({
      data: { tourId: tour.id, departureDate, status: "AKTIF", capacity: 10 },
    });

    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi(),
      targetTourId: tour.id,
      targetDepartureId: dep.id,
      actor: "ADMIN",
      actorEmail: "admin@example.com",
    });
    if (!res.ok) throw new Error(res.error);

    const t = (await prisma.bookingTransfer.findFirst({ where: { bookingId } }))!;
    const target = (await prisma.booking.findUnique({ where: { id: t.targetBookingId! } }))!;
    // 5 günden az kaldığı için ön ödeme/taksit yok: bakiye son tarihi
    // konmaz, fark hemen istenir.
    expect(target.balanceDueAt).toBeNull();
    expect(t.differenceStatus).toBe("BEKLIYOR");
  });

  it("kontenjanı dolu hedef tura devredilemez", async () => {
    const { transferPassenger } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"] });
    const p = await ilkYolcu(bookingId);
    const departureDate = new Date(Date.now() + 25 * 86400000);
    const tour = await prisma.tour.create({
      data: {
        slug: `dolu-${++n}-${Date.now()}`,
        title: "Dolu Tur",
        destination: "D",
        category: "YURT_ICI",
        bookingType: "KONTENJAN",
        departureDate,
        departureLocation: "T",
        price: 1000,
        coverImage: "",
        capacity: 1,
      },
    });
    const dep = await prisma.tourDeparture.create({
      data: { tourId: tour.id, departureDate, status: "AKTIF", capacity: 1 },
    });
    // Kontenjanı doldur.
    await prisma.booking.create({
      data: {
        tourId: tour.id, departureId: dep.id, status: "ODENDI",
        totalAmount: 1000, paidAmount: 1000, contactName: "Dolu",
        contactPhone: "5551112233", contactEmail: "d@example.com", quantity: 1,
      },
    });

    const res = await transferPassenger({
      bookingId,
      passengerId: p.id,
      to: yeniKisi(),
      targetTourId: tour.id,
      targetDepartureId: dep.id,
      actor: "ADMIN",
      actorEmail: "admin@example.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/kontenjan|yer/i);
  });
});

describe("settleTransferDifference", () => {
  it("borç ödenince fark kapanır", async () => {
    const { transferPassenger, settleTransferDifference } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({
      seatCodes: ["1A"],
      totalAmount: 1000,
    });
    const p = await ilkYolcu(bookingId);
    const departureDate = new Date(Date.now() + 25 * 86400000);
    const tour = await prisma.tour.create({
      data: {
        slug: `odeme-${++n}-${Date.now()}`, title: "Ödeme Turu", destination: "O",
        category: "YURT_ICI", bookingType: "KONTENJAN", departureDate,
        departureLocation: "T", price: 2000, coverImage: "", capacity: 20,
      },
    });
    const dep = await prisma.tourDeparture.create({
      data: { tourId: tour.id, departureDate, status: "AKTIF", capacity: 20 },
    });

    const res = await transferPassenger({
      bookingId, passengerId: p.id, to: yeniKisi(),
      targetTourId: tour.id, targetDepartureId: dep.id,
      actor: "ADMIN", actorEmail: "admin@example.com",
    });
    if (!res.ok) throw new Error(res.error);
    const t = (await prisma.bookingTransfer.findFirst({ where: { bookingId } }))!;

    const settled = await settleTransferDifference(t.id, { method: "NAKIT" });
    if (!settled.ok) throw new Error("settle basarisiz: " + settled.error);

    const after = (await prisma.bookingTransfer.findUnique({ where: { id: t.id } }))!;
    expect(after.differenceStatus).toBe("ODENDI");
    // Hedef rezervasyonun bakiyesi kapandı.
    const target = (await prisma.booking.findUnique({ where: { id: t.targetBookingId! } }))!;
    expect(target.paidAmount).toBe(target.totalAmount);
  });

  it("iade işaretlenince durum IADE_EDILDI olur", async () => {
    const { transferPassenger, settleTransferDifference } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({
      seatCodes: ["1A"],
      totalAmount: 1000,
    });
    const p = await ilkYolcu(bookingId);
    const departureDate = new Date(Date.now() + 25 * 86400000);
    const tour = await prisma.tour.create({
      data: {
        slug: `iade-${++n}-${Date.now()}`, title: "İade Turu", destination: "I",
        category: "YURT_ICI", bookingType: "KONTENJAN", departureDate,
        departureLocation: "T", price: 300, coverImage: "", capacity: 20,
      },
    });
    const dep = await prisma.tourDeparture.create({
      data: { tourId: tour.id, departureDate, status: "AKTIF", capacity: 20 },
    });

    const res = await transferPassenger({
      bookingId, passengerId: p.id, to: yeniKisi(),
      targetTourId: tour.id, targetDepartureId: dep.id,
      actor: "ADMIN", actorEmail: "admin@example.com",
    });
    if (!res.ok) throw new Error(res.error);
    const t = (await prisma.bookingTransfer.findFirst({ where: { bookingId } }))!;
    expect(t.differenceStatus).toBe("IADE_BEKLIYOR");

    const settled = await settleTransferDifference(t.id, { method: "NAKIT" });
    if (!settled.ok) throw new Error("settle basarisiz: " + settled.error);
    const after = (await prisma.bookingTransfer.findUnique({ where: { id: t.id } }))!;
    expect(after.differenceStatus).toBe("IADE_EDILDI");
  });

  it("farkı olmayan devir kapatılamaz", async () => {
    const { transferPassenger, settleTransferDifference } = await import("@/lib/transfer");
    const { bookingId } = await odenmisRezervasyon({ seatCodes: ["1A"] });
    const p = await ilkYolcu(bookingId);
    await transferPassenger({
      bookingId, passengerId: p.id, to: yeniKisi(),
      actor: "MUSTERI", actorEmail: "x@example.com",
    });
    const t = (await prisma.bookingTransfer.findFirst({ where: { bookingId } }))!;
    expect((await settleTransferDifference(t.id, { method: "NAKIT" })).ok).toBe(false);
  });
});

describe("canTransferBooking", () => {
  it("uygunluk sebebini döndürür", async () => {
    const { canTransferBooking } = await import("@/lib/transfer");
    const uygun = await odenmisRezervasyon();
    expect((await canTransferBooking(uygun.bookingId)).ok).toBe(true);

    const yakin = await odenmisRezervasyon({
      departureDate: new Date(Date.now() + 5 * 3600 * 1000),
    });
    const res = await canTransferBooking(yakin.bookingId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/24 saat/i);
  });
});
