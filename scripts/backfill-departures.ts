// Mevcut turları tek seferli hale getirir: her tur için turun kendi
// kalkış/dönüş tarihinden bir TourDeparture üretir, o turun koltuklarını ve
// rezervasyonlarını bu sefere bağlar. Birden çok kez çalıştırılabilir (idempotent).
import { prisma } from "../lib/db";

async function main() {
  const tours = await prisma.tour.findMany({
    include: { departures: true },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let seatsLinked = 0;
  let bookingsLinked = 0;

  for (const t of tours) {
    let departure = t.departures[0];
    if (!departure) {
      departure = await prisma.tourDeparture.create({
        data: {
          tourId: t.id,
          departureDate: t.departureDate,
          returnDate: t.returnDate,
          capacity: t.bookingType === "KONTENJAN" ? t.capacity : null,
          status: "AKTIF",
          sortOrder: 0,
        },
      });
      created++;
    }

    const s = await prisma.seat.updateMany({
      where: { tourId: t.id, departureId: null },
      data: { departureId: departure.id },
    });
    seatsLinked += s.count;

    const b = await prisma.booking.updateMany({
      where: { tourId: t.id, departureId: null },
      data: { departureId: departure.id },
    });
    bookingsLinked += b.count;
  }

  console.log(
    `Tur: ${tours.length} · yeni sefer: ${created} · bağlanan koltuk: ${seatsLinked} · bağlanan rezervasyon: ${bookingsLinked}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
