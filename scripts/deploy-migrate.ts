// Canlı veritabanını güncel şemaya taşır (SQLite).
//
// Neden bu script: prisma/migrations klasörü bir noktadan sonra veritabanıyla
// senkron değil (şema değişiklikleri `db push` ile yapıldı), bu yüzden
// `prisma migrate deploy` kullanılamıyor. Bu script eksik yapıları TESPİT EDİP
// ekler ve veriyi taşır; tekrar tekrar çalıştırılabilir (idempotent).
//
// Kullanım (proje kökünde) — hedef veritabanı AÇIKÇA verilmelidir:
//   DATABASE_URL="file:/var/www/gbt/data/prod.db" npx tsx scripts/deploy-migrate.ts
//
// Yaptıkları:
//   1. Bus, TourDeparture ve Payment tablolarını oluşturur (yoksa)
//   2. Tour/TourPlace/Booking/Passenger/Seat tablolarına eksik kolonları ekler
//   3. Her tur için bir sefer (TourDeparture) açıp koltukları ve rezervasyonları
//      ona bağlar — tek seferli turlar davranışını korur
//   4. TourPlace.type: DURAK → GEZI
//   5. Tour.placesToVisit serbest metnini GEZI kayıtlarına taşır
//
// Not: placesToVisit kolonu SİLİNMEZ (veri güvenliği). Prisma okumadığı için
// zararsızdır; istenirse sonradan elle düşürülebilir.
import { existsSync, statSync } from "node:fs";
import { prisma } from "../lib/db";
import { repairSeatIndexes, repairSeatlessDepartures } from "../lib/seat-index-repair";

type ColumnInfo = { name: string };

// Yanlış veritabanına yazmaya karşı koruma.
// lib/db.ts, DATABASE_URL tanımsızsa sessizce "file:./dev.db"e düşer; bu script
// canlıda çalıştığı için böyle bir düşüş YENİ BOŞ bir dosya oluşturup "başarıyla
// tamamlandı" demesine yol açardı. O yüzden hedef açıkça verilmeli ve var olmalı.
async function assertTargetDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'HATA: DATABASE_URL verilmedi.\n' +
        'Hedef veritabanını açıkça belirtin, örn.:\n' +
        '  DATABASE_URL="file:/var/www/gbt/data/prod.db" npx tsx scripts/deploy-migrate.ts'
    );
    process.exit(1);
  }

  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    if (!existsSync(path)) {
      console.error(
        `HATA: Veritabanı dosyası bulunamadı: ${path}\n` +
          "Yolu kontrol edin (.env içindeki DATABASE_URL ile aynı olmalı).\n" +
          "Script yeni bir veritabanı OLUŞTURMAZ — yanlış dosyaya yazmamak için durdu."
      );
      process.exit(1);
    }
    const size = statSync(path).size;
    console.log(`Hedef veritabanı: ${path} (${(size / 1024).toFixed(0)} KB)`);
  } else {
    console.log(`Hedef veritabanı: ${url}`);
  }

  // Doğru veritabanı mı? Tur tablosu ve kayıt sayısı teyit için yazdırılır.
  if (!(await tableExists("Tour"))) {
    console.error(
      "HATA: Bu veritabanında Tour tablosu yok — muhtemelen yanlış dosya. Durdu."
    );
    process.exit(1);
  }
  const [tours, bookings] = await Promise.all([
    prisma.tour.count(),
    prisma.booking.count(),
  ]);
  console.log(`Mevcut veri: ${tours} tur, ${bookings} rezervasyon\n`);
  if (tours === 0) {
    console.error(
      "HATA: Veritabanında hiç tur yok — boş/yanlış veritabanı olabilir. Durdu.\n" +
        "Gerçekten boş bir kuruluma uyguluyorsanız bu kontrolü geçmek için " +
        "önce bir tur ekleyin veya script'i elle düzenleyin."
    );
    process.exit(1);
  }
}

async function columns(table: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<ColumnInfo[]>(
    `PRAGMA table_info("${table}")`
  );
  return new Set(rows.map((r) => r.name));
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    table
  );
  return rows.length > 0;
}

