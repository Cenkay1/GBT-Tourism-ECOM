import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

// Kalkışa göre istenen yaşta doğmuş bir yolcu üretir.
function bornForAge(age: number, departure: Date): string {
  const d = new Date(departure);
  d.setFullYear(d.getFullYear() - age);
  // Kalkıştan 1 gün önce doğum günü olsun: yaş kesin.
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function konaklamaliTur() {
  const departureDate = new Date(Date.now() + 30 * 86400000);
  const tour = await prisma.tour.create({
    data: {
      slug: `elden-dogum-${Date.now()}`,
      title: "Elden Satış Yaş Testi",
      destination: "Test",
      category: "YURT_ICI",
      bookingType: "KONTENJAN",
      departureDate,
      departureLocation: "Test",
      price: 10000,
      coverImage: "",
      capacity: 40,
      hasAccommodation: true,
    },
  });
  const dep = await prisma.tourDeparture.create({
    data: { tourId: tour.id, departureDate, status: "AKTIF", capacity: 40 },
  });
  return { tour, dep, departureDate };
}

describe("elden satışta doğum tarihi", () => {
  it("doğum tarihi yolcuya kaydedilir ve yaş bandı hesaplanır", async () => {
    const { createManualPaidBooking } = await import("@/lib/booking");
    const { tour, dep, departureDate } = await konaklamaliTur();

    const res = await createManualPaidBooking({
      tourId: tour.id,
      departureId: dep.id,
      contactName: "Elden Müşteri",
      contactPhone: "5551112233",
      contactEmail: "elden@example.com",
      quantity: 3,
      passengers: [
        { firstName: "Baba", lastName: "Yılmaz", gender: "E", idNumber: "11111111110" },
        { firstName: "Anne", lastName: "Yılmaz", gender: "K", idNumber: "12345678950" },
        {
          firstName: "Çocuk",
          lastName: "Yılmaz",
          gender: "E",
          idNumber: "22345678928",
          birthDate: bornForAge(2, departureDate),
        },
      ],
    });
    if (!res.ok) throw new Error(`satis basarisiz: ${res.error}`);

    const passengers = await prisma.passenger.findMany({
      where: { bookingId: res.bookingId },
      orderBy: { firstName: "asc" },
    });
    const kid = passengers.find((p) => p.firstName === "Çocuk")!;
    // Doğum tarihi gerçekten kaydedilmiş olmalı.
    expect(kid.birthDate).not.toBeNull();
    // 2 yaş → INFANT (0-3 ücretsiz).
    expect(kid.ageBand).toBe("INFANT");
  });

  it("görevli yaşı ONAYLAMAZSA indirim uygulanmaz (tam ücret)", async () => {
    const { createManualPaidBooking } = await import("@/lib/booking");
    const { tour, dep, departureDate } = await konaklamaliTur();

    const res = await createManualPaidBooking({
      tourId: tour.id,
      departureId: dep.id,
      contactName: "Elden Müşteri",
      contactPhone: "5551112233",
      contactEmail: "elden2@example.com",
      quantity: 3,
      passengers: [
        { firstName: "Baba", lastName: "A", gender: "E", idNumber: "11111111110" },
        { firstName: "Anne", lastName: "A", gender: "K", idNumber: "12345678950" },
        {
          firstName: "Bebek",
          lastName: "A",
          gender: "E",
          idNumber: "22345678928",
          birthDate: bornForAge(1, departureDate),
        },
      ],
    });
    if (!res.ok) throw new Error(`satis basarisiz: ${res.error}`);

    const booking = (await prisma.booking.findUnique({ where: { id: res.bookingId } }))!;
    // Yaş indirimi BELGE doğrulaması istiyor (lib/shared.ts). Görevli
    // onaylamadıysa bebek de tam ücrete yazılır — uydurma doğum tarihiyle
    // indirim alınamaz.
    expect(booking.totalAmount).toBe(3 * 10000);
  });

  it("görevli yaşı onaylarsa 0-3 yaş ÜCRETSİZ olur", async () => {
    const { createManualPaidBooking } = await import("@/lib/booking");
    const { tour, dep, departureDate } = await konaklamaliTur();

    const res = await createManualPaidBooking({
      tourId: tour.id,
      departureId: dep.id,
      contactName: "Elden Müşteri",
      contactPhone: "5551112233",
      contactEmail: "elden4@example.com",
      quantity: 3,
      passengers: [
        { firstName: "Baba", lastName: "C", gender: "E", idNumber: "11111111110" },
        { firstName: "Anne", lastName: "C", gender: "K", idNumber: "12345678950" },
        {
          firstName: "Bebek",
          lastName: "C",
          gender: "E",
          idNumber: "22345678928",
          birthDate: bornForAge(1, departureDate),
          ageDocumentVerified: true,
        },
      ],
    });
    if (!res.ok) throw new Error(`satis basarisiz: ${res.error}`);

    const booking = (await prisma.booking.findUnique({ where: { id: res.bookingId } }))!;
    // 0-3 yaş ücretsiz: 3 kişi ama 2 yetişkin ücreti.
    expect(booking.totalAmount).toBe(2 * 10000);

    // Görevli onayı yaş doğrulamasına da yazılır: panelde tekrar sorulmaz.
    const bebek = (await prisma.passenger.findFirst({
      where: { bookingId: res.bookingId, firstName: "Bebek" },
    }))!;
    expect(bebek.ageVerified).toBe(true);
  });

  it("doğum tarihi verilmezse yolcu YETİŞKİN sayılır (tam ücret)", async () => {
    const { createManualPaidBooking } = await import("@/lib/booking");
    const { tour, dep } = await konaklamaliTur();

    const res = await createManualPaidBooking({
      tourId: tour.id,
      departureId: dep.id,
      contactName: "Elden Müşteri",
      contactPhone: "5551112233",
      contactEmail: "elden3@example.com",
      quantity: 2,
      passengers: [
        { firstName: "Bir", lastName: "B", gender: "E", idNumber: "11111111110" },
        { firstName: "İki", lastName: "B", gender: "K", idNumber: "12345678950" },
      ],
    });
    if (!res.ok) throw new Error(`satis basarisiz: ${res.error}`);
    const booking = (await prisma.booking.findUnique({ where: { id: res.bookingId } }))!;
    expect(booking.totalAmount).toBe(2 * 10000);
  });
});
