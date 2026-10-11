# Aşama 1 — Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Üretimde çoklu seferli turun kaydedilememesine yol açan 500 hatasını kökünden gidermek ve iptal edilen rezervasyonun koltuğunu serbest bırakıp müşteriye bildirim göndermek.

**Architecture:** İki bağımsız kusur var. Birincisi veritabanı şema ayrışması: üretimde `Seat(tourId, code)` üzerindeki eski benzersiz indeks hâlâ duruyor ve ikinci seferin koltuk üretimini engelliyor — onarım, raw SQL ile çalışan ve birim testi yazılabilen ayrı bir modüle çıkarılıp `deploy-migrate` script'inden çağrılır. İkincisi eksik iş mantığı: `setBookingStatus` yalnızca durum yazıyor — yerine koltuk boşaltma, sadakat puanı geri alımı ve e-posta bildirimini tek noktada toplayan `cancelBookingByAdmin` gelir.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Prisma 7 + better-sqlite3 adapter, SQLite, Vitest 4, Tailwind 4, nodemailer.

## Global Constraints

- **Git'e dokunulmaz.** Kullanıcı commit/branch/push işlerini kendisi yönetiyor. Bu planda `git` komutu yoktur; her görev "Doğrula" adımıyla biter.
- **`AGENTS.md`:** Bu Next.js sürümü eğitim verisinden farklı olabilir. Next.js API'si gerektiren bir adımdan önce `node_modules/next/dist/docs/` altındaki ilgili rehber okunur.
- **Yerel veritabanı:** `.env` içindeki `DATABASE_URL` **üretim yolunu** gösteriyor. Yerelde her komut `DATABASE_URL="file:./dev.db"` ile çalıştırılır. Testler kendi geçici kopyalarını kullanır.
- **Şema değişikliği iki yere yazılır:** `prisma/schema.prisma` (+ `npx prisma migrate dev`) **ve** `scripts/deploy-migrate.ts`. Aşama 1 yeni kolon eklemiyor, yalnızca indeks onarıyor — ama kural sonraki aşamalar için geçerli.
- **Dil:** Kullanıcıya görünen tüm metinler ve kod yorumları Türkçe. Mevcut dosyaların yorum yoğunluğu ve üslubu korunur.
- **Prisma client yolu:** `@/lib/generated/prisma/client` (varsayılan `@prisma/client` değil).
- **Test komutu:** `npm test` (vitest, `include: ["lib/**/*.test.ts"]`).

---

## File Structure

| Dosya | Sorumluluk |
|---|---|
| `lib/seat-index-repair.ts` | **Yeni.** Raw SQL ile Seat indeks onarımı ve koltuksuz sefer onarımı. Prisma modellerine bağımlı değil — `RawSqlClient` arayüzü alır, bu yüzden test edilebilir. |
| `lib/__tests__/seat-index-repair.test.ts` | **Yeni.** Üretim benzeri SQLite şeması kurup onarımı doğrular. |
| `scripts/deploy-migrate.ts` | **Değişir.** Satır içi indeks bloğu kaldırılır, yeni modül çağrılır. |
| `lib/tour-save-errors.ts` | **Yeni.** Prisma hatasını kullanıcıya gösterilecek Türkçe mesaja çeviren saf fonksiyon. |
| `lib/__tests__/tour-save-errors.test.ts` | **Yeni.** Mesaj eşlemesinin birim testi. |
| `lib/admin-actions.ts` | **Değişir.** `createTour`/`updateTour` hata yakalar; `setBookingStatus` iptali devreder; `cancelBookingAction` eklenir. |
| `app/admin/(dash)/turlar/[id]/page.tsx`, `.../yeni/page.tsx` | **Değişir.** `?hata=` mesajını gösterir. |
| `lib/email-layout.ts` | **Yeni.** E-posta HTML kabuğu (`shell`, `button`) — iki modül arasında paylaşılır. |
| `lib/customer-notifications.ts` | **Değişir.** Kendi `shell`/`button` kopyalarını bırakıp ortak modülü kullanır. |
| `lib/loyalty.ts` | **Değişir.** `revokeLoyaltyForBooking` eklenir. |
| `lib/booking.ts` | **Değişir.** `cancelBookingByAdmin` eklenir. |
| `lib/notifications.ts` | **Değişir.** `sendBookingCancellation` eklenir. |
| `lib/payment-actions.ts` | **Değişir.** `refundBooking` ortak iptal yoluna bağlanır. |
| `components/admin/CancelBookingButton.tsx` | **Yeni.** Neden alanlı iptal formu. |
| `app/admin/(dash)/rezervasyonlar/[id]/page.tsx` | **Değişir.** `StatusForm id status="IPTAL"` yerine yeni bileşen. |
| `lib/__tests__/helpers/db.ts` | **Yeni.** Testler için geçici veritabanı kurulumu (vitest `include` kalıbına uymaz, test olarak toplanmaz). |
| `lib/__tests__/cancel-booking.test.ts` | **Yeni.** İptal akışının uçtan uca testi. |
| `lib/__tests__/loyalty-revoke.test.ts` | **Yeni.** Puan geri alımının testi. |

---

## Task 1: Seat indeks onarımı

**Files:**
- Create: `lib/seat-index-repair.ts`
- Create: `lib/__tests__/seat-index-repair.test.ts`

**Interfaces:**
- Consumes: hiçbir şey (ilk görev)
- Produces:
  - `export interface RawSqlClient { $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>; $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>; }`
  - `export async function repairSeatIndexes(db: RawSqlClient): Promise<{ dropped: string[]; created: boolean }>`

- [ ] **Step 1: Failing testi yaz**

`lib/__tests__/seat-index-repair.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repairSeatIndexes, type RawSqlClient } from "@/lib/seat-index-repair";

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
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm test -- lib/__tests__/seat-index-repair.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/seat-index-repair"`

- [ ] **Step 3: Modülü yaz**

`lib/seat-index-repair.ts`:

```ts
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
  const dropped: string[] = [];
  for (const row of rows) {
    if (!row.sql) continue; // otomatik indeks (PRIMARY KEY) — düşürülemez
    if (!isUnique(row.sql)) continue;
    if (!sameColumns(indexColumns(row.sql), ["tourid", "code"])) continue;
    await db.$executeRawUnsafe(`DROP INDEX "${row.name}"`);
    dropped.push(row.name);
  }

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

  return { dropped, created };
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm test -- lib/__tests__/seat-index-repair.test.ts`
Expected: PASS — 6 test

- [ ] **Step 5: Doğrula**

Run: `npx tsc --noEmit`
Expected: hata yok

---

## Task 2: Koltuksuz sefer onarımı

Eski indeks yüzünden `saveDepartures` sefer satırını oluşturup koltuk üretiminde patlıyordu ve `saveDepartures` transaction içinde değil — üretimde koltuğu olmayan yetim seferler kalmış olabilir. İndeks onarıldıktan sonra bunlar doldurulmalı.

**Files:**
- Modify: `lib/seat-index-repair.ts`
- Modify: `lib/__tests__/seat-index-repair.test.ts`

**Interfaces:**
- Consumes: `RawSqlClient` (Task 1)
- Produces: `export async function repairSeatlessDepartures(db: RawSqlClient): Promise<{ repaired: { departureId: string; seats: number }[] }>`

- [ ] **Step 1: Failing testi yaz**

`lib/__tests__/seat-index-repair.test.ts` dosyasının sonuna ekle. Import satırını da genişlet:

```ts
import {
  repairSeatIndexes,
  repairSeatlessDepartures,
  type RawSqlClient,
} from "@/lib/seat-index-repair";
```

Yeni blok:

