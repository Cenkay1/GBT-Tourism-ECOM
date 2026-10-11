import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  repairSeatIndexes,
  repairSeatlessDepartures,
  type RawSqlClient,
} from "@/lib/seat-index-repair";

// better-sqlite3'ü modülün beklediği Prisma benzeri arayüze sarar.
function rawClient(db: Database.Database): RawSqlClient {
  return {
    async $queryRawUnsafe<T>(sql: string, ...values: unknown[]) {
      return db.prepare(sql).all(...(values as never[])) as T;
    },
    async $executeRawUnsafe(sql: string, ...values: unknown[]) {
      return db.prepare(sql).run(...(values as never[])).changes;
    },
  };
}

let dir: string;
let db: Database.Database;

// Üretimdeki durum: ilk migration'dan gelen ESKİ (tourId, code) benzersiz
// indeksi hâlâ duruyor; yeni (departureId, code) indeksi de eklenmiş.
function setupProductionLikeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE "Seat" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tourId" TEXT NOT NULL,
      "departureId" TEXT,
      "code" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'BOS',
      "gender" TEXT
    );
    CREATE INDEX "Seat_tourId_idx" ON "Seat"("tourId");
    CREATE UNIQUE INDEX "Seat_tourId_code_key" ON "Seat"("tourId", "code");
    CREATE UNIQUE INDEX "Seat_departureId_code_key" ON "Seat"("departureId", "code");
  `);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gbt-seat-"));
  db = new Database(join(dir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("repairSeatIndexes", () => {
  it("eski (tourId, code) benzersiz indeksini düşürür", async () => {
    setupProductionLikeSchema(db);

    const res = await repairSeatIndexes(rawClient(db));

    expect(res.dropped).toEqual(["Seat_tourId_code_key"]);
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='Seat'`)
      .all() as { name: string }[];
    expect(names.map((n) => n.name)).not.toContain("Seat_tourId_code_key");
  });

  it("onarımdan sonra aynı turda iki seferin aynı koltuk kodu yan yana durabilir", async () => {
    setupProductionLikeSchema(db);
    await repairSeatIndexes(rawClient(db));

    const insert = db.prepare(
      `INSERT INTO "Seat" ("id","tourId","departureId","code","status") VALUES (?,?,?,?,'BOS')`
    );
    insert.run("s1", "tur1", "sefer1", "1A");
    expect(() => insert.run("s2", "tur1", "sefer2", "1A")).not.toThrow();
  });

  it("aynı sefer içinde koltuk kodu hâlâ benzersiz kalır", async () => {
    setupProductionLikeSchema(db);
    await repairSeatIndexes(rawClient(db));

    const insert = db.prepare(
      `INSERT INTO "Seat" ("id","tourId","departureId","code","status") VALUES (?,?,?,?,'BOS')`
    );
    insert.run("s1", "tur1", "sefer1", "1A");
    expect(() => insert.run("s2", "tur1", "sefer1", "1A")).toThrow(/UNIQUE/i);
  });

  it("yeni indeks yoksa yaratır", async () => {
    db.exec(`
      CREATE TABLE "Seat" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tourId" TEXT NOT NULL,
        "departureId" TEXT,
        "code" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'BOS',
        "gender" TEXT
      );
      CREATE UNIQUE INDEX "Seat_tourId_code_key" ON "Seat"("tourId", "code");
    `);

    const res = await repairSeatIndexes(rawClient(db));

    expect(res.created).toBe(true);
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='Seat'`)
      .all() as { name: string }[];
    expect(names.map((n) => n.name)).toContain("Seat_departureId_code_key");
  });

  it("benzersiz OLMAYAN (tourId) indeksine dokunmaz", async () => {
    setupProductionLikeSchema(db);
    await repairSeatIndexes(rawClient(db));

    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='Seat'`)
      .all() as { name: string }[];
    expect(names.map((n) => n.name)).toContain("Seat_tourId_idx");
  });

  it("idempotenttir — ikinci çalıştırma bir şey değiştirmez", async () => {
    setupProductionLikeSchema(db);
    await repairSeatIndexes(rawClient(db));

    const res2 = await repairSeatIndexes(rawClient(db));

    expect(res2.dropped).toEqual([]);
    expect(res2.created).toBe(false);
  });
});

