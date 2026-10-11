// Üretim veritabanındaki koltuk indeksi onarımı.
//
// Neden gerekli: ilk migration (20260718084727_init) Seat üzerinde
// UNIQUE(tourId, code) indeksi yarattı. Şema sonradan UNIQUE(departureId, code)
// olarak değişti ama canlı veritabanı `prisma migrate` ile değil bu script ile
// güncelleniyor ve eski indeks hiç düşürülmedi. Eski indeks yerinde kaldığı
// sürece bir tur "1A" kodlu koltuğu yalnız bir kez tutabilir — ikinci sefer
// eklendiği an koltuk üretimi UNIQUE ihlaliyle patlar ve tur kaydı 500 döner.
//
// Prisma modellerine bağımlı değil: yalnız raw SQL çalıştıran bir istemci
// arayüzü alır. Böylece hem gerçek PrismaClient ile hem testte better-sqlite3
// sarmalayıcısıyla çalışır.

import { randomUUID } from "node:crypto";
import { VEHICLES, seatCodes, type VehicleType } from "@/lib/shared";

// PrismaClient'ın bu modülün kullandığı alt kümesi.
export interface RawSqlClient {
  $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
}

interface IndexRow {
  name: string;
  sql: string | null;
}

const NEW_INDEX = "Seat_departureId_code_key";