```ts
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

    const res = await repairSeatlessDepartures(rawClient(db));

    // MINIBUS = 1+1 → sıra başına 2 koltuk, 3 sıra = 6
    expect(res.repaired).toEqual([{ departureId: "d1", seats: 6 }]);
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

    const res = await repairSeatlessDepartures(rawClient(db));

    expect(res.repaired).toEqual([]);
  });

  it("KONTENJAN turunu atlar", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KONTENJAN',NULL,NULL,NULL,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
    `);

    const res = await repairSeatlessDepartures(rawClient(db));

    expect(res.repaired).toEqual([]);
  });

  it("düzeni çözülemeyen seferi atlar", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KOLTUK',NULL,NULL,NULL,0);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
    `);

    const res = await repairSeatlessDepartures(rawClient(db));

    expect(res.repaired).toEqual([]);
  });

  it("son sıra koridor koltuğunu (backRowFull) ekler", async () => {
    db.exec(`
      INSERT INTO "Tour" VALUES ('t1','KOLTUK',NULL,'MINIBUS',2,1);
      INSERT INTO "TourDeparture" VALUES ('d1','t1',NULL);
    `);

    await repairSeatlessDepartures(rawClient(db));

    const codes = db
      .prepare(`SELECT code FROM "Seat" WHERE departureId='d1' ORDER BY code`)
      .all() as { code: string }[];
    expect(codes.map((c) => c.code)).toContain("2M");
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm test -- lib/__tests__/seat-index-repair.test.ts`
Expected: FAIL — `repairSeatlessDepartures is not a function`

- [ ] **Step 3: Fonksiyonu yaz**

`lib/seat-index-repair.ts` dosyasının başına import ekle:

```ts
import { randomUUID } from "node:crypto";
import { VEHICLES, seatCodes, type VehicleType } from "@/lib/shared";
```

Dosyanın sonuna ekle:

```ts
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

// Koltuğu hiç olmayan KOLTUK seferlerine koltuk üretir.
// Eski indeks yüzünden yarıda kalmış kayıtların telafisi — repairSeatIndexes'ten
// SONRA çağrılmalı, aksi halde aynı UNIQUE ihlaline düşer.
export async function repairSeatlessDepartures(
  db: RawSqlClient
): Promise<{ repaired: { departureId: string; seats: number }[] }> {
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
  for (const row of rows) {
    const layout = await resolveLayout(db, row);
    if (!layout) continue; // düzen çözülemedi — elle incelensin, uydurmuyoruz
    const codes = seatCodes(layout.vehicleType, layout.seatRows, layout.backRowFull);
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
    repaired.push({ departureId: row.departureId, seats: codes.length });
  }
  return { repaired };
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm test -- lib/__tests__/seat-index-repair.test.ts`
Expected: PASS — 12 test

- [ ] **Step 5: Doğrula**

Run: `npx tsc --noEmit`
Expected: hata yok

---

## Task 3: Onarımı deploy-migrate script'ine bağla

**Files:**
- Modify: `scripts/deploy-migrate.ts:343-362` (mevcut "== 6. İndeksler ==" bloğu)

**Interfaces:**
- Consumes: `repairSeatIndexes`, `repairSeatlessDepartures` (Task 1, 2)
- Produces: yok (script)

- [ ] **Step 1: Import ekle**

`scripts/deploy-migrate.ts` üst kısmındaki importlara ekle:

```ts
import { repairSeatIndexes, repairSeatlessDepartures } from "../lib/seat-index-repair";
```

- [ ] **Step 2: Mevcut indeks bloğunu değiştir**

`scripts/deploy-migrate.ts` içindeki şu bloğun tamamını (`console.log("== 6. İndeksler ==")` satırından, `created = true` dalının kapanış `}` işaretine kadar olan `if (idx.some(...)) { ... } else { ... }` yapısı dahil) sil:

```ts
  // Koltuk benzersizliği artık (departureId, code) üzerinde. Veriler sefere
  // BAĞLANDIKTAN SONRA eklenir — önce eklenirse bağlama sırasında çakışır.
  console.log("== 6. İndeksler ==");
  const idx = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='Seat'`
  );
  if (idx.some((i) => i.name === "Seat_departureId_code_key")) {
    console.log("  = Seat(departureId, code) indeksi zaten var");
  } else {
    try {
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX "Seat_departureId_code_key" ON "Seat"("departureId", "code")`
      );
      console.log("  + Seat(departureId, code) benzersiz indeks");
    } catch (e) {
      console.log(
        "  ! Seat indeksi eklenemedi (yinelenen koltuk olabilir):",
        (e as Error).message.split("\n")[0]
      );
    }
  }
```

Yerine şunu koy:

```ts
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
  if (seatless.repaired.length === 0) {
    console.log("  = koltuksuz sefer yok");
  } else {
    for (const r of seatless.repaired) {
      console.log(`  + ${r.departureId}: ${r.seats} koltuk üretildi`);
    }
  }
```

- [ ] **Step 3: Script'i dev.db kopyası üzerinde çalıştır**

```bash
cp dev.db /tmp/gbt-migrate-test.db
DATABASE_URL="file:/tmp/gbt-migrate-test.db" npx tsx scripts/deploy-migrate.ts
```

Expected: `== 6. İndeksler ==` altında `= indeksler zaten doğru` (dev.db'de eski indeks yok), `== 7. Koltuksuz seferler ==` altında `= koltuksuz sefer yok`, script hatasız biter.

- [ ] **Step 4: Üretim benzeri kopyada eski indeksin düştüğünü doğrula**

```bash
cp dev.db /tmp/gbt-prodlike.db
sqlite3 /tmp/gbt-prodlike.db "DELETE FROM Seat WHERE departureId IN (SELECT id FROM TourDeparture WHERE sortOrder > 0);"
sqlite3 /tmp/gbt-prodlike.db 'CREATE UNIQUE INDEX "Seat_tourId_code_key" ON "Seat"("tourId","code");'
DATABASE_URL="file:/tmp/gbt-prodlike.db" npx tsx scripts/deploy-migrate.ts
sqlite3 /tmp/gbt-prodlike.db "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='Seat';"
```

Expected: script çıktısında `- eski benzersiz indeks düşürüldü: Seat_tourId_code_key` ve `+ ... koltuk üretildi` satırları; son sorguda `Seat_tourId_code_key` **listelenmez**, `Seat_departureId_code_key` listelenir.

- [ ] **Step 5: Doğrula ve temizle**

```bash
npx tsc --noEmit
npm test
rm -f /tmp/gbt-migrate-test.db /tmp/gbt-prodlike.db
```

Expected: tsc temiz, tüm testler geçer.

---

## Task 4: Tur kaydında hata yutulmaması

`createTour`/`updateTour` ham hata fırlatıp 500 veriyor. Hata yakalanıp forma okunur mesajla dönecek. `redirect()` kendi sinyalini `throw` ettiği için **asla `try` bloğunun içinde çağrılmaz** — veritabanı işi ayrı bir yardımcıya alınır, `redirect` dışarıda kalır.

**Files:**
- Create: `lib/tour-save-errors.ts`
- Create: `lib/__tests__/tour-save-errors.test.ts`
- Modify: `lib/admin-actions.ts:524-570` (`createTour`, `updateTour`)
- Modify: `app/admin/(dash)/turlar/[id]/page.tsx`
- Modify: `app/admin/(dash)/turlar/yeni/page.tsx`

**Interfaces:**
- Consumes: yok
- Produces: `export function tourSaveErrorMessage(e: unknown): string`

- [ ] **Step 1: Failing testi yaz**

`lib/__tests__/tour-save-errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tourSaveErrorMessage } from "@/lib/tour-save-errors";

describe("tourSaveErrorMessage", () => {
  it("eski koltuk indeksi çakışmasını tanır ve çözümü söyler", () => {
    const err = { code: "P2002", meta: { target: ["tourId", "code"] } };

    const msg = tourSaveErrorMessage(err);

    expect(msg).toContain("deploy-migrate");
    expect(msg).toContain("koltuk");
  });

  it("hedef dizi yerine metin gelse de tanır", () => {
    const err = { code: "P2002", meta: { target: "tourId, code" } };

    expect(tourSaveErrorMessage(err)).toContain("deploy-migrate");
  });

  it("diğer benzersizlik çakışmalarına genel mesaj verir", () => {
    const err = { code: "P2002", meta: { target: ["slug"] } };

    const msg = tourSaveErrorMessage(err);

    expect(msg).toContain("zaten var");
    expect(msg).not.toContain("deploy-migrate");
  });

  it("bilinmeyen hataya genel mesaj verir", () => {
    expect(tourSaveErrorMessage(new Error("patladı"))).toContain("kaydedilemedi");
  });

  it("null/undefined ile çökmez", () => {
    expect(tourSaveErrorMessage(null)).toContain("kaydedilemedi");
    expect(tourSaveErrorMessage(undefined)).toContain("kaydedilemedi");
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm test -- lib/__tests__/tour-save-errors.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/tour-save-errors"`

- [ ] **Step 3: Modülü yaz**

`lib/tour-save-errors.ts`:

```ts
// Tur kaydetme sırasında oluşan veritabanı hatalarını görevlinin okuyabileceği
// Türkçe mesaja çevirir. Saf fonksiyon — Prisma'ya import bağımlılığı yok,
// yalnız hata nesnesinin şekline bakar.

function errorCode(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return null;
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

// Prisma P2002'de meta.target kimi sürümde dizi, kimi sürümde metin gelir.
function targetText(e: unknown): string {
  if (typeof e !== "object" || e === null) return "";
  const target = (e as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.join(",");
  return typeof target === "string" ? target : "";
}

export function tourSaveErrorMessage(e: unknown): string {
  if (errorCode(e) === "P2002") {
    const target = targetText(e).toLowerCase();
    if (target.includes("tourid") && target.includes("code")) {
      return (
        "Koltuklar kaydedilemedi: veritabanındaki eski koltuk benzersizlik kuralı " +
        "aynı turda birden fazla sefer açılmasını engelliyor. Sunucuda " +
        "`npx tsx scripts/deploy-migrate.ts` çalıştırıldıktan sonra tekrar deneyin."
      );
    }
    return "Bu kayıt zaten var (benzersizlik çakışması). Alanları kontrol edip tekrar deneyin.";
  }
  return "Tur kaydedilemedi. Lütfen tekrar deneyin; sorun sürerse yöneticinize bildirin.";
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm test -- lib/__tests__/tour-save-errors.test.ts`
Expected: PASS — 5 test

- [ ] **Step 5: `createTour` ve `updateTour`'u hata yakalar hâle getir**

`lib/admin-actions.ts` üstündeki importlara ekle:

```ts
import { tourSaveErrorMessage } from "@/lib/tour-save-errors";
```

Mevcut `createTour` gövdesini şununla değiştir:

```ts
export async function createTour(fd: FormData) {
  await requireAdmin();

  // Veritabanı işi ayrı: redirect() kendi sinyalini throw ettiği için ASLA
  // try bloğunun içinde çağrılmamalı, yoksa başarılı kayıt hataya düşer.
  let tourId: string;
  try {
    const data = await tourDataFromForm(fd);
    const slug = await uniqueSlug(data.title);
    const tour = await prisma.tour.create({ data: { ...data, slug } });
    // Koltuklar sefer bazlı üretilir; saveDepartures her yeni sefer için üretir.
    await saveDepartures(tour.id, str(fd, "departures"), seatConfigOf(data));
    await savePlaces(tour.id, str(fd, "places"));
    tourId = tour.id;
  } catch (e) {
    console.error("[tur oluşturma hatası]", e);
    redirect(`/admin/turlar/yeni?hata=${encodeURIComponent(tourSaveErrorMessage(e))}`);
  }

  revalidatePath("/");
  revalidatePath("/admin/turlar");
  revalidatePath(`/admin/turlar/${tourId}`);
  redirect("/admin/turlar");
}
```

Mevcut `updateTour` gövdesini şununla değiştir:

```ts
export async function updateTour(id: string, fd: FormData) {
  await requireAdmin();

  try {
    const data = await tourDataFromForm(fd);
    const slug = await uniqueSlug(data.title, id);

    const existing = await prisma.tour.findUnique({
      where: { id },
      include: { seats: true },
    });

    await prisma.tour.update({ where: { id }, data: { ...data, slug } });
    await saveDepartures(id, str(fd, "departures"), seatConfigOf(data));

    // Araç tipi/sıra değiştiyse ve hiçbir seferde satılmış/kilitli koltuk yoksa
    // tüm seferlerin koltuklarını yeniden üret.
    if (data.bookingType === "KOLTUK" && data.seatRows) {
      const hasActive = existing?.seats.some((s) => s.status !== "BOS");
      const layoutChanged =
        existing?.vehicleType !== data.vehicleType ||
        existing?.seatRows !== data.seatRows ||
        existing?.backRowFull !== data.backRowFull;
      if (!hasActive && layoutChanged) {
        await prisma.seat.deleteMany({ where: { tourId: id } });
        const departures = await prisma.tourDeparture.findMany({ where: { tourId: id } });
        for (const d of departures) {
          await generateSeats(
            id,
            d.id,
            data.vehicleType ?? "OTOBUS",
            data.seatRows,
            data.backRowFull ?? false
          );
        }
      }
    }
    await savePlaces(id, str(fd, "places"));
  } catch (e) {
    console.error("[tur güncelleme hatası]", e);
    redirect(`/admin/turlar/${id}?hata=${encodeURIComponent(tourSaveErrorMessage(e))}`);
  }

  revalidatePath("/");
  revalidatePath("/admin/turlar");
  revalidatePath(`/admin/turlar/${id}`);
  redirect("/admin/turlar");
}
```

- [ ] **Step 6: Hata mesajını "Yeni Tur" sayfasında göster**

`app/admin/(dash)/turlar/yeni/page.tsx` dosyasının TAMAMINI şununla değiştir. Bu Next.js sürümünde `searchParams` bir Promise — `await` edilmeden okunamaz:

```tsx
import TourForm from "@/components/admin/TourForm";
import { createTour } from "@/lib/admin-actions";
import { getActiveAmenities, getBuses } from "@/lib/tours";

export const dynamic = "force-dynamic";

export default async function NewTourPage({
  searchParams,
}: {
  searchParams: Promise<{ hata?: string }>;
}) {
  const { hata } = await searchParams;
  const [amenities, buses] = await Promise.all([getActiveAmenities(), getBuses(true)]);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-brand">Yeni Tur Ekle</h1>
      {hata && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{hata}</p>
      )}
      <TourForm action={createTour} submitLabel="Turu Kaydet" amenities={amenities} buses={buses} />
    </div>
  );
}
```

- [ ] **Step 7: Hata mesajını "Turu Düzenle" sayfasında göster**

`app/admin/(dash)/turlar/[id]/page.tsx` içinde iki yer değişir.

Birincisi, bileşen imzası (satır 37-42 civarı) — `searchParams` eklenir:

```tsx
export default async function EditTourPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hata?: string }>;
}) {
  const { id } = await params;
  const { hata } = await searchParams;
```

İkincisi, JSX dönüşü (satır 114-125) — başlık ile form arasına uyarı eklenir:

```tsx
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-brand">Turu Düzenle</h1>
      {hata && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{hata}</p>
      )}
      <TourForm
        action={action}
        initial={initial}
        submitLabel="Değişiklikleri Kaydet"
        amenities={amenities}
        buses={buses}
      />
    </div>
  );
```

- [ ] **Step 8: Doğrula**

```bash
npx tsc --noEmit
npm test
npm run lint
```

Expected: tsc temiz; tüm testler geçer; lint'te bu dosyalardan yeni hata yok (mevcut hatalar korunur).

---

## Task 5: Test için veritabanı altyapısı

Sonraki görevler (puan geri alımı, iptal akışı) gerçek veritabanı gerektiriyor. Projede henüz veritabanlı test altyapısı yok; önce onu kuruyoruz.

Kritik nokta: `lib/loyalty.ts` ve `lib/booking.ts` `lib/db.ts`'teki **global prisma singleton'ını** kullanıyor ve o singleton `DATABASE_URL`'i modül yüklenirken bir kez okuyor. Test ile test edilen modülün aynı veritabanını görmesi için `DATABASE_URL`, herhangi bir modül yüklenmeden önce geçici bir kopyaya çevrilmeli. Bunu vitest'in `setupFiles` kancası yapar.

**Files:**
- Create: `vitest.setup.ts`
- Modify: `vitest.config.ts`
- Create: `lib/__tests__/helpers/db.ts`

**Interfaces:**
- Consumes: yok
- Produces:
  - `export async function getTestPrisma(): Promise<PrismaClient>`
  - `export async function createTestBooking(prisma: PrismaClient, opts?: { status?: string; seatCodes?: string[]; userId?: string | null; totalAmount?: number }): Promise<{ tourId: string; departureId: string; bookingId: string }>`

- [ ] **Step 1: Vitest kurulum dosyasını yaz**

`vitest.setup.ts` (proje kökü):

```ts
// Testler ASLA .env'deki veritabanına bağlanmamalı — oradaki DATABASE_URL
// ÜRETİM dosyasını gösteriyor. Her test süreci dev.db'nin kendi geçici
// kopyasıyla çalışır.
//
// Bu dosya her test dosyasından ÖNCE çalışır; lib/db.ts DATABASE_URL'i modül
// yüklenirken okuduğu için sıralama kritik.
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "gbt-vitest-"));
const file = join(dir, "test.db");
// dev.db yalnızca ŞEMA kaynağı; testler kendi kayıtlarını üretir.
copyFileSync("dev.db", file);
process.env.DATABASE_URL = `file:${file}`;

afterAll(() => rmSync(dir, { recursive: true, force: true }));
```

- [ ] **Step 2: Vitest yapılandırmasını güncelle**

`vitest.config.ts` dosyasının tamamını şununla değiştir:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Test yardımcısını yaz**

`lib/__tests__/helpers/db.ts` — dosya adı `*.test.ts` kalıbına uymadığı için vitest bunu test olarak toplamaz:

```ts
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
  }
): Promise<{ tourId: string; departureId: string; bookingId: string }> {
  const n = ++counter;
  const seatCodes = opts?.seatCodes ?? ["1A", "1B"];
  const status = opts?.status ?? "ODENDI";
  const seatStatus = status === "ODENDI" ? "SATILDI" : "KILITLI";

  const tour = await prisma.tour.create({
    data: {
      slug: `test-tur-${n}-${Date.now()}`,
      title: `Test Turu ${n}`,
      destination: "Test",
      category: "YURT_ICI",
      bookingType: "KOLTUK",
      departureDate: new Date(Date.now() + 7 * 86400000),
      departureLocation: "Test Kalkış",
      price: 1000,
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
      passengers: {
        create: seatCodes.map((code, i) => ({
          firstName: "Yolcu",
          lastName: `${i + 1}`,
          seatCode: code,
          gender: "E",
        })),
      },
    },
  });

  return { tourId: tour.id, departureId: departure.id, bookingId: booking.id };
}
```

- [ ] **Step 4: Altyapının çalıştığını geçici bir testle doğrula**

`lib/__tests__/helpers-smoke.test.ts` yaz:

```ts
import { describe, it, expect } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";

describe("test veritabanı altyapısı", () => {
  it("üretim veritabanına DEĞİL geçici kopyaya bağlanır", () => {
    expect(process.env.DATABASE_URL).toMatch(/gbt-vitest-/);
  });

  it("izole bir rezervasyon üretir", async () => {
    const prisma = await getTestPrisma();

    const { bookingId } = await createTestBooking(prisma);

    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { passengers: true },
    });
    expect(b?.status).toBe("ODENDI");
    expect(b?.passengers).toHaveLength(2);
  });

  it("koltukları satılmış işaretler", async () => {
    const prisma = await getTestPrisma();

    const { departureId } = await createTestBooking(prisma);

    const sold = await prisma.seat.count({ where: { departureId, status: "SATILDI" } });
    expect(sold).toBe(2);
  });
});
```

- [ ] **Step 5: Çalıştır**

Run: `npm test -- lib/__tests__/helpers-smoke.test.ts`
Expected: PASS — 3 test. İlk test geçmiyorsa `vitest.setup.ts` yüklenmiyordur; `vitest.config.ts`'teki `setupFiles` yolunu kontrol et.

- [ ] **Step 6: Mevcut testlerin bozulmadığını doğrula**

Run: `npm test`
Expected: tüm testler geçer (iyzico, pricing, seat, seat-index-repair, tour-save-errors, helpers-smoke).

- [ ] **Step 7: Geçici duman testini sil**

```bash
rm lib/__tests__/helpers-smoke.test.ts
```

Altyapının doğruluğu bundan sonraki görevlerin testleriyle sürekli doğrulanacak; ayrı bir duman testi tutmaya gerek yok.

- [ ] **Step 8: Doğrula**

Run: `npx tsc --noEmit && npm test`
Expected: tsc temiz, tüm testler geçer.

---

## Task 6: Sadakat puanı geri alımı

**Files:**
- Modify: `lib/loyalty.ts`
- Create: `lib/__tests__/loyalty-revoke.test.ts`

**Interfaces:**
- Consumes: `getTestPrisma`, `createTestBooking` (Task 5)
- Produces: `export async function revokeLoyaltyForBooking(bookingId: string): Promise<void>`

- [ ] **Step 1: Failing testi yaz**

`lib/__tests__/loyalty-revoke.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";
import {
  awardLoyaltyForBooking,
  revokeLoyaltyForBooking,
} from "@/lib/loyalty";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// vitest.setup.ts DATABASE_URL'i geçici kopyaya çevirdiği için lib/loyalty.ts
// içindeki global prisma singleton'ı da aynı dosyaya bağlanır.
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

async function makeUser(points = 0) {
  return prisma.user.create({
    data: {
      email: `u${Date.now()}${Math.random()}@example.com`,
      points,
      lifetimePoints: points,
      tier: "BRONZE",
    },
  });
}

describe("revokeLoyaltyForBooking", () => {
  it("yazılmış puanı bakiyeden ve ömür boyu toplamdan düşer", async () => {
    const user = await makeUser(500);
    const { bookingId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 2000,
    });
    await awardLoyaltyForBooking(bookingId);

    await revokeLoyaltyForBooking(bookingId);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.points).toBe(500);
    expect(after?.lifetimePoints).toBe(500);
  });

  it("ledger'a negatif IPTAL satırı yazar", async () => {
    const user = await makeUser();
    const { bookingId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 1500,
    });
    await awardLoyaltyForBooking(bookingId);

    await revokeLoyaltyForBooking(bookingId);

    const rows = await prisma.pointsLedger.findMany({
      where: { bookingId, reason: "IPTAL" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(-1500);
  });

  it("loyaltyAwardedAt'i temizler ki tekrar ödemede puan yeniden yazılabilsin", async () => {
    const user = await makeUser();
    const { bookingId } = await createTestBooking(prisma, { userId: user.id });
    await awardLoyaltyForBooking(bookingId);

    await revokeLoyaltyForBooking(bookingId);

    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.loyaltyAwardedAt).toBeNull();
  });

  it("kademeyi yeniden hesaplar", async () => {
    const user = await makeUser();
    const { bookingId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 25000, // SILVER eşiği 20000
    });
    await awardLoyaltyForBooking(bookingId);
    const mid = await prisma.user.findUnique({ where: { id: user.id } });
    expect(mid?.tier).toBe("SILVER");

    await revokeLoyaltyForBooking(bookingId);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.tier).toBe("BRONZE");
  });

  it("puanı yazılmamış rezervasyonda hiçbir şey yapmaz", async () => {
    const user = await makeUser(300);
    const { bookingId } = await createTestBooking(prisma, { userId: user.id });

    await revokeLoyaltyForBooking(bookingId);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.points).toBe(300);
  });

  it("idempotenttir — ikinci çağrı bakiyeyi bir daha düşürmez", async () => {
    const user = await makeUser();
    const { bookingId } = await createTestBooking(prisma, {
      userId: user.id,
      totalAmount: 1000,
    });
    await awardLoyaltyForBooking(bookingId);
    await revokeLoyaltyForBooking(bookingId);

    await revokeLoyaltyForBooking(bookingId);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.points).toBe(0);
  });

  it("misafir rezervasyonunda (userId yok) sessizce çıkar", async () => {
    const { bookingId } = await createTestBooking(prisma, { userId: null });

    await expect(revokeLoyaltyForBooking(bookingId)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm test -- lib/__tests__/loyalty-revoke.test.ts`
Expected: FAIL — `revokeLoyaltyForBooking is not a function`

- [ ] **Step 3: `revokeLoyaltyForBooking`'i yaz**

`lib/loyalty.ts` dosyasının sonuna ekle:

```ts
// Rezervasyon iptal/iade edildiğinde yazılmış sadakat puanını geri alır.
// İdempotent: loyaltyAwardedAt null ise hiçbir şey yapmaz.
//
// Geri alınacak miktar Booking.totalAmount'tan DEĞİL, ledger'daki o
// rezervasyona ait KAZANIM satırlarının toplamından okunur — tutar sonradan
// elle değiştirilmiş olabilir ve o zaman bakiye bozulurdu.
export async function revokeLoyaltyForBooking(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;
  if (!booking.userId) return; // misafir rezervasyon → puan yazılmamıştı
  if (!booking.loyaltyAwardedAt) return; // zaten geri alınmış ya da hiç yazılmamış

  const userId = booking.userId;

  await prisma.$transaction(async (tx) => {
    // Yarış durumuna karşı: yalnızca hâlâ işaretliyse geri al.
    const res = await tx.booking.updateMany({
      where: { id: bookingId, loyaltyAwardedAt: { not: null } },
      data: { loyaltyAwardedAt: null },
    });
    if (res.count === 0) return; // başka bir işlem geri almış

    const earned = await tx.pointsLedger.aggregate({
      where: { bookingId, reason: "KAZANIM" },
      _sum: { delta: true },
    });
    const points = earned._sum.delta ?? 0;
    if (points <= 0) return; // yazılmış kazanım yok

    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current) return;

    // Bakiye eksiye düşmesin: puan arada harcanmış olabilir.
    const nextPoints = Math.max(0, current.points - points);
    const nextLifetime = Math.max(0, current.lifetimePoints - points);

    await tx.user.update({
      where: { id: userId },
      data: {
        points: nextPoints,
        lifetimePoints: nextLifetime,
        tier: tierForPoints(nextLifetime),
      },
    });

    await tx.pointsLedger.create({
      data: {
        userId,
        bookingId,
        delta: -points,
        reason: "IPTAL",
        note: `Rezervasyon ${bookingId.slice(-8).toUpperCase()} iptal edildi`,
      },
    });
  });
}
```

`lib/loyalty.ts` başındaki `PointsLedger.reason` açıklamasını da güncelle — `prisma/schema.prisma` içindeki yorumu `// KAZANIM | HOSGELDIN | DUZELTME | IPTAL` yap.

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm test -- lib/__tests__/loyalty-revoke.test.ts`
Expected: PASS — 7 test

- [ ] **Step 5: Doğrula**

Run: `npx tsc --noEmit && npm test`
Expected: tsc temiz, tüm testler geçer.

---

## Task 7: E-posta kabuğunu ortaklaştır

İptal e-postası, hesap e-postalarıyla aynı görünümde olmalı. Kabuk şu an `lib/customer-notifications.ts` içinde özel (private) — ortak bir modüle taşınır.

**Files:**
- Create: `lib/email-layout.ts`
- Modify: `lib/customer-notifications.ts:11-30`

**Interfaces:**
- Consumes: yok
- Produces:
  - `export function emailShell(title: string, body: string): string`
  - `export function emailButton(href: string, label: string): string`

- [ ] **Step 1: Ortak modülü yaz**

`lib/email-layout.ts`:

```ts
// Giden tüm e-postaların ortak HTML kabuğu. Marka renkleri ve yapı tek yerde
// dursun diye ayrıldı — hesap e-postaları (lib/customer-notifications.ts) ve
// rezervasyon bildirimleri (lib/notifications.ts) buradan besleniyor.

const COMPANY = "Gözdem Burak Turizm";

export function emailShell(title: string, body: string): string {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2550">
    <div style="background:#22306a;padding:20px;border-radius:12px 12px 0 0">
      <h1 style="color:#fff;margin:0;font-size:18px">${COMPANY}</h1>
    </div>
    <div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="font-size:16px;margin:0 0 12px">${title}</h2>
      ${body}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Bu e-posta ${COMPANY} tarafından gönderilmiştir. Bu işlemi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
    </div>
  </div>`;
}

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#6a1f34;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;margin:8px 0">${label}</a>`;
}
```

- [ ] **Step 2: `customer-notifications.ts`'i ortak modüle bağla**

`lib/customer-notifications.ts` içindeki yerel `shell` ve `button` fonksiyonlarını **sil** ve importlara ekle:

```ts
import { emailShell as shell, emailButton as button } from "@/lib/email-layout";
```

Gövdedeki `shell(...)` / `button(...)` çağrıları olduğu gibi kalır.

- [ ] **Step 3: Doğrula**

```bash
npx tsc --noEmit
npm test
npm run lint
```

Expected: tsc temiz; testler geçer; `customer-notifications.ts` için yeni lint hatası yok (`COMPANY` sabiti hâlâ kullanılıyorsa kalır, kullanılmıyorsa kaldırılır).

---

## Task 8: İptal e-postası

**Files:**
- Modify: `lib/notifications.ts`

**Interfaces:**
- Consumes: `emailShell`, `emailButton` (Task 7)
- Produces: `export async function sendBookingCancellation(bookingId: string, reason: string, opts?: { refundAmount?: number }): Promise<void>`

- [ ] **Step 1: Import ve HTML kaçışı yardımcısını ekle**

`lib/notifications.ts` importlarına ekle:

```ts
import { emailShell } from "@/lib/email-layout";
```

Dosyadaki diğer yardımcıların (`ref`, `seatText` vb.) yanına ekle:

```ts
// Görevlinin yazdığı serbest metin HTML gövdesine gömülüyor; işaretleri kaçır.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 2: İptal bildirimi fonksiyonunu yaz**

`lib/notifications.ts` dosyasının sonuna ekle:

```ts
// --- İptal bildirimi ---
//
// Görevli panelden rezervasyonu iptal edince müşteriye gider. Gönderen adresi
// .env'deki SMTP_FROM'dur (info@gozdemburakturizm.com olarak ayarlanmalı).
// SMS gönderilmez — iptal gerekçesi uzun metin, e-posta için uygun.
export async function sendBookingCancellation(
  bookingId: string,
  reason: string,
  opts?: { refundAmount?: number }
): Promise<void> {
  const b = (await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tour: { include: { bus: true } },
      departure: { include: { bus: true } },
      boardingPlace: { select: { name: true, boardingTime: true } },
      passengers: true,
    },
  })) as BookingWithTour | null;
  if (!b) return;

  const passengerList = b.passengers.length
    ? `<p style="font-size:14px;color:#475569;margin:4px 0"><strong>Yolcular:</strong> ${seatText(b)}</p>`
    : "";

  const refundLine =
    opts?.refundAmount != null
      ? `<p style="font-size:14px;color:#475569;margin:12px 0 0"><strong>İade tutarı:</strong> ${formatPrice(
          opts.refundAmount,
          b.tour.currency
        )}. Tutar bankanıza bağlı olarak 3-7 iş günü içinde kartınıza yansır.</p>`
      : "";

  const html = emailShell(
    "Rezervasyonunuz iptal edildi",
    `<p style="font-size:14px;color:#475569">Sayın ${b.contactName}, aşağıdaki rezervasyonunuz iptal edilmiştir.</p>
     <div style="background:#f8fafc;border-radius:10px;padding:16px;margin:16px 0">
       <p style="font-size:14px;color:#475569;margin:4px 0"><strong>Rezervasyon No:</strong> ${ref(b)}</p>
       <p style="font-size:14px;color:#475569;margin:4px 0"><strong>Tur:</strong> ${b.tour.title}</p>
       <p style="font-size:14px;color:#475569;margin:4px 0"><strong>Kalkış:</strong> ${fmtDateTime(depDate(b))}</p>
       ${passengerList}
     </div>
     <p style="font-size:14px;color:#475569;margin:0 0 4px"><strong>İptal nedeni:</strong></p>
     <p style="font-size:14px;color:#475569;white-space:pre-wrap;margin:0">${escapeHtml(reason)}</p>
     ${refundLine}
     <p style="font-size:14px;color:#475569;margin-top:20px">Sorularınız için bize ${COMPANY_INFO.phone} numarasından veya ${COMPANY_INFO.email} adresinden ulaşabilirsiniz.</p>`
  );

  await sendEmail(b.contactEmail, `${COMPANY} — Rezervasyon İptali (${ref(b)})`, html);
}
```

- [ ] **Step 3: `COMPANY_INFO` alan adlarını doğrula**

Run: `grep -n "phone\|email" lib/company.ts | head`
Expected: `COMPANY.phone` ve `COMPANY.email` alanlarının gerçek adlarını gör. Farklıysa (örn. `phones` dizi) Step 2'deki satırı gerçek alana göre düzelt.

- [ ] **Step 4: Doğrula**

```bash
npx tsc --noEmit
npm test
```

Expected: tsc temiz, testler geçer.

---

## Task 9: `cancelBookingByAdmin`

**Files:**
- Modify: `lib/booking.ts` (dosya sonu)
- Create: `lib/__tests__/cancel-booking.test.ts`

**Interfaces:**
- Consumes: `revokeLoyaltyForBooking` (Task 6), `sendBookingCancellation` (Task 8), `getTestPrisma`/`createTestBooking` (Task 5)
- Produces: `export async function cancelBookingByAdmin(bookingId: string, reason: string, opts?: { refundAmount?: number; notify?: boolean }): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Failing testi yaz**

`lib/__tests__/cancel-booking.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";
import { cancelBookingByAdmin } from "@/lib/booking";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// E-posta gerçekten gönderilmesin; çağrıldığını doğrulamak yeterli.
// lib/booking.ts bu modülü dinamik import ettiği için mock devreye girer.
const sendCancellation = vi.fn(async () => {});
vi.mock("@/lib/notifications", () => ({
  sendBookingCancellation: (...args: unknown[]) => sendCancellation(...(args as [])),
  sendBookingConfirmation: async () => {},
  sendAgeVerificationRequest: async () => {},
}));

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

describe("cancelBookingByAdmin", () => {
  it("SATILDI koltukları boşa alır", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      status: "ODENDI",
      seatCodes: ["1A", "1B"],
    });

    const res = await cancelBookingByAdmin(bookingId, "Müşteri vazgeçti");

    expect(res.ok).toBe(true);
    const seats = await prisma.seat.findMany({
      where: { departureId, code: { in: ["1A", "1B"] } },
    });
    expect(seats.every((s) => s.status === "BOS")).toBe(true);
    expect(seats.every((s) => s.gender === null)).toBe(true);
  });

  it("KILITLI koltukları da boşa alır", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["2A"],
    });

    await cancelBookingByAdmin(bookingId, "Ödeme gelmedi");

    const seat = await prisma.seat.findFirst({ where: { departureId, code: "2A" } });
    expect(seat?.status).toBe("BOS");
  });

  it("rezervasyonu IPTAL'e çeker", async () => {
    const { bookingId } = await createTestBooking(prisma);

    await cancelBookingByAdmin(bookingId, "Tur iptal oldu");

    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.status).toBe("IPTAL");
  });

  it("aynı seferdeki başka rezervasyonun koltuğuna dokunmaz", async () => {
    const first = await createTestBooking(prisma, { seatCodes: ["1A"] });
    // Aynı sefere ikinci bir rezervasyon ekle.
    await prisma.seat.updateMany({
      where: { departureId: first.departureId, code: "3A" },
      data: { status: "SATILDI", gender: "K" },
    });
    await prisma.booking.create({
      data: {
        tourId: first.tourId,
        departureId: first.departureId,
        status: "ODENDI",
        totalAmount: 1000,
        contactName: "Diğer",
        contactPhone: "5550000000",
        contactEmail: "diger@example.com",
        quantity: 1,
        passengers: { create: [{ firstName: "A", lastName: "B", seatCode: "3A" }] },
      },
    });

    await cancelBookingByAdmin(first.bookingId, "Test");

    const other = await prisma.seat.findFirst({
      where: { departureId: first.departureId, code: "3A" },
    });
    expect(other?.status).toBe("SATILDI");
  });

  it("iptal e-postasını nedeniyle birlikte gönderir", async () => {
    sendCancellation.mockClear();
    const { bookingId } = await createTestBooking(prisma);

    await cancelBookingByAdmin(bookingId, "Otobüs arızası");

    expect(sendCancellation).toHaveBeenCalledWith(bookingId, "Otobüs arızası", undefined);
  });

  it("notify:false ile e-posta göndermez", async () => {
    sendCancellation.mockClear();
    const { bookingId } = await createTestBooking(prisma);

    await cancelBookingByAdmin(bookingId, "Sessiz iptal", { notify: false });

    expect(sendCancellation).not.toHaveBeenCalled();
  });

  it("neden boşsa reddeder", async () => {
    const { bookingId } = await createTestBooking(prisma);

    const res = await cancelBookingByAdmin(bookingId, "   ");

    expect(res.ok).toBe(false);
    expect(res.error).toContain("neden");
  });

  it("zaten iptal edilmişse ikinci çağrı sorun çıkarmaz", async () => {
    const { bookingId } = await createTestBooking(prisma);
    await cancelBookingByAdmin(bookingId, "İlk");

    const res = await cancelBookingByAdmin(bookingId, "İkinci");

    expect(res.ok).toBe(true);
  });

  it("olmayan rezervasyonda hata döndürür", async () => {
    const res = await cancelBookingByAdmin("yok-boyle-bir-id", "Test");

    expect(res.ok).toBe(false);
    expect(res.error).toContain("bulunamadı");
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm test -- lib/__tests__/cancel-booking.test.ts`
Expected: FAIL — `cancelBookingByAdmin is not a function`

- [ ] **Step 3: Fonksiyonu yaz**

`lib/booking.ts` dosyasının sonuna ekle:

```ts
// Görevli tarafından iptal: koltukları DURUMU NE OLURSA OLSUN serbest bırakır,
// rezervasyonu IPTAL'e çeker, sadakat puanını geri alır ve müşteriye bildirir.
//
// cancelBooking()'den farkı: o yalnız KILITLI koltukları açıyor ve ödenmiş
// rezervasyona hiç dokunmuyor (ödeme akışının iptali için doğru davranış).
// Burada ödenmiş rezervasyonun SATILDI koltukları da boşa alınmalı — yoksa
// koltuk sonsuza kadar dolu kalır.
export async function cancelBookingByAdmin(
  bookingId: string,
  reason: string,
  opts?: { refundAmount?: number; notify?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "İptal nedeni yazılmalı." };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { passengers: true },
  });
  if (!booking) return { ok: false, error: "Rezervasyon bulunamadı." };
  if (booking.status === "IPTAL") return { ok: true }; // idempotent

  const seatCodes = booking.passengers
    .map((p) => p.seatCode)
    .filter((c): c is string => !!c);

  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status: "IPTAL" } }),
    ...(seatCodes.length
      ? [
          prisma.seat.updateMany({
            // Yalnız bu rezervasyonun seferindeki koltuklar; aynı kod başka
            // seferde başka müşteride olabilir.
            where: {
              tourId: booking.tourId,
              ...(booking.departureId ? { departureId: booking.departureId } : {}),
              code: { in: seatCodes },
            },
            data: { status: "BOS", gender: null },
          }),
        ]
      : []),
  ]);

  // Puan geri alımı — best-effort, iptali bloklamaz.
  try {
    const { revokeLoyaltyForBooking } = await import("@/lib/loyalty");
    await revokeLoyaltyForBooking(bookingId);
  } catch (e) {
    console.error("[Sadakat puanı geri alma hatası]", e);
  }

  if (opts?.notify !== false) {
    try {
      const { sendBookingCancellation } = await import("@/lib/notifications");
      await sendBookingCancellation(bookingId, trimmed, opts?.refundAmount != null ? { refundAmount: opts.refundAmount } : undefined);
    } catch (e) {
      console.error("[İptal bildirimi hatası]", e);
    }
  }

  return { ok: true };
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm test -- lib/__tests__/cancel-booking.test.ts`
Expected: PASS — 9 test

- [ ] **Step 5: Doğrula**

Run: `npx tsc --noEmit && npm test`
Expected: tsc temiz, tüm testler geçer.

---

## Task 10: Admin eylemi ve iptal düğmesi

**Files:**
- Modify: `lib/admin-actions.ts:904-910` (`setBookingStatus`)
- Create: `components/admin/CancelBookingButton.tsx`
- Modify: `app/admin/(dash)/rezervasyonlar/[id]/page.tsx:331-333`

**Interfaces:**
- Consumes: `cancelBookingByAdmin` (Task 9), `FormState` (`lib/form-state.ts`)
- Produces: `export async function cancelBookingAction(_prev: FormState, fd: FormData): Promise<FormState>`

- [ ] **Step 1: Sunucu eylemini yaz**

`lib/admin-actions.ts` importlarına ekle:

```ts
import { createManualPaidBooking, cancelBookingByAdmin } from "@/lib/booking";
import type { FormState } from "@/lib/form-state";
```

(Mevcut `import { createManualPaidBooking } from "@/lib/booking";` satırı yukarıdakiyle değiştirilir.)

Mevcut `setBookingStatus`'ü şununla değiştir:

```ts
// Durum değişikliği. İPTAL burada ELE ALINMAZ: iptal koltuk boşaltma, puan
// geri alımı ve müşteri bildirimi gerektirdiği için cancelBookingAction'a
// aittir. Buraya "IPTAL" gelirse sessizce yanlış iş yapmak yerine reddediyoruz.
export async function setBookingStatus(id: string, status: string) {
  await requireAdmin();
  if (status === "IPTAL") {
    throw new Error(
      "İptal için cancelBookingAction kullanılmalı (koltuk boşaltma ve bildirim gerekiyor)."
    );
  }
  await prisma.booking.update({ where: { id }, data: { status } });
  revalidatePath("/admin/rezervasyonlar");
  revalidatePath(`/admin/rezervasyonlar/${id}`);
}

