import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createHash } from "node:crypto";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const img = (seed: string, w = 800, h = 500) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

function hash(pw: string) {
  return createHash("sha256").update(pw).digest("hex");
}

// --- Gerçekçi demo yolcu üretimi ---
const FIRST = [
  "Ahmet", "Mehmet", "Mustafa", "Ayşe", "Fatma", "Emine", "Ali", "Hüseyin",
  "Hasan", "Zeynep", "Elif", "Merve", "Ömer", "Yusuf", "İbrahim", "Hatice",
  "Can", "Deniz", "Selin", "Burak", "Cem", "Ece", "Kaan", "Nur", "Emir",
  "Aslı", "Berk", "Gizem", "Onur", "Pınar",
];
const LAST = [
  "Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk",
  "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara",
  "Koç", "Kurt", "Özkan", "Şimşek",
];

let ni = 0;
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
// Geçerli TC Kimlik No üret (resmi algoritmaya uygun)
function tc(): string {
  const d: number[] = [Math.floor(Math.random() * 9) + 1];
  for (let i = 1; i < 9; i++) d.push(Math.floor(Math.random() * 10));
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  d.push((((odd * 7 - even) % 10) + 10) % 10);
  d.push(d.reduce((a, b) => a + b, 0) % 10);
  return d.join("");
}
const GENDERS = ["E", "K"] as const;
function gender(): "E" | "K" {
  return GENDERS[Math.floor(Math.random() * 2)];
}
function phone(): string {
  return `0(5${Math.floor(10 + Math.random() * 89)}) ${Math.floor(
    100 + Math.random() * 899
  )} ${Math.floor(10 + Math.random() * 89)} ${Math.floor(10 + Math.random() * 89)}`;
}
function person() {
  return {
    firstName: pick(FIRST),
    lastName: pick(LAST),
    idNumber: tc(),
    gender: gender(),
  };
}

// Yan yana kuralına uygun demo için koltukları "birim"lere ayır:
// her birim = tek bir rezervasyonun aldığı bitişik koltuk(lar).
function seatUnits(layout: string, rows: number): string[][] {
  const units: string[][] = [];
  for (let r = 1; r <= rows; r++) {
    if (layout === "1+1") {
      units.push([`${r}A`], [`${r}B`]);
    } else if (layout === "2+1") {
      units.push([`${r}A`, `${r}B`], [`${r}C`]);
    } else {
      units.push([`${r}A`, `${r}B`], [`${r}C`, `${r}D`]);
    }
  }
  return units;
}