// Onarımın koltuk üretebilmesi için Tour / TourDeparture / Bus tabloları gerekir.
function setupTourSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE "Tour" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "bookingType" TEXT NOT NULL,
      "busId" TEXT,
      "vehicleType" TEXT,
      "seatRows" INTEGER,
      "backRowFull" BOOLEAN NOT NULL DEFAULT 0
    );
    CREATE TABLE "TourDeparture" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tourId" TEXT NOT NULL,
      "busId" TEXT
    );
    CREATE TABLE "Bus" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "vehicleType" TEXT NOT NULL,
      "seatRows" INTEGER NOT NULL,
      "backRowFull" BOOLEAN NOT NULL DEFAULT 0
    );
  `);
}

describe("repairSeatlessDepartures", () => {
  beforeEach(() => {
    setupProductionLikeSchema(db);
    setupTourSchema(db);
  });

  it("turun elle girilmiş düzeninden koltuk üretir", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KOLTUK',NULL,'MINIBUS',3,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
    `);
    await repairSeatIndexes(rawClient(db)); // eski indeks düşürülmeli — aksi halde fonksiyon hata fırlatır

    const res = await repairSeatlessDepartures(rawClient(db));

    // MINIBUS = 1+1 → sıra başına 2 koltuk, 3 sıra = 6
    expect(res.repaired).toEqual([{ departureId: "d1", seats: 6 }]);
    expect(res.failed).toEqual([]);
    const codes = db
      .prepare(`SELECT code FROM "Seat" WHERE departureId='d1' ORDER BY code`)
      .all() as { code: string }[];
    expect(codes.map((c) => c.code)).toEqual(["1A", "1B", "2A", "2B", "3A", "3B"]);
  });

  it("seferin kendi otobüsünü turun otobüsüne tercih eder", async () => {
    db.exec(`
      INSERT INTO "Bus" VALUES ('bTur','MINIBUS',3,0);
      INSERT INTO "Bus" VALUES ('bSefer','OTOBUS',2,0);
      INSERT INTO "Tour" VALUES ('t1','KOLTUK','bTur',NULL,NULL,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1','bSefer');
    `);
    await repairSeatIndexes(rawClient(db));

    await repairSeatlessDepartures(rawClient(db));

    // OTOBUS = 2+2 → 2 sıra × 4 = 8
    const n = db.prepare(`SELECT COUNT(*) c FROM "Seat" WHERE departureId='d1'`).get() as {
      c: number;
    };
    expect(n.c).toBe(8);
  });

  it("koltuğu olan sefere dokunmaz", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KOLTUK',NULL,'MINIBUS',3,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
      INSERT INTO "Seat" VALUES ('s1','t1','d1','1A','SATILDI',NULL);
    `);
    await repairSeatIndexes(rawClient(db));

    const res = await repairSeatlessDepartures(rawClient(db));

    expect(res.repaired).toEqual([]);
    expect(res.failed).toEqual([]);
  });

  it("KONTENJAN turunu atlar", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KONTENJAN',NULL,NULL,NULL,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
    `);
    await repairSeatIndexes(rawClient(db));

    const res = await repairSeatlessDepartures(rawClient(db));

    expect(res.repaired).toEqual([]);
    expect(res.failed).toEqual([]);
  });

  it("düzeni çözülemeyen seferi atlar", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KOLTUK',NULL,NULL,NULL,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
    `);
    await repairSeatIndexes(rawClient(db));

    const res = await repairSeatlessDepartures(rawClient(db));

    expect(res.repaired).toEqual([]);
    expect(res.failed).toEqual([]);
    expect(res.skipped).toEqual([{ departureId: "d1", reason: expect.any(String) }]);
  });

  it("son sıra koridor koltuğunu (backRowFull) ekler", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KOLTUK',NULL,'MINIBUS',2,1);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
    `);
    await repairSeatIndexes(rawClient(db));

    await repairSeatlessDepartures(rawClient(db));

    const codes = db
      .prepare(`SELECT code FROM "Seat" WHERE departureId='d1' ORDER BY code`)
      .all() as { code: string }[];
    expect(codes.map((c) => c.code)).toContain("2M");
  });

  // --- Sağlamlık düzeltmeleri: transaction + eski indeks kontrolü ---

  // $executeRawUnsafe çağrı sayacı N'e ulaştığında hata fırlatan sahte istemci.
  // BEGIN/INSERT/COMMIT/ROLLBACK hepsi $executeRawUnsafe üzerinden gittiği için
  // sayaç, bir seferin koltuk üretiminin TAM ORTASINDA patlamayı simüle eder.
  function rawClientFailingOnNthExecute(db: Database.Database, n: number): RawSqlClient {
    let count = 0;
    return {
      async $queryRawUnsafe<T>(sql: string, ...values: unknown[]) {
        return db.prepare(sql).all(...(values as never[])) as T;
      },
      async $executeRawUnsafe(sql: string, ...values: unknown[]) {
        count++;
        if (count === n) {
          throw new Error("simüle edilmiş yazım hatası");
        }
        return db.prepare(sql).run(...(values as never[])).changes;
      },
    };
  }

  it("kısmi yazım geri alınıyor — bir sefer ortada patlarsa hiç koltuğu kalmaz", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KOLTUK',NULL,'MINIBUS',3,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
    `);
    await repairSeatIndexes(rawClient(db));

    // MINIBUS × 3 sıra = 6 koltuk. Çağrı sırası: 1=BEGIN, 2..7=INSERT×6, 8=COMMIT.
    // 4. INSERT'te (count=5) patlat — 3 koltuk yazılmış olacak, sonra ROLLBACK gelmeli.
    const failingClient = rawClientFailingOnNthExecute(db, 5);
    const res = await repairSeatlessDepartures(failingClient);

    expect(res.repaired).toEqual([]);
    expect(res.failed).toEqual([{ departureId: "d1", error: "simüle edilmiş yazım hatası" }]);
    const n = db.prepare(`SELECT COUNT(*) c FROM "Seat" WHERE departureId='d1'`).get() as {
      c: number;
    };
    expect(n.c).toBe(0); // yarım koltuk YOK — tamamen geri alındı
  });

  it("bozuk sefer diğerlerini durdurmaz — biri patlar, diğeri onarılır", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KOLTUK',NULL,'MINIBUS',1,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
      INSERT INTO "Tour" VALUES ('t2','KOLTUK',NULL,'MINIBUS',1,0);
      INSERT INTO "TourDeparture" VALUES ('d2','t2',NULL);
    `);
    await repairSeatIndexes(rawClient(db));

    // d1'in transaction'ı: 1=BEGIN(d1), 2=INSERT(d1 ilk koltuk) → burada patlat.
    // d1 ROLLBACK olur, sonra d2 kendi BEGIN/INSERT/INSERT/COMMIT'iyle sorunsuz ilerler.
    const failingClient = rawClientFailingOnNthExecute(db, 2);
    const res = await repairSeatlessDepartures(failingClient);

    expect(res.failed).toEqual([{ departureId: "d1", error: "simüle edilmiş yazım hatası" }]);
    expect(res.repaired).toEqual([{ departureId: "d2", seats: 2 }]);
    const d1Count = db.prepare(`SELECT COUNT(*) c FROM "Seat" WHERE departureId='d1'`).get() as {
      c: number;
    };
    const d2Count = db.prepare(`SELECT COUNT(*) c FROM "Seat" WHERE departureId='d2'`).get() as {
      c: number;
    };
    expect(d1Count.c).toBe(0);
    expect(d2Count.c).toBe(2);
  });

  it("eski (tourId, code) indeksi hâlâ duruyorsa açık hata fırlatır ve hiçbir şey yazmaz", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KOLTUK',NULL,'MINIBUS',3,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
    `);
    // repairSeatIndexes BİLEREK çağrılmıyor — eski indeks setupProductionLikeSchema'dan beri duruyor.

    await expect(repairSeatlessDepartures(rawClient(db))).rejects.toThrow(
      /Seat\(tourId, code\) benzersiz indeksi hâlâ duruyor/
    );
    const n = db.prepare(`SELECT COUNT(*) c FROM "Seat"`).get() as { c: number };
    expect(n.c).toBe(0);
  });
});