// Görevli iptali: koltuğu serbest bırakır, puanı geri alır, müşteriye
// gerekçeli iptal e-postası gönderir. useActionState imzası.
export async function cancelBookingAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();

  const bookingId = String(fd.get("bookingId") ?? "").trim();
  const reason = String(fd.get("reason") ?? "").trim();
  if (!bookingId) return { ok: false, error: "Rezervasyon belirtilmedi." };
  if (!reason) return { ok: false, error: "İptal nedeni yazılmalı — bu metin müşteriye gidiyor." };

  const res = await cancelBookingByAdmin(bookingId, reason);
  if (!res.ok) return { ok: false, error: res.error ?? "İptal edilemedi." };

  revalidatePath("/admin/rezervasyonlar");
  revalidatePath(`/admin/rezervasyonlar/${bookingId}`);
  revalidatePath("/");

  return {
    ok: true,
    message: "Rezervasyon iptal edildi, koltuklar serbest bırakıldı ve müşteriye bilgi e-postası gönderildi.",
  };
}
```

- [ ] **Step 2: İptal düğmesi bileşenini yaz**

`components/admin/CancelBookingButton.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { cancelBookingAction } from "@/lib/admin-actions";
import type { FormState } from "@/lib/form-state";

// Rezervasyon iptali. Neden alanı zorunlu çünkü metin müşteriye giden
// e-postada aynen yer alıyor — görevli ne yazdığını görerek yazsın diye
// düğmeye basınca açılan bir panelde isteniyor.
export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    cancelBookingAction,
    {}
  );

  if (state.ok) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        {state.message}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        İptal et
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2 rounded-lg border border-red-100 bg-red-50/50 p-3">
      <input type="hidden" name="bookingId" value={bookingId} />

      <label className="block text-xs font-medium text-slate-600">
        İptal nedeni *
        <textarea
          name="reason"
          required
          rows={3}
          placeholder="Örn. Hava koşulları nedeniyle sefer iptal edilmiştir."
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <p className="text-xs text-slate-500">
        Bu metin müşteriye gönderilecek iptal e-postasında aynen yer alır.
      </p>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button
          disabled={pending}
          className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "İptal ediliyor…" : "İptal Et ve Müşteriye Bildir"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white disabled:opacity-60"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Detay sayfasına bağla**