// Kolonu yalnızca yoksa ekler.
async function addColumn(table: string, column: string, ddl: string) {
  const existing = await columns(table);
  if (existing.has(column)) return false;
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
  console.log(`  + ${table}.${column}`);
  return true;
}

async function main() {
  await assertTargetDatabase();

  console.log("== 1. Tablolar ==");

  if (!(await tableExists("Bus"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Bus" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "plate" TEXT NOT NULL,
        "vehicleType" TEXT NOT NULL,
        "seatLayout" TEXT NOT NULL,
        "seatRows" INTEGER NOT NULL,
        "doorAfterRow" INTEGER,
        "backRowFull" BOOLEAN NOT NULL DEFAULT false,
        "notes" TEXT NOT NULL DEFAULT '',
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    console.log("  + Bus tablosu");
  } else {
    console.log("  = Bus tablosu zaten var");
  }

  if (!(await tableExists("TourDeparture"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "TourDeparture" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tourId" TEXT NOT NULL,
        "departureDate" DATETIME NOT NULL,
        "returnDate" DATETIME,
        "capacity" INTEGER,
        "busId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'AKTIF',
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TourDeparture_tourId_fkey" FOREIGN KEY ("tourId")
          REFERENCES "Tour" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "TourDeparture_busId_fkey" FOREIGN KEY ("busId")
          REFERENCES "Bus" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX "TourDeparture_tourId_departureDate_idx" ON "TourDeparture"("tourId", "departureDate")`
    );
    console.log("  + TourDeparture tablosu");
  } else {
    console.log("  = TourDeparture tablosu zaten var");
  }

  // iyzico ödeme kayıt tablosu.
  if (!(await tableExists("Payment"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Payment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "bookingId" TEXT NOT NULL,
        "provider" TEXT NOT NULL DEFAULT 'IYZICO',
        "token" TEXT,
        "paymentId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'BASLATILDI',
        "amount" INTEGER NOT NULL,
        "paidAmount" INTEGER,
        "currency" TEXT NOT NULL DEFAULT 'TRY',
        "installment" INTEGER,
        "cardFamily" TEXT,
        "cardLastFour" TEXT,
        "fraudStatus" INTEGER,
        "errorCode" TEXT,
        "errorMessage" TEXT,
        "refundedAt" DATETIME,
        "refundRef" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId")
          REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "Payment_token_key" ON "Payment"("token")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId")`
    );
    console.log("  + Payment tablosu");
  } else {
    console.log("  = Payment tablosu zaten var");
  }

  console.log("== 2. Kolonlar ==");
  let added = 0;
  const add = async (t: string, c: string, ddl: string) => {
    if (await addColumn(t, c, ddl)) added++;
  };

  // Tour
  await add("Tour", "documents", `"documents" TEXT NOT NULL DEFAULT '[]'`);
  await add("Tour", "busId", `"busId" TEXT`);
  await add("Tour", "hasAccommodation", `"hasAccommodation" BOOLEAN NOT NULL DEFAULT false`);
  await add("Tour", "singleSupplement", `"singleSupplement" INTEGER NOT NULL DEFAULT 2000`);
  await add("Tour", "doorAfterRow", `"doorAfterRow" INTEGER`);
  await add("Tour", "backRowFull", `"backRowFull" BOOLEAN NOT NULL DEFAULT false`);

  // Bus
  await add("Bus", "seatMap", `"seatMap" TEXT`);

  // TourPlace
  await add("TourPlace", "boardingTime", `"boardingTime" TEXT`);
  await add("TourPlace", "showOnMap", `"showOnMap" BOOLEAN NOT NULL DEFAULT true`);
  await add("TourPlace", "price", `"price" INTEGER`);

  // Seat
  await add("Seat", "departureId", `"departureId" TEXT`);

  // Booking
  await add("Booking", "departureId", `"departureId" TEXT`);
  await add("Booking", "boardingName", `"boardingName" TEXT`);
  await add("Booking", "boardingPlaceId", `"boardingPlaceId" TEXT`);
  await add("Booking", "rooms", `"rooms" TEXT`);
  await add("Booking", "accommodationType", `"accommodationType" TEXT`);
  await add("Booking", "paymentMethod", `"paymentMethod" TEXT NOT NULL DEFAULT 'ONLINE'`);

  // Passenger
  await add("Passenger", "birthDate", `"birthDate" DATETIME`);
  await add("Passenger", "nationality", `"nationality" TEXT`);
  await add("Passenger", "country", `"country" TEXT`);
  await add("Passenger", "ageBand", `"ageBand" TEXT`);
  await add("Passenger", "roomIndex", `"roomIndex" INTEGER`);
  await add("Passenger", "idDocument", `"idDocument" TEXT`);
  await add("Passenger", "ageVerified", `"ageVerified" BOOLEAN NOT NULL DEFAULT false`);

  if (added === 0) console.log("  = eksik kolon yok");

  console.log("== 3. Seferler (TourDeparture) ==");
  const tours = await prisma.tour.findMany({
    include: { departures: true },
    orderBy: { createdAt: "asc" },
  });
  let created = 0;
  let seatsLinked = 0;
  let bookingsLinked = 0;
  const duplicates: string[] = [];
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
    // Koltukları sefere bağla. Aynı kod birden çok kez varsa (bozuk veri)
    // yalnızca ilki bağlanır; kalanlar raporlanır ki elle incelenebilsin.
    const loose = await prisma.seat.findMany({
      where: { tourId: t.id, departureId: null },
      select: { id: true, code: true },
      orderBy: { id: "asc" },
    });
    const seen = new Set<string>();
    for (const seat of loose) {
      if (seen.has(seat.code)) {
        duplicates.push(`${t.title}/${seat.code}`);
        continue;
      }
      seen.add(seat.code);
      await prisma.seat.update({
        where: { id: seat.id },
        data: { departureId: departure.id },
      });
      seatsLinked++;
    }
    bookingsLinked += (
      await prisma.booking.updateMany({
        where: { tourId: t.id, departureId: null },
        data: { departureId: departure.id },
      })
    ).count;
  }
  console.log(
    `  tur: ${tours.length} · yeni sefer: ${created} · bağlanan koltuk: ${seatsLinked} · bağlanan rezervasyon: ${bookingsLinked}`
  );
  if (duplicates.length > 0) {
    console.log(
      `  ! ${duplicates.length} koltuk aynı koda sahip olduğu için bağlanmadı: ${duplicates
        .slice(0, 10)
        .join(", ")}${duplicates.length > 10 ? " …" : ""}`
    );
  }

  console.log("== 4. Yer tipleri (DURAK → GEZI) ==");
  const renamed = await prisma.tourPlace.updateMany({
    where: { type: "DURAK" },
    data: { type: "GEZI" },
  });
  console.log(`  çevrilen: ${renamed.count}`);

  console.log("== 5. Gezilecek Yerler (serbest metin → kayıt) ==");
  let movedRows = 0;
  const tourCols = await columns("Tour");
  if (!tourCols.has("placesToVisit")) {
    console.log("  = placesToVisit kolonu yok, taşınacak metin bulunmuyor");
  } else {
    const withText = await prisma.$queryRawUnsafe<
      { id: string; title: string; placesToVisit: string }[]
    >(`SELECT id, title, placesToVisit FROM Tour WHERE placesToVisit <> ''`);
    for (const t of withText) {
      const lines = t.placesToVisit
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) continue;
      const existing = await prisma.tourPlace.findMany({
        where: { tourId: t.id },
        select: { name: true, sortOrder: true, type: true },
      });
      const have = new Set(
        existing
          .filter((p) => p.type === "GEZI")
          .map((p) => p.name.toLocaleLowerCase("tr"))
      );
      let order = existing.reduce((m, p) => Math.max(m, p.sortOrder), -1) + 1;
      for (const line of lines) {
        if (have.has(line.toLocaleLowerCase("tr"))) continue;
        await prisma.tourPlace.create({
          data: { tourId: t.id, type: "GEZI", name: line, sortOrder: order++ },
        });
        movedRows++;
      }
      // Tekrar çalıştırmada kopya oluşmasın diye metni temizle.
      await prisma.$executeRawUnsafe(
        `UPDATE Tour SET placesToVisit = '' WHERE id = ?`,
        t.id
      );
      console.log(`  ${t.title}: ${lines.length} satır taşındı`);
    }
    if (movedRows === 0) console.log("  = taşınacak metin yok");
  }

  // Koltuk benzersizliği artık (departureId, code) üzerinde. Veriler sefere
  // BAĞLANDIKTAN SONRA onarılır — önce yapılırsa bağlama sırasında çakışır.
  //
  // ÖNEMLİ: eski (tourId, code) indeksi düşürülmezse bir tur aynı koltuk kodunu
  // yalnız bir kez tutabilir ve ikinci sefer eklenince tur kaydı 500 döner.
  console.log("== 6. İndeksler ==");
  const indexResult = await repairSeatIndexes(prisma);
  for (const name of indexResult.dropped) {
    console.log(`  - eski benzersiz indeks düşürüldü: ${name}`);
  }
  if (indexResult.created) {
    console.log("  + Seat(departureId, code) benzersiz indeks");
  } else {
    console.log("  = Seat(departureId, code) indeksi zaten var");
  }
  if (indexResult.dropped.length === 0 && !indexResult.created) {
    console.log("  = indeksler zaten doğru");
  }

  console.log("== 7. Koltuksuz seferler ==");
  const seatless = await repairSeatlessDepartures(prisma);
  const failedCount = seatless.failed.length;
  const skippedCount = seatless.skipped.length;
  if (
    seatless.repaired.length === 0 &&
    seatless.failed.length === 0 &&
    seatless.skipped.length === 0
  ) {
    // Bu satır YALNIZCA üç kova da boşken yazılır — aksi halde atlanan veya
    // başarısız bir sefer varken görevliye yanlışlıkla "sorun yok" denir.
    console.log("  = koltuksuz sefer yok");
  } else {
    for (const r of seatless.repaired) {
      console.log(`  + ${r.departureId}: ${r.seats} koltuk üretildi`);
    }
  }
  if (seatless.skipped.length > 0) {
    for (const r of seatless.skipped) {
      console.log(`  ! ${r.departureId}: atlandı — ${r.reason}`);
    }
    console.log(`  ! ${seatless.skipped.length} sefer düzeni çözülemediği için atlandı — elle incelenmeli`);
  }
  if (seatless.failed.length > 0) {
    for (const r of seatless.failed) {
      console.log(`  ! ${r.departureId}: koltuk üretilemedi — ${r.error}`);
    }
    console.log(`  ! ${seatless.failed.length} sefer onarılamadı — elle incelenmeli`);
  }

  console.log("== Özet ==");
  const counts = await prisma.tourPlace.groupBy({ by: ["type"], _count: true });
  console.log("  yer tipleri:", JSON.stringify(counts));
  console.log("  sefer sayısı:", await prisma.tourDeparture.count());
  console.log("  otobüs sayısı:", await prisma.bus.count());
  console.log(
    "  seferi olmayan koltuk:",
    await prisma.seat.count({ where: { departureId: null } })
  );
  console.log(
    "  seferi olmayan rezervasyon:",
    await prisma.booking.count({ where: { departureId: null } })
  );
  if (failedCount === 0 && skippedCount === 0) {
    console.log("\nTamamlandı ✅");
  } else {
    const parts: string[] = [];
    if (failedCount > 0) parts.push(`${failedCount} sefer onarılamadı`);
    if (skippedCount > 0) parts.push(`${skippedCount} sefer düzeni çözülemediği için atlandı`);
    console.log(
      `\nTamamlandı — UYARI: ${parts.join(", ")} ⚠️\n` +
        "  Sorunlu seferler yukarıdaki '!' ile işaretlenen satırlarda listelenmiştir.\n" +
        "  koltuklar henüz o seferlere yazılmadığı için script tekrar çalıştırılabilir."
    );
  }
}

main()
  .catch((e) => {
    console.error("HATA:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