// "CREATE UNIQUE INDEX "x" ON "Seat"("tourId", "code")" → ["tourid", "code"]
// Tırnak ve boşluklar temizlenir, karşılaştırma küçük harfle yapılır.
// VARSAYIM: yalnız sade kolon listeli indeksler. Kısmi indeks (WHERE),
// ifade indeksi veya COLLATE/DESC içeren indeks bu ayrıştırıcıyla
// eşleşmez — böyle bir durumda fonksiyon "hedef değil" der ve indekse
// DOKUNMAZ (güvenli tarafta kalır). Şemaya böyle bir indeks eklenirse
// burası gözden geçirilmeli.
function indexColumns(sql: string): string[] {
  const open = sql.lastIndexOf("(");
  const close = sql.lastIndexOf(")");
  if (open === -1 || close === -1 || close < open) return [];
  return sql
    .slice(open + 1, close)
    .split(",")
    .map((c) => c.trim().replace(/^["`[]|["`\]]$/g, "").toLowerCase())
    .filter(Boolean);
}

function isUnique(sql: string): boolean {
  return /create\s+unique\s+index/i.test(sql);
}

function sameColumns(cols: string[], wanted: string[]): boolean {
  if (cols.length !== wanted.length) return false;
  const a = [...cols].sort();
  const b = [...wanted].sort();
  return a.every((v, i) => v === b[i]);
}

export interface SeatIndexRepairResult {
  dropped: string[];
  created: boolean;
}

// Seat tablosundaki eski (tourId, code) benzersiz indeksini düşürür ve
// (departureId, code) indeksini garanti eder. Tekrar çalıştırılabilir.
export async function repairSeatIndexes(
  db: RawSqlClient
): Promise<SeatIndexRepairResult> {
  const rows = await db.$queryRawUnsafe<IndexRow[]>(
    `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='Seat'`
  );

  // İsme değil, indeksin gerçek kolon listesine bakıyoruz: aynı indeks farklı
  // adla da yaratılmış olabilir.
  //
  // Önce yeni indeksi garanti et, SONRA eskiyi düşür: yeni indeks yaratma
  // yinelenen (departureId, code) satırları yüzünden patlarsa (örn. kirli
  // veri), tablo hiçbir koltuk benzersizlik kısıtı olmadan kalmasın. Böylece
  // kötü senaryo "hata henüz düzelmedi" olur, "bütünlük kısıtı gitti" olmaz.
  const hasNew = rows.some(
    (r) => r.sql && isUnique(r.sql) && sameColumns(indexColumns(r.sql), ["departureid", "code"])
  );
  let created = false;
  if (!hasNew) {
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "${NEW_INDEX}" ON "Seat"("departureId", "code")`
    );
    created = true;
  }

  const dropped: string[] = [];
  for (const row of rows) {
    if (!row.sql) continue; // otomatik indeks (PRIMARY KEY) — düşürülemez
    if (!isUnique(row.sql)) continue;
    if (!sameColumns(indexColumns(row.sql), ["tourid", "code"])) continue;
    await db.$executeRawUnsafe(`DROP INDEX "${row.name}"`);
    dropped.push(row.name);
  }

  return { dropped, created };
}

interface SeatlessRow {
  departureId: string;
  tourId: string;
  depBusId: string | null;
  tourBusId: string | null;
  vehicleType: string | null;
  seatRows: number | null;
  backRowFull: number | null; // SQLite boolean 0/1 döndürür
}

interface BusRow {
  vehicleType: string;
  seatRows: number;
  backRowFull: number;
}

interface ResolvedLayout {
  vehicleType: VehicleType;
  seatRows: number;
  backRowFull: boolean;
}

// Seferin etkin koltuk düzeni. Öncelik lib/admin-actions.ts içindeki
// resolveSeatLayout ile AYNI: seferin otobüsü > turun otobüsü > turdaki elle
// girilmiş alanlar. İkisi ayrışırsa onarım yanlış düzen üretir.
async function resolveLayout(
  db: RawSqlClient,
  row: SeatlessRow
): Promise<ResolvedLayout | null> {
  const busId = row.depBusId ?? row.tourBusId;
  if (busId) {
    const buses = await db.$queryRawUnsafe<BusRow[]>(
      `SELECT "vehicleType", "seatRows", "backRowFull" FROM "Bus" WHERE id = ?`,
      busId
    );
    const bus = buses[0];
    if (bus && VEHICLES[bus.vehicleType as VehicleType]) {
      return {
        vehicleType: bus.vehicleType as VehicleType,
        seatRows: bus.seatRows,
        backRowFull: Boolean(bus.backRowFull),
      };
    }
  }
  if (!row.seatRows) return null;
  const vt = (row.vehicleType ?? "OTOBUS") as VehicleType;
  if (!VEHICLES[vt]) return null;
  return { vehicleType: vt, seatRows: row.seatRows, backRowFull: Boolean(row.backRowFull) };
}

// repairSeatlessDepartures'ın ilk satırında çağrılır: eski Seat(tourId, code)
// benzersiz indeksi hâlâ duruyorsa yazım yapmadan hata fırlatır. Yorumla değil,
// koddan garanti edilsin diye — repairSeatIndexes'in kullandığı sameColumns /
// isUnique / indexColumns yardımcılarının AYNISINI kullanır, mantığı kopyalamaz.
async function assertOldTourCodeIndexDropped(db: RawSqlClient): Promise<void> {
  const rows = await db.$queryRawUnsafe<IndexRow[]>(
    `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='Seat'`
  );
  const stillThere = rows.some(
    (r) => r.sql && isUnique(r.sql) && sameColumns(indexColumns(r.sql), ["tourid", "code"])
  );
  if (stillThere) {
    throw new Error(
      'Eski Seat(tourId, code) benzersiz indeksi hâlâ duruyor — önce repairSeatIndexes() çalıştırılmalı.'
    );
  }
}

// Koltuğu hiç olmayan KOLTUK seferlerine koltuk üretir.
// Eski indeks yüzünden yarıda kalmış kayıtların telafisi — repairSeatIndexes'ten
// SONRA çağrılmalı, aksi halde aynı UNIQUE ihlaline düşer (bu, yukarıdaki
// assertOldTourCodeIndexDropped ile artık fonksiyonun başında DOĞRULANIYOR).
export async function repairSeatlessDepartures(db: RawSqlClient): Promise<{
  repaired: { departureId: string; seats: number }[];
  failed: { departureId: string; error: string }[];
  skipped: { departureId: string; reason: string }[];
}> {
  await assertOldTourCodeIndexDropped(db);

  const rows = await db.$queryRawUnsafe<SeatlessRow[]>(`
    SELECT d.id        AS departureId,
           d."tourId"  AS tourId,
           d."busId"   AS depBusId,
           t."busId"   AS tourBusId,
           t."vehicleType" AS vehicleType,
           t."seatRows"    AS seatRows,
           t."backRowFull" AS backRowFull
    FROM "TourDeparture" d
    JOIN "Tour" t ON t.id = d."tourId"
    WHERE t."bookingType" = 'KOLTUK'
      AND NOT EXISTS (SELECT 1 FROM "Seat" s WHERE s."departureId" = d.id)
  `);

  const repaired: { departureId: string; seats: number }[] = [];
  const failed: { departureId: string; error: string }[] = [];
  const skipped: { departureId: string; reason: string }[] = [];
  for (const row of rows) {
    const layout = await resolveLayout(db, row);
    if (!layout) {
      // Düzen çözülemedi — elle incelensin, uydurmuyoruz. Ama sessizce
      // atlamak yerine kaydediyoruz: aksi halde bu sefer hiçbir çıktıda
      // görünmeden kalıcı olarak koltuksuz kalır ve kalıcı olarak satılamaz
      // hale gelir.
      skipped.push({
        departureId: row.departureId,
        reason:
          "koltuk düzeni çözülemedi — sefere veya tura otobüs/sıra sayısı tanımlı değil",
      });
      continue;
    }
    const codes = seatCodes(layout.vehicleType, layout.seatRows, layout.backRowFull);

    // Bu seferin koltukları KENDİ transaction'ında yazılır: ortada hata
    // olursa hiçbiri kalmasın (ROLLBACK), yarım koltukla idempotentlik
    // kontrolünü ("hiç koltuğu yok mu") kalıcı olarak atlatmasın.
    try {
      await db.$executeRawUnsafe("BEGIN");
      for (const code of codes) {
        // id'yi Prisma üretmediği için burada veriyoruz. Şema TEXT bekliyor;
        // cuid yerine uuid olması işlevsel bir fark yaratmıyor.
        await db.$executeRawUnsafe(
          `INSERT INTO "Seat" ("id","tourId","departureId","code","status") VALUES (?,?,?,?,'BOS')`,
          randomUUID(),
          row.tourId,
          row.departureId,
          code
        );
      }
      await db.$executeRawUnsafe("COMMIT");
      repaired.push({ departureId: row.departureId, seats: codes.length });
    } catch (err) {
      // ROLLBACK'in kendisi patlayabilir (örn. COMMIT SQLITE_BUSY ile
      // başarısız olduysa artık aktif bir transaction kalmaz ve "no
      // transaction is active" hatası fırlar). Bu rollback hatasını
      // yutuyoruz ki asıl hata kaybolmasın ve o ana kadar biriken `failed`
      // listesi ayakta kalsın.
      try {
        await db.$executeRawUnsafe("ROLLBACK");
      } catch {
        // yut — asıl hata zaten aşağıda kaydediliyor
      }
      failed.push({
        departureId: row.departureId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Bu seferin bozulması diğer seferlerin onarımını durdurmasın.
    }
  }
  return { repaired, failed, skipped };
}