`app/admin/(dash)/rezervasyonlar/[id]/page.tsx` importlarına ekle:

```tsx
import CancelBookingButton from "@/components/admin/CancelBookingButton";
```

Şu satırları:

```tsx
              {b.status !== "IPTAL" && (
                <StatusForm id={b.id} status="IPTAL" label="İptal et" />
              )}
```

bununla değiştir:

```tsx
              {b.status !== "IPTAL" && <CancelBookingButton bookingId={b.id} />}
```

- [ ] **Step 4: Doğrula**

```bash
npx tsc --noEmit
npm test
npm run lint
```

Expected: tsc temiz; testler geçer; yeni lint hatası yok.

- [ ] **Step 5: Tarayıcıda elle doğrula**

```bash
DATABASE_URL="file:./dev.db" npm run dev
```

`http://localhost:3000/admin` → giriş yap → Rezervasyonlar → ödenmiş bir rezervasyonu aç → "İptal et" → neden yaz → gönder.

Expected:
- Yeşil onay mesajı görünür
- Rezervasyon durumu `İptal`
- `/admin/turlar/<tur>/koltuklar` sayfasında o koltuklar **yeşil (boş)**
- Terminalde `[E-POSTA · simülasyon] → ...` satırı (SMTP yapılandırılmadığı için) ve konusu `Rezervasyon İptali`