async function main() {
  await prisma.passenger.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.tour.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.adminUser.deleteMany();

  await prisma.adminUser.create({
    data: { email: "admin@gozdemburak.com", passwordHash: hash("admin123") },
  });

  // 5 afiş (4:5 Instagram formatı — 1080×1350)
  await prisma.banner.createMany({
    data: [
      { title: "Yaz Kampanyası", image: img("afis1", 1080, 1350), linkUrl: "/turlar", sortOrder: 1 },
      { title: "Vizesiz Balkan", image: img("afis2", 1080, 1350), linkUrl: "/turlar?kategori=YURT_DISI", sortOrder: 2 },
      { title: "Kapadokya Balon", image: img("afis3", 1080, 1350), linkUrl: "/turlar/kapadokya-turu", sortOrder: 3 },
      { title: "Karadeniz Yaylaları", image: img("afis4", 1080, 1350), linkUrl: "/turlar?kategori=YURT_ICI", sortOrder: 4 },
      { title: "Erken Rezervasyon", image: img("afis5", 1080, 1350), linkUrl: "/turlar", sortOrder: 5 },
    ],
  });

  // --- 3 TUR ---
  const tours = [
    {
      slug: "kapadokya-turu",
      title: "Kapadokya Turu",
      destination: "Nevşehir, Kapadokya",
      category: "YURT_ICI",
      bookingType: "KOLTUK",
      vehicleType: "VIP",
      seatLayout: "2+1",
      seatRows: 14,
      departureDate: new Date("2026-08-10T20:00:00"),
      returnDate: new Date("2026-08-12T22:00:00"),
      departureLocation: "İstanbul (Esenler Otogar)",
      durationDays: 3,
      price: 4500,
      currency: "TRY",
      coverImage: img("kapadokya", 800, 500),
      images: JSON.stringify([img("kapadokya", 800, 500), img("kapadokya2", 800, 500), img("kapadokya3", 800, 500)]),
      description: "Peri bacaları, yeraltı şehirleri ve eşsiz balon manzarası. Otobüslü ulaşım, 2 gece konaklama ve rehberlik dahil.",
      highlights: JSON.stringify(["Balon turu opsiyonu", "2 gece 4* otel", "Profesyonel rehber", "Açık büfe kahvaltı"]),
      bookingCount: 16,
    },
    {
      slug: "karadeniz-yaylalari",
      title: "Karadeniz Yaylaları Turu",
      destination: "Rize, Trabzon, Ayder",
      category: "YURT_ICI",
      bookingType: "KOLTUK",
      vehicleType: "OTOBUS",
      seatLayout: "2+2",
      seatRows: 13,
      departureDate: new Date("2026-08-15T19:00:00"),
      returnDate: new Date("2026-08-20T23:00:00"),
      departureLocation: "Ankara (AŞTİ)",
      durationDays: 6,
      price: 6900,
      currency: "TRY",
      coverImage: img("karadeniz", 800, 500),
      images: JSON.stringify([img("karadeniz", 800, 500), img("karadeniz2", 800, 500), img("karadeniz3", 800, 500)]),
      description: "Ayder Yaylası, Uzungöl, Sümela Manastırı ve Karadeniz'in yeşilinde unutulmaz bir tur.",
      highlights: JSON.stringify(["5 gece konaklama", "Tüm geziler dahil", "Yerel lezzet duraklarında mola"]),
      bookingCount: 18,
    },
    {
      slug: "balkan-turu",
      title: "Büyük Balkan Turu (7 Ülke)",
      destination: "Bulgaristan, Sırbistan, Bosna, Karadağ",
      category: "YURT_DISI",
      bookingType: "KONTENJAN",
      capacity: 60,
      departureDate: new Date("2026-09-05T06:00:00"),
      returnDate: new Date("2026-09-13T23:00:00"),
      departureLocation: "İstanbul Havalimanı",
      durationDays: 9,
      price: 899,
      currency: "EUR",
      coverImage: img("balkan", 800, 500),
      images: JSON.stringify([img("balkan", 800, 500), img("balkan2", 800, 500), img("balkan3", 800, 500)]),
      description: "Belgrad, Saraybosna, Mostar, Kotor ve daha fazlası. Vizesiz, uçaklı ulaşım, yarım pansiyon konaklama.",
      highlights: JSON.stringify(["Vizesiz", "8 gece yarım pansiyon", "Uçak bileti dahil", "Türkçe rehber"]),
      bookingCount: 17,
    },
  ];

  for (const t of tours) {
    const { bookingCount, seatLayout, seatRows, vehicleType, capacity, ...rest } = t;
    const tour = await prisma.tour.create({
      data: {
        ...rest,
        vehicleType: vehicleType ?? null,
        seatLayout: seatLayout ?? null,
        seatRows: seatRows ?? null,
        capacity: capacity ?? null,
        status: "YAYINDA",
      },
    });

    // Durak/otel (rota & konaklama)
    const placesBySlug: Record<string, { type: string; name: string; address: string; mapQuery: string; nights?: number }[]> = {
      "kapadokya-turu": [
        { type: "DURAK", name: "İstanbul (Esenler Otogar)", address: "Esenler, İstanbul", mapQuery: "Esenler Otogar, İstanbul" },
        { type: "DURAK", name: "Ürgüp", address: "Ürgüp, Nevşehir", mapQuery: "Ürgüp, Nevşehir" },
        { type: "OTEL", name: "Kapadokya Cave Otel", address: "Göreme, Nevşehir", mapQuery: "Göreme, Nevşehir", nights: 2 },
      ],
      "karadeniz-yaylalari": [
        { type: "DURAK", name: "Ankara (AŞTİ)", address: "Çankaya, Ankara", mapQuery: "AŞTİ, Ankara" },
        { type: "DURAK", name: "Uzungöl", address: "Çaykara, Trabzon", mapQuery: "Uzungöl, Trabzon" },
        { type: "DURAK", name: "Ayder Yaylası", address: "Çamlıhemşin, Rize", mapQuery: "Ayder Yaylası, Rize" },
        { type: "OTEL", name: "Ayder Resort Otel", address: "Ayder, Rize", mapQuery: "Ayder Yaylası, Rize", nights: 5 },
      ],
      "balkan-turu": [
        { type: "DURAK", name: "Belgrad", address: "Sırbistan", mapQuery: "Belgrad, Sırbistan" },
        { type: "DURAK", name: "Saraybosna", address: "Bosna-Hersek", mapQuery: "Saraybosna, Bosna Hersek" },
        { type: "DURAK", name: "Mostar", address: "Bosna-Hersek", mapQuery: "Mostar, Bosna Hersek" },
        { type: "DURAK", name: "Kotor", address: "Karadağ", mapQuery: "Kotor, Karadağ" },
        { type: "OTEL", name: "Belgrad City Otel", address: "Belgrad, Sırbistan", mapQuery: "Belgrad, Sırbistan", nights: 8 },
      ],
    };
    const places = placesBySlug[t.slug] ?? [];
    if (places.length) {
      await prisma.tourPlace.createMany({
        data: places.map((p, i) => ({
          tourId: tour.id,
          type: p.type,
          name: p.name,
          address: p.address,
          mapQuery: p.mapQuery,
          nights: p.nights ?? null,
          sortOrder: i,
        })),
      });
    }

    if (t.bookingType === "KOLTUK" && seatRows && seatLayout) {
      const units = seatUnits(seatLayout, seatRows);
      const allCodes = units.flat();
      // Tüm koltukları BOŞ oluştur
      await prisma.seat.createMany({
        data: allCodes.map((code) => ({ tourId: tour.id, code, status: "BOS" })),
      });

      // Satışlar — her birim (bitişik koltuklar) bir rezervasyon
      for (let bk = 0; bk < bookingCount && bk < units.length; bk++) {
        const seats = units[bk];
        const people = seats.map(() => person());
        const contact = people[0];
        await prisma.booking.create({
          data: {
            tourId: tour.id,
            status: "ODENDI",
            totalAmount: tour.price * seats.length,
            contactName: `${contact.firstName} ${contact.lastName}`,
            contactPhone: phone(),
            contactEmail: `${contact.firstName.toLowerCase()}.${contact.lastName.toLowerCase()}${++ni}@example.com`,
            quantity: seats.length,
            paymentRef: `SIM-${Date.now()}-${bk}`,
            passengers: {
              create: people.map((p, i) => ({
                firstName: p.firstName,
                lastName: p.lastName,
                idNumber: p.idNumber,
                seatCode: seats[i],
                gender: p.gender,
              })),
            },
          },
        });
        // Her koltuğa kendi cinsiyetini yaz
        for (let i = 0; i < seats.length; i++) {
          await prisma.seat.updateMany({
            where: { tourId: tour.id, code: seats[i] },
            data: { status: "SATILDI", gender: people[i].gender },
          });
        }
      }
    } else if (t.bookingType === "KONTENJAN") {
      for (let bk = 0; bk < bookingCount; bk++) {
        const groupSize = [1, 2, 2, 3][Math.floor(Math.random() * 4)];
        const people = Array.from({ length: groupSize }, () => person());
        const contact = people[0];
        await prisma.booking.create({
          data: {
            tourId: tour.id,
            status: "ODENDI",
            totalAmount: tour.price * groupSize,
            contactName: `${contact.firstName} ${contact.lastName}`,
            contactPhone: phone(),
            contactEmail: `${contact.firstName.toLowerCase()}.${contact.lastName.toLowerCase()}${++ni}@example.com`,
            quantity: groupSize,
            paymentRef: `SIM-${Date.now()}-${bk}`,
            passengers: {
              create: people.map((p) => ({
                firstName: p.firstName,
                lastName: p.lastName,
                idNumber: p.idNumber,
                gender: p.gender,
              })),
            },
          },
        });
      }
    }

    const count = await prisma.booking.count({ where: { tourId: tour.id } });
    console.log(`  ${tour.title}: ${count} rezervasyon`);
  }

  console.log("Seed tamamlandı ✅  (admin@gozdemburak.com / admin123)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
