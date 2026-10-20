// Veritabanı gerektiren testler için ortak yardımcılar.
//
// vitest.setup.ts süreç başına geçici bir kopya hazırlayıp DATABASE_URL'i ona
// çevirdi. Burada AYNI dosyaya bağlanıyoruz — ayrı bir dosya açsaydık test ile
// test edilen modül (lib/booking.ts, lib/loyalty.ts) iki farklı veritabanı
// görür ve testler sessizce anlamsızlaşırdı.
import type { PrismaClient } from "@/lib/generated/prisma/client";

let client: PrismaClient | null = null;

export async function getTestPrisma(): Promise<PrismaClient> {
  if (client) return client;

  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) {
    throw new Error(
      `Test veritabanı hazır değil — vitest.setup.ts çalıştı mı? DATABASE_URL: ${url}`
    );
  }

  const { PrismaClient } = await import("@/lib/generated/prisma/client");
  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
  client = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
  }) as PrismaClient;
  return client;
}

let counter = 0;

// Koltuklu bir tur + sefer + rezervasyon üretir. Her çağrı kendi kayıtlarını
// oluşturur; kopyadaki tohum verisine güvenilmez ve testler birbirini etkilemez.
export async function createTestBooking(
  prisma: PrismaClient,
  opts?: {
    status?: string;
    seatCodes?: string[];
    userId?: string | null;
    totalAmount?: number;
    idNumbers?: string[]; // yolcu kimlik numaraları (fatura testleri için)
    paymentMethod?: string;
    currency?: string;
    departureDate?: Date;
  }
): Promise<{ tourId: string; departureId: string; bookingId: string }> {
  const n = ++counter;
  const seatCodes = opts?.seatCodes ?? ["1A", "1B"];
  const status = opts?.status ?? "ODENDI";
  const seatStatus = status === "ODENDI" ? "SATILDI" : "KILITLI";

  const departureDate = opts?.departureDate ?? new Date(Date.now() + 7 * 86400000);
  const tour = await prisma.tour.create({
    data: {
      slug: `test-tur-${n}-${Date.now()}`,
      title: `Test Turu ${n}`,
      destination: "Test",
      category: "YURT_ICI",
      bookingType: "KOLTUK",
      departureDate,
      departureLocation: "Test Kalkış",
      price: 1000,
      currency: opts?.currency ?? "TRY",
      coverImage: "",
      vehicleType: "MINIBUS",
      seatLayout: "1+1",
      seatRows: 3,
    },
  });

  const departure = await prisma.tourDeparture.create({
    data: { tourId: tour.id, departureDate: tour.departureDate, status: "AKTIF" },
  });

  await prisma.seat.createMany({
    data: ["1A", "1B", "2A", "2B", "3A", "3B"].map((code) => ({
      tourId: tour.id,
      departureId: departure.id,
      code,
      status: seatCodes.includes(code) ? seatStatus : "BOS",
      gender: seatCodes.includes(code) ? "E" : null,
    })),
  });

  const booking = await prisma.booking.create({
    data: {
      tourId: tour.id,
      departureId: departure.id,
      status,
      totalAmount: opts?.totalAmount ?? 2000,
      contactName: "Test Müşteri",
      contactPhone: "5551112233",
      contactEmail: `test${n}@example.com`,
      quantity: seatCodes.length,
      userId: opts?.userId ?? null,
      paymentMethod: opts?.paymentMethod ?? "ONLINE",
      passengers: {
        create: seatCodes.map((code, i) => ({
          firstName: "Yolcu",
          lastName: `${i + 1}`,
          seatCode: code,
          gender: "E",
          idNumber: opts?.idNumbers?.[i] ?? null,
          nationality: "TC",
        })),
      },
    },
  });

  return { tourId: tour.id, departureId: departure.id, bookingId: booking.id };
}