---

## Task 11: `refundBooking`'i ortak iptal yoluna bağla

`lib/payment-actions.ts` kendi satır içi koltuk boşaltma kopyasını taşıyor. İade sonrası da aynı iptal e-postası gitmeli ve puan geri alınmalı.

**Files:**
- Modify: `lib/payment-actions.ts` (`refundBooking` sonundaki transaction bloğu)

**Interfaces:**
- Consumes: `cancelBookingByAdmin` (Task 9)
- Produces: yok

- [ ] **Step 1: İade sonrası bloğu değiştir**

`lib/payment-actions.ts` importlarına ekle:

```ts
import { markBookingPaid, cancelBooking, cancelBookingByAdmin } from "@/lib/booking";
```

(Mevcut `import { markBookingPaid, cancelBooking } from "@/lib/booking";` satırı yukarıdakiyle değiştirilir.)

Şu bloğu:

```ts
  // iyzico parayı geri verdi — rezervasyonu iptale çek, koltukları boşalt.
  // cancelBooking() ödenmiş rezervasyonu reddettiği ve yalnızca KILITLI
  // koltukları açtığı için burada SATILDI koltukları elle serbest bırakıyoruz.
  const seatCodes = booking.passengers
    .map((p) => p.seatCode)
    .filter((c): c is string => !!c);

  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status: "IPTAL" } }),
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "IADE",
        refundedAt: new Date(),
        refundRef: ref ?? null,
        errorCode: null,
        errorMessage: null,
      },
    }),
    ...(seatCodes.length
      ? [
          prisma.seat.updateMany({
            where: {
              tourId: booking.tourId,
              ...(booking.departureId ? { departureId: booking.departureId } : {}),
              code: { in: seatCodes },
            },
            data: { status: "BOS", gender: null },
          }),
        ]
      : []),
  ]);
```

