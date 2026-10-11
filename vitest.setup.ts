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