bununla değiştir:

```ts
  // iyzico parayı geri verdi — ödeme kaydını kapat.
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "IADE",
      refundedAt: new Date(),
      refundRef: ref ?? null,
      errorCode: null,
      errorMessage: null,
    },
  });

  // Rezervasyonu iptale çek: koltuk boşaltma, puan geri alımı ve müşteri
  // bildirimi tek yerde (lib/booking.ts) toplandı.
  await cancelBookingByAdmin(bookingId, "Ödemeniz tarafımızca iade edilmiştir.", {
    refundAmount: amount,
  });
```

- [ ] **Step 2: Kullanılmayan kalıntıları temizle**

Run: `npx tsc --noEmit && npm run lint`
Expected: Eğer `cancelBooking` importu artık kullanılmıyorsa lint uyarısı çıkar — kullanılıp kullanılmadığını kontrol et:

Run: `grep -n "cancelBooking(" lib/payment-actions.ts`
`simulateCancel` hâlâ kullanıyorsa import kalır; kullanmıyorsa importtan çıkar.

- [ ] **Step 3: Doğrula**

```bash
npx tsc --noEmit
npm test
npm run lint
```

Expected: tsc temiz; testler geçer; yeni lint hatası yok.

---

## Task 12: Bütünsel doğrulama ve dağıtım notu

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-admin-paneli-ciro-iptal-koltuk-odeme-design.md` (Aşama 1 tamamlandı işareti)

- [ ] **Step 1: Tüm kapıları çalıştır**

```bash
npx tsc --noEmit
npm test
npm run lint
```

Expected: tsc temiz; tüm testler geçer; lint'te **yeni** hata yok (mevcut hatalar bu planın kapsamı dışında).

- [ ] **Step 2: Üretim build'i**

```bash
DATABASE_URL="file:./dev.db" npm run build
```

Expected: build başarılı.

> Build `.venv` bozuk sembolik bağı yüzünden kırılırsa önce `ls -la .venv` ile kontrol et; bozuk bağ varsa geçici olarak taşı (`mv .venv /tmp/venv-backup`), build'i çalıştır, sonra geri koy.

- [ ] **Step 3: Çoklu sefer senaryosunu uçtan uca doğrula**

```bash
cp dev.db /tmp/gbt-e2e.db
sqlite3 /tmp/gbt-e2e.db "DELETE FROM Seat WHERE departureId IN (SELECT id FROM TourDeparture WHERE sortOrder > 0);"
sqlite3 /tmp/gbt-e2e.db 'CREATE UNIQUE INDEX "Seat_tourId_code_key" ON "Seat"("tourId","code");'
DATABASE_URL="file:/tmp/gbt-e2e.db" npx tsx scripts/deploy-migrate.ts
DATABASE_URL="file:/tmp/gbt-e2e.db" npm run dev
```

Tarayıcıda: `/admin/turlar` → çok seferli bir tur aç → yeni bir sefer ekle → Kaydet.

Expected: **500 yok**, `/admin/turlar` listesine dönüyor, yeni seferin koltukları `/admin/turlar/<id>/koltuklar` sayfasında görünüyor.

Temizle: `rm -f /tmp/gbt-e2e.db`

- [ ] **Step 4: Dağıtım talimatını kullanıcıya ilet**

Aşama 1'in canlıda etkili olması için **dağıtımdan sonra** şu komut bir kez çalıştırılmalı:

```bash
DATABASE_URL="file:/var/www/gbt/data/prod.db" npx tsx scripts/deploy-migrate.ts
```

Beklenen çıktıda şu satırlar görünmeli:
- `- eski benzersiz indeks düşürüldü: Seat_tourId_code_key`
- `== 7. Koltuksuz seferler ==` (varsa onarılan sefer listesi)

Ayrıca `.env` içinde şu ayar doğrulanmalı — iptal e-postalarının göndereni buradan geliyor:

```
SMTP_FROM=info@gozdemburakturizm.com
```

Bu ayar yoksa `lib/notify.ts:73` gereği `SMTP_USER` adresi gönderen olarak kullanılır.

- [ ] **Step 5: Spec'i güncelle**

`docs/superpowers/specs/2026-10-10-admin-paneli-ciro-iptal-koltuk-odeme-design.md` başındaki `**Durum:**` satırını şöyle yap:

```
**Durum:** Aşama 1 tamamlandı · Aşama 2-4 planlanmayı bekliyor
```

---

## Sonraki aşamalar

Bu plan yalnızca Aşama 1'i kapsar. Kalan üç aşama kendi planlarını alacak:

- **Aşama 2** — Otobüs koltuk düzeni (`Bus.seatLabels`, `Seat.label`, önizleme sadeleştirme)
- **Aşama 3** — Ciro grafiği ve hızlı işlem düğmeleri
- **Aşama 4** — Gömülü iyzico kart akışı, e-posta→üye eşleşmesi, KVKK rızası

Her biri kendi şema değişikliklerini hem `prisma/schema.prisma` hem `scripts/deploy-migrate.ts` tarafına yazmak zorundadır — Aşama 1'in düzelttiği hatanın kaynağı tam olarak bu kuralın atlanmasıydı.
