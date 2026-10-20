# Paraşüt e-Arşiv Fatura Entegrasyonu — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iyzico ile satılan biletlere tur başladıktan sonra otomatik e-Arşiv faturası kesmek ve faturayı müşteriye PDF ekli e-postayla göndermek.

**Architecture:** Mevcut iyzico katmanlaması birebir izlenir: `lib/parasut.ts` saf HTTP (OAuth + JSON:API), `lib/parasut-invoice.ts` iş mantığı, `app/api/cron/faturalar` zamanlayıcı ucu. Durum ayrı bir `Invoice` tablosunda tutulur (`Payment` deseni); her boru hattı adımının sonucu kalıcı yazıldığı için iş yarıda kalırsa kaldığı yerden devam eder ve mükerrer fatura kesilmez.

**Tech Stack:** Next.js 16 (App Router, Turbopack), Prisma 7 + SQLite, TypeScript, Vitest, nodemailer.

**Spec:** `docs/superpowers/specs/2026-10-13-parasut-fatura-entegrasyonu-design.md`

## Global Constraints

- Tüm kullanıcıya görünen metinler ve kod yorumları **Türkçe**.
- Para birimi kodu Paraşüt'te **`TRL`** (TRY değil). v1 yalnız TRY turları faturalanır.
- Yalnız `paymentMethod` ∈ {`ONLINE`, `KREDI_KARTI`} ve `status = ODENDI` rezervasyonlar.
- Tetikleyici: kalkış tarihi geçmiş olmalı (`departureDate <= now`).
- `attempts >= 5` olan kayıt otomatik denenmez.
- Her çalışmada en fazla **50** fatura; Paraşüt hız sınırı ~10 istek/10 saniye.
- Anahtar yoksa (`isParasutConfigured() === false`) işler sessizce boş döner — testler ve yerel geliştirme anahtarsız çalışmalı.
- Hata mesajları veritabanına yazılırken **500 karaktere** kırpılır.
- `git` işlemleri kullanıcıya aittir — commit adımları plandadır ama **ajan commit atmaz**, kullanıcı atar.
- Test dosyaları `lib/**/*.test.ts` altında olmalı (vitest `include` deseni).

---

## Dosya Yapısı

| Dosya | Sorumluluk |
|---|---|
| `lib/parasut.ts` | **Yeni.** Saf HTTP: yapılandırma, `ParasutError`, OAuth token önbelleği, JSON:API istekleri, kaynak uçları. İş kuralı bilmez. |
| `lib/parasut-invoice.ts` | **Yeni.** İş mantığı: rezervasyon → fatura gövdesi dönüşümü, boru hattı, aday tarayıcı. |
| `app/api/cron/faturalar/route.ts` | **Yeni.** `CRON_SECRET` korumalı tetikleyici. |
| `lib/__tests__/parasut.test.ts` | **Yeni.** Saf fonksiyonlar + mock `fetch`. |
| `lib/__tests__/parasut-invoice.test.ts` | **Yeni.** Boru hattı, gerçek DB + mock HTTP katmanı. |
| `prisma/schema.prisma` | `Invoice` modeli, `Booking.invoicePassengerIndex`. |
| `scripts/deploy-migrate.ts` | Canlı göç: tablo + kolon. |
| `lib/notify.ts` | `sendEmail`'e opsiyonel ek (attachment) desteği. |
| `lib/booking.ts` | `CreateBookingInput.invoicePassengerIndex` + kayda yazma. |
| `lib/checkout-actions.ts` | Form alanını okuyup `createPendingBooking`'e geçirme. |
| `components/CheckoutForm.tsx` | "Fatura bu kişiye kesilsin" seçimi. |
| `app/admin/(dash)/rezervasyonlar/[id]/page.tsx` | Fatura bölümü. |
| `components/admin/InvoiceRetryButton.tsx` | **Yeni.** "Yeniden dene" düğmesi. |
| `lib/invoice-actions.ts` | **Yeni.** Yeniden deneme server action'ı. |

---

## Task 1: Veritabanı şeması ve göç

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `scripts/deploy-migrate.ts`
- Test: `lib/__tests__/parasut-invoice.test.ts` (oluştur)

**Interfaces:**
- Consumes: —
- Produces: `Invoice` modeli (alanlar: `id`, `bookingId`, `provider`, `contactId`, `invoiceId`, `eArchiveId`, `status`, `attempts`, `errorMessage`, `emailSentAt`, `createdAt`, `updatedAt`); `Booking.invoicePassengerIndex: number | null`; `Booking.invoice` ilişkisi.

- [ ] **Step 1: Şemaya `Invoice` modelini ekle**

`prisma/schema.prisma` sonuna ekle:

```prisma
// Kesilen/kesilecek fatura kaydı. Payment modeliyle aynı mantık: deneme ve
// sonucu Booking'e kolon olarak değil kendi tablosunda tutulur, böylece ara
// durumlar (fatura kesildi ama e-Arşiv gönderilemedi) temsil edilebilir.
model Invoice {
  id           String    @id @default(cuid())
  bookingId    String    @unique // mükerrer faturaya DB seviyesinde engel
  booking      Booking   @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  provider     String    @default("PARASUT")
  contactId    String? // Paraşüt cari id
  invoiceId    String? // Paraşüt sales_invoice id — oluşur oluşmaz yazılır
  eArchiveId   String? // Paraşüt e_archive id
  status       String    @default("BEKLIYOR") // BEKLIYOR | KESILDI | GONDERILDI | BASARISIZ | ELLE
  attempts     Int       @default(0)
  errorMessage String?
  emailSentAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

- [ ] **Step 2: `Booking`'e alan ve ilişki ekle**

`prisma/schema.prisma` içindeki `model Booking` bloğunda, `consentIp` satırının altına ekle:

```prisma
  // Fatura hangi yolcu adına kesilecek (0 tabanlı sıra). roomIndex ile aynı
  // konvansiyon: yolcular iç içe oluşturulduğu için form aşamasında id yok.
  invoicePassengerIndex Int?
```

Aynı bloktaki `passengers Passenger[]` satırının altına ekle:

```prisma
  invoice    Invoice?
```

- [ ] **Step 3: Yerel veritabanına uygula ve istemciyi üret**

```bash
DATABASE_URL="file:./dev.db" npx prisma db push
npx prisma generate
```

Beklenen: `Your database is now in sync with your Prisma schema.` ve `Generated Prisma Client`.

**ÖNEMLİ:** Çalışan `npm run dev` varsa durdur ve yeniden başlat. `lib/db.ts` istemciyi `globalThis` üzerinde önbelleğe alıyor; yeniden başlatmadan `prisma.invoice` `undefined` kalır.

- [ ] **Step 4: Göç script'ine tablo ve kolonu ekle**

`scripts/deploy-migrate.ts` içinde `ExcelTemplate` bloğunun hemen altına ekle:

```ts
  // Fatura kayıtları (Paraşüt e-Arşiv entegrasyonu).
  if (!(await tableExists("Invoice"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Invoice" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "bookingId" TEXT NOT NULL,
        "provider" TEXT NOT NULL DEFAULT 'PARASUT',
        "contactId" TEXT,
        "invoiceId" TEXT,
        "eArchiveId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'BEKLIYOR',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "errorMessage" TEXT,
        "emailSentAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId")
          REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "Invoice_bookingId_key" ON "Invoice"("bookingId")`
    );
    console.log("  + Invoice tablosu");
  } else {
    console.log("  = Invoice tablosu zaten var");
  }
```

Aynı dosyada `// Booking` yorumlu kolon grubunun sonuna (`consentIp` satırının altına) ekle:

```ts
  await add("Booking", "invoicePassengerIndex", `"invoicePassengerIndex" INTEGER`);
```

- [ ] **Step 5: Şema testini yaz**

`lib/__tests__/parasut-invoice.test.ts` oluştur:

```ts
import { describe, it, expect } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";

describe("Invoice şeması", () => {
  it("rezervasyona fatura kaydı bağlanabilir", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);

    const invoice = await prisma.invoice.create({
      data: { bookingId, status: "BEKLIYOR" },
    });

    expect(invoice.provider).toBe("PARASUT");
    expect(invoice.attempts).toBe(0);
    expect(invoice.status).toBe("BEKLIYOR");
  });

  it("aynı rezervasyona ikinci fatura kaydı açılamaz", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);

    await prisma.invoice.create({ data: { bookingId } });

    await expect(
      prisma.invoice.create({ data: { bookingId } })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Testleri çalıştır**

Run: `npx vitest run lib/__tests__/parasut-invoice.test.ts`
Expected: 2 passed.

- [ ] **Step 7: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: çıktı yok, çıkış kodu 0.

- [ ] **Step 8: Commit (kullanıcı atar)**

```bash
git add prisma/schema.prisma scripts/deploy-migrate.ts lib/__tests__/parasut-invoice.test.ts
git commit -m "feat(fatura): Invoice modeli ve fatura alıcısı alanı"
```

---

## Task 2: `lib/parasut.ts` — yapılandırma, hata tipi, OAuth token

**Files:**
- Create: `lib/parasut.ts`
- Create: `lib/__tests__/parasut.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `parasutBaseUrl(): string`
  - `parasutCredentials(): ParasutCredentials | null` — `{ clientId, clientSecret, username, password, companyId }`
  - `isParasutConfigured(): boolean`
  - `class ParasutError extends Error` — `{ path: string; status: number }`
  - `parasutKdvOrani(): number`
  - `__resetParasutTokenCache(): void` (yalnız test)
  - `accessToken(): Promise<string>` (modül içi, Task 3 kullanır)

- [ ] **Step 1: Testi yaz**

`lib/__tests__/parasut.test.ts` oluştur:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parasutBaseUrl,
  parasutCredentials,
  isParasutConfigured,
  parasutKdvOrani,
  ParasutError,
  __resetParasutTokenCache,
  __accessTokenForTest,
} from "@/lib/parasut";

const ENV_KEYS = [
  "PARASUT_BASE_URL",
  "PARASUT_CLIENT_ID",
  "PARASUT_CLIENT_SECRET",
  "PARASUT_USERNAME",
  "PARASUT_PASSWORD",
  "PARASUT_COMPANY_ID",
  "PARASUT_KDV_ORANI",
] as const;

const saved: Record<string, string | undefined> = {};

function setCreds() {
  process.env.PARASUT_BASE_URL = "https://api.heroku-staging.parasut.com";
  process.env.PARASUT_CLIENT_ID = "cid";
  process.env.PARASUT_CLIENT_SECRET = "csecret";
  process.env.PARASUT_USERNAME = "user@example.com";
  process.env.PARASUT_PASSWORD = "sifre";
  process.env.PARASUT_COMPANY_ID = "12345";
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  __resetParasutTokenCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  __resetParasutTokenCache();
});

describe("yapılandırma", () => {
  it("anahtar yoksa yapılandırılmamış sayılır", () => {
    expect(parasutCredentials()).toBeNull();
    expect(isParasutConfigured()).toBe(false);
  });

  it("tüm anahtarlar varsa yapılandırılmış sayılır", () => {
    setCreds();
    expect(isParasutConfigured()).toBe(true);
    expect(parasutCredentials()?.companyId).toBe("12345");
  });

  it("tek bir anahtar eksikse yapılandırılmamış sayılır", () => {
    setCreds();
    delete process.env.PARASUT_COMPANY_ID;
    expect(isParasutConfigured()).toBe(false);
  });

  it("base URL sondaki eğik çizgiyi atar", () => {
    process.env.PARASUT_BASE_URL = "https://api.heroku-staging.parasut.com/";
    expect(parasutBaseUrl()).toBe("https://api.heroku-staging.parasut.com");
  });

  it("base URL yoksa üretim adresine düşer", () => {
    expect(parasutBaseUrl()).toBe("https://api.parasut.com");
  });

  it("KDV oranı tanımsızsa 0 döner", () => {
    expect(parasutKdvOrani()).toBe(0);
  });

  it("KDV oranı env'den okunur", () => {
    process.env.PARASUT_KDV_ORANI = "20";
    expect(parasutKdvOrani()).toBe(20);
  });

  it("geçersiz KDV oranı 0 sayılır", () => {
    process.env.PARASUT_KDV_ORANI = "abc";
    expect(parasutKdvOrani()).toBe(0);
  });
});

describe("accessToken", () => {
  it("password grant ile token alır", async () => {
    setCreds();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "tok-1", expires_in: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await __accessTokenForTest();

    expect(token).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.heroku-staging.parasut.com/oauth/token");
    const body = JSON.parse(init.body as string);
    expect(body.grant_type).toBe("password");
    expect(body.redirect_uri).toBe("urn:ietf:wg:oauth:2.0:oob");
    expect(body.username).toBe("user@example.com");
  });

  it("geçerli token'ı önbellekten verir, ikinci kez istek atmaz", async () => {
    setCreds();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "tok-1", expires_in: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await __accessTokenForTest();
    await __accessTokenForTest();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("token alınamazsa ParasutError fırlatır", async () => {
    setCreds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 })
      )
    );

    await expect(__accessTokenForTest()).rejects.toBeInstanceOf(ParasutError);
  });

  it("anahtar yoksa ParasutError fırlatır", async () => {
    await expect(__accessTokenForTest()).rejects.toBeInstanceOf(ParasutError);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npx vitest run lib/__tests__/parasut.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/parasut"`.

- [ ] **Step 3: `lib/parasut.ts`'i yaz**

```ts
// Paraşüt API istemcisi — saf HTTP katmanı.
//
// Bu dosya iş kuralı bilmez: Prisma, rezervasyon, fatura kavramı buraya girmez.
// Tek işi Paraşüt'e kimlik doğrulamalı istek atıp tipli yanıt döndürmek.
// İş mantığı lib/parasut-invoice.ts içinde.
//
// Kimlik doğrulama: OAuth2 "password" grant. Paraşüt'ün kendi istemcisinin
// kullandığı akış; redirect_uri sahte bir değerdir (oob). authorization_code
// tercih edilmedi: arka plan işi insan müdahalesi olmadan çalışmalı ve
// saklanan refresh_token bir gün sessizce geçersizleşirse faturalar durur.
//
// Yol yapısı: {base}/v4/{company_id}/{kaynak}
// Doküman: https://apidocs.parasut.com/

const DEFAULT_BASE_URL = "https://api.parasut.com";

// Staging'e geçmek için PARASUT_BASE_URL=https://api.heroku-staging.parasut.com
export function parasutBaseUrl(): string {
  const raw = process.env.PARASUT_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export interface ParasutCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  companyId: string;
}

export function parasutCredentials(): ParasutCredentials | null {
  const clientId = process.env.PARASUT_CLIENT_ID?.trim();
  const clientSecret = process.env.PARASUT_CLIENT_SECRET?.trim();
  const username = process.env.PARASUT_USERNAME?.trim();
  const password = process.env.PARASUT_PASSWORD?.trim();
  const companyId = process.env.PARASUT_COMPANY_ID?.trim();
  if (!clientId || !clientSecret || !username || !password || !companyId) {
    return null;
  }
  return { clientId, clientSecret, username, password, companyId };
}

export function isParasutConfigured(): boolean {
  return parasutCredentials() !== null;
}

// KDV oranı faturaya yazılır. Staging'de serbest; CANLIYA GEÇMEDEN mali
// müşavire teyit ettirilmeli. Geçersiz değer sessizce 0 sayılır — fatura
// kesilmemesindense sıfır oranla kesilmesi yeğdir, hata panelde görünür.
export function parasutKdvOrani(): number {
  const raw = Number(process.env.PARASUT_KDV_ORANI);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

export class ParasutError extends Error {
  readonly path: string;
  readonly status: number;
  constructor(message: string, path: string, status: number) {
    super(message);
    this.name = "ParasutError";
    this.path = path;
    this.status = status;
  }
}

// ── Token ───────────────────────────────────────────────────────────────────
//
// Token ~2 saat geçerli. Süreç belleğinde tutuluyor: her istekte yeniden almak
// hız sınırını (10 istek/10 sn) boşa harcar. Süreye %10 pay bırakıyoruz ki
// istek tam sınırda yola çıkıp sunucuda süresi dolmuş sayılmasın.

let cachedToken: { value: string; expiresAt: number } | null = null;

// Yalnız test için — modül durumunu sıfırlar.
export function __resetParasutTokenCache(): void {
  cachedToken = null;
}

const TOKEN_PATH = "/oauth/token";

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const creds = parasutCredentials();
  if (!creds) {
    throw new ParasutError("Paraşüt anahtarları tanımlı değil.", TOKEN_PATH, 0);
  }

  let res: Response;
  try {
    res = await fetch(`${parasutBaseUrl()}${TOKEN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "password",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        username: creds.username,
        password: creds.password,
        redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
      }),
      cache: "no-store",
    });
  } catch (e) {
    throw new ParasutError(
      `Paraşüt servisine ulaşılamadı: ${e instanceof Error ? e.message : String(e)}`,
      TOKEN_PATH,
      0
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ParasutError(
      `Paraşüt kimlik doğrulaması başarısız (HTTP ${res.status}): ${text.slice(0, 200)}`,
      TOKEN_PATH,
      res.status
    );
  }

  let json: { access_token?: string; expires_in?: number };
  try {
    json = JSON.parse(text);
  } catch {
    throw new ParasutError(
      `Paraşüt beklenmeyen token yanıtı döndürdü (HTTP ${res.status}).`,
      TOKEN_PATH,
      res.status
    );
  }

  if (!json.access_token) {
    throw new ParasutError("Paraşüt token döndürmedi.", TOKEN_PATH, res.status);
  }

  const ttlMs = (json.expires_in ?? 7200) * 900; // saniye → ms, %10 pay
  cachedToken = { value: json.access_token, expiresAt: Date.now() + ttlMs };
  return json.access_token;
}

// Yalnız test için — accessToken modül içi kalsın ama sınanabilsin.
export function __accessTokenForTest(): Promise<string> {
  return accessToken();
}
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `npx vitest run lib/__tests__/parasut.test.ts`
Expected: 12 passed.

- [ ] **Step 5: Commit (kullanıcı atar)**

```bash
git add lib/parasut.ts lib/__tests__/parasut.test.ts
git commit -m "feat(parasut): yapılandırma, hata tipi ve OAuth token katmanı"
```

---

## Task 3: `lib/parasut.ts` — JSON:API istek yardımcısı ve kaynak uçları

**Files:**
- Modify: `lib/parasut.ts`
- Modify: `lib/__tests__/parasut.test.ts`

**Interfaces:**
- Consumes: Task 2 — `accessToken()`, `ParasutError`, `parasutBaseUrl()`, `parasutCredentials()`
- Produces:
  - `findContactIdByTaxNumber(taxNumber: string): Promise<string | null>`
  - `createContact(input: { name: string; taxNumber: string; email: string; phone?: string }): Promise<string>`
  - `createSalesInvoice(input: SalesInvoiceInput): Promise<string>` — `SalesInvoiceInput = { contactId: string; description: string; issueDate: string; currency: string; quantity: number; unitPrice: number; vatRate: number }`
  - `createEArchive(salesInvoiceId: string): Promise<string>`
  - `fetchEArchivePdf(eArchiveId: string): Promise<Buffer>`

- [ ] **Step 1: Testleri ekle**

`lib/__tests__/parasut.test.ts` sonuna ekle (mevcut `beforeEach`/`afterEach` geçerli):

```ts
import {
  findContactIdByTaxNumber,
  createContact,
  createSalesInvoice,
  createEArchive,
} from "@/lib/parasut";

// Önce token, sonra asıl istek — iki aşamalı mock.
function mockFetchSequence(responses: Response[]) {
  const fetchMock = vi.fn();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function tokenResponse() {
  return new Response(
    JSON.stringify({ access_token: "tok-1", expires_in: 7200 }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("kaynak uçları", () => {
  it("cari aramasında TCKN filtresi kullanır ve id döner", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: [{ id: "c-99", type: "contacts" }] }),
    ]);

    const id = await findContactIdByTaxNumber("12345678901");

    expect(id).toBe("c-99");
    const [url] = fetchMock.mock.calls[1] as unknown as [string];
    expect(url).toContain("/v4/12345/contacts");
    expect(url).toContain("filter%5Btax_number%5D=12345678901");
  });

  it("cari bulunamazsa null döner", async () => {
    setCreds();
    mockFetchSequence([tokenResponse(), jsonResponse({ data: [] })]);
    expect(await findContactIdByTaxNumber("12345678901")).toBeNull();
  });

  it("cari oluşturur ve id döner", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "c-1", type: "contacts" } }),
    ]);

    const id = await createContact({
      name: "Ahmet Yılmaz",
      taxNumber: "12345678901",
      email: "a@example.com",
    });

    expect(id).toBe("c-1");
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.type).toBe("contacts");
    expect(body.data.attributes.contact_type).toBe("person");
    expect(body.data.attributes.account_type).toBe("customer");
    expect(body.data.attributes.tax_number).toBe("12345678901");
  });

  it("satış faturası gövdesini doğru kurar", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "inv-1", type: "sales_invoices" } }),
    ]);

    const id = await createSalesInvoice({
      contactId: "c-1",
      description: "Test Turu (12.08.2026 kalkışlı)",
      issueDate: "2026-08-13",
      currency: "TRL",
      quantity: 3,
      unitPrice: 500,
      vatRate: 0,
    });

    expect(id).toBe("inv-1");
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.attributes.item_type).toBe("invoice");
    expect(body.data.attributes.currency).toBe("TRL");
    expect(body.data.relationships.contact.data.id).toBe("c-1");
    const detail = body.data.relationships.details.data[0];
    expect(detail.type).toBe("sales_invoice_details");
    expect(detail.attributes.quantity).toBe(3);
    expect(detail.attributes.unit_price).toBe(500);
    expect(detail.attributes.vat_rate).toBe(0);
  });

  it("e-Arşiv kaydı faturaya bağ verir", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "ea-1", type: "e_archives" } }),
    ]);

    const id = await createEArchive("inv-1");

    expect(id).toBe("ea-1");
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.type).toBe("e_archives");
    expect(body.data.relationships.sales_invoice.data.id).toBe("inv-1");
    expect(body.data.relationships.sales_invoice.data.type).toBe("sales_invoices");
  });

  it("API hatasında ParasutError fırlatır ve mesajı taşır", async () => {
    setCreds();
    mockFetchSequence([
      tokenResponse(),
      jsonResponse(
        { errors: [{ title: "Geçersiz vergi numarası" }] },
        422
      ),
    ]);

    await expect(createEArchive("inv-1")).rejects.toThrow(/Geçersiz vergi numarası/);
  });
});
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npx vitest run lib/__tests__/parasut.test.ts`
Expected: FAIL — `findContactIdByTaxNumber is not a function` benzeri.

- [ ] **Step 3: İstek yardımcısını ve kaynak uçlarını ekle**

`lib/parasut.ts` sonuna ekle:

```ts
// ── İstek gönderimi ─────────────────────────────────────────────────────────

// Paraşüt JSON:API kullanıyor: hatalar `errors[].title` altında gelir.
function errorText(text: string, status: number): string {
  try {
    const json = JSON.parse(text) as {
      errors?: { title?: string; detail?: string }[];
    };
    const first = json.errors?.[0];
    const msg = first?.detail ?? first?.title;
    if (msg) return msg;
  } catch {
    // JSON değilse ham metne düşülür
  }
  return `Paraşüt isteği başarısız (HTTP ${status}): ${text.slice(0, 200)}`;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const creds = parasutCredentials();
  if (!creds) throw new ParasutError("Paraşüt anahtarları tanımlı değil.", path, 0);

  const token = await accessToken();
  const url = `${parasutBaseUrl()}/v4/${creds.companyId}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
  } catch (e) {
    throw new ParasutError(
      `Paraşüt servisine ulaşılamadı: ${e instanceof Error ? e.message : String(e)}`,
      path,
      0
    );
  }

  const text = await res.text();
  if (!res.ok) throw new ParasutError(errorText(text, res.status), path, res.status);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ParasutError(
      `Paraşüt beklenmeyen yanıt döndürdü (HTTP ${res.status}).`,
      path,
      res.status
    );
  }
}

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

// ── Cari (contacts) ─────────────────────────────────────────────────────────

// Her rezervasyon için yeni cari açmak muhasebeyi kirletir; önce TCKN ile
// aranır. Bulunamazsa createContact ile açılır.
export async function findContactIdByTaxNumber(
  taxNumber: string
): Promise<string | null> {
  const query = new URLSearchParams({ "filter[tax_number]": taxNumber });
  const json = await request<{ data: JsonApiResource[] }>(
    "GET",
    `/contacts?${query.toString()}`
  );
  return json.data?.[0]?.id ?? null;
}

export async function createContact(input: {
  name: string;
  taxNumber: string;
  email: string;
  phone?: string;
}): Promise<string> {
  const json = await request<{ data: JsonApiResource }>("POST", "/contacts", {
    data: {
      type: "contacts",
      attributes: {
        name: input.name,
        contact_type: "person", // bireysel müşteri: TCKN tax_number alanına yazılır
        account_type: "customer",
        tax_number: input.taxNumber,
        email: input.email,
        ...(input.phone ? { phone: input.phone } : {}),
      },
    },
  });
  return json.data.id;
}

// ── Satış faturası ──────────────────────────────────────────────────────────

export interface SalesInvoiceInput {
  contactId: string;
  description: string;
  issueDate: string; // yyyy-mm-dd
  currency: string; // Paraşüt kodu — TL için "TRL"
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export async function createSalesInvoice(
  input: SalesInvoiceInput
): Promise<string> {
  const json = await request<{ data: JsonApiResource }>(
    "POST",
    "/sales_invoices",
    {
      data: {
        type: "sales_invoices",
        attributes: {
          item_type: "invoice",
          description: input.description,
          issue_date: input.issueDate,
          currency: input.currency,
        },
        relationships: {
          contact: { data: { id: input.contactId, type: "contacts" } },
          details: {
            data: [
              {
                type: "sales_invoice_details",
                attributes: {
                  quantity: input.quantity,
                  unit_price: input.unitPrice,
                  vat_rate: input.vatRate,
                  description: input.description,
                },
              },
            ],
          },
        },
      },
    }
  );
  return json.data.id;
}

// ── e-Arşiv ─────────────────────────────────────────────────────────────────

// Faturayı GİB'e iletir. Fatura kaydı önce oluşturulmuş olmalı.
export async function createEArchive(salesInvoiceId: string): Promise<string> {
  const json = await request<{ data: JsonApiResource }>("POST", "/e_archives", {
    data: {
      type: "e_archives",
      relationships: {
        sales_invoice: { data: { id: salesInvoiceId, type: "sales_invoices" } },
      },
    },
  });
  return json.data.id;
}

// PDF iki adımda alınır: önce imzalı bir indirme adresi, sonra dosyanın kendisi.
export async function fetchEArchivePdf(eArchiveId: string): Promise<Buffer> {
  const path = `/e_archives/${eArchiveId}/pdf`;
  const json = await request<{ data: JsonApiResource }>("GET", path);
  const url = json.data?.attributes?.url;
  if (typeof url !== "string" || !url) {
    throw new ParasutError("Paraşüt PDF adresi döndürmedi.", path, 0);
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new ParasutError(`PDF indirilemedi (HTTP ${res.status}).`, path, res.status);
  }
  return Buffer.from(await res.arrayBuffer());
}
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `npx vitest run lib/__tests__/parasut.test.ts`
Expected: 18 passed.

- [ ] **Step 5: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: çıkış kodu 0.

- [ ] **Step 6: Commit (kullanıcı atar)**

```bash
git add lib/parasut.ts lib/__tests__/parasut.test.ts
git commit -m "feat(parasut): cari, satış faturası, e-Arşiv ve PDF uçları"
```

---

## Task 4: Fatura gövdesi dönüştürücüleri (saf fonksiyonlar)

> **Uygulama sırasında revize edildi (2026-10-14).** Aşağıdaki `unitPrice` tasarımı
> incelemede mali bir hata verdi: Paraşüt toplamı `birim × miktar` olarak hesapladığı
> için tutar kişi sayısına tam bölünmediğinde fatura toplamı tahsil edilenden sapıyordu
> (100 TL / 3 kişi → 99,99). Yerine `invoiceLine(totalAmount, passengerCount)` geldi:
> tam bölünüyorsa kişi sayısı kalem olur, bölünmüyorsa miktar 1'e düşer ve toplam
> daima birebir tutar. Ayrıca `isoDate`/`invoiceDescription` UTC yerine
> `Europe/Istanbul`'a göre gün kırpıyor — fatura tarihi bir gün geriye kayıyordu.
> Gerçek kod `lib/parasut-invoice.ts` içinde; aşağısı özgün plan metnidir.

**Files:**
- Create: `lib/parasut-invoice.ts`
- Modify: `lib/__tests__/parasut-invoice.test.ts`

**Interfaces:**
- Consumes: Task 2 — `parasutKdvOrani()`
- Produces:
  - `type InvoiceBlocker = "DOVIZ" | "YABANCI" | null`
  - `invoiceBlocker(input: { currency: string; nationality: string | null }): InvoiceBlocker`
  - `blockerMessage(blocker: Exclude<InvoiceBlocker, null>): string`
  - `isoDate(d: Date): string` — `"yyyy-mm-dd"`
  - `invoiceDescription(tourTitle: string, departureDate: Date): string`
  - `invoiceLine(totalAmount: number, passengerCount: number): InvoiceLine` — `{ quantity, unitPrice }`; birim × miktar daima toplama eşit (tam bölünmezse miktar 1'e düşer)
  - `PARASUT_CURRENCY: Record<string, string>` — `{ TRY: "TRL" }`

- [ ] **Step 1: Testleri ekle**

`lib/__tests__/parasut-invoice.test.ts` sonuna ekle:

```ts
import {
  invoiceBlocker,
  blockerMessage,
  isoDate,
  invoiceDescription,
  unitPrice,
  PARASUT_CURRENCY,
} from "@/lib/parasut-invoice";

describe("fatura engelleri", () => {
  it("TRY ve TC uyruk engelsizdir", () => {
    expect(invoiceBlocker({ currency: "TRY", nationality: "TC" })).toBeNull();
  });

  it("döviz turu engellenir", () => {
    expect(invoiceBlocker({ currency: "EUR", nationality: "TC" })).toBe("DOVIZ");
  });

  it("yabancı uyruklu alıcı engellenir", () => {
    expect(invoiceBlocker({ currency: "TRY", nationality: "FOREIGN" })).toBe("YABANCI");
  });

  it("uyruk boşsa TC sayılır", () => {
    expect(invoiceBlocker({ currency: "TRY", nationality: null })).toBeNull();
  });

  it("döviz, yabancı uyruktan önce gelir", () => {
    expect(invoiceBlocker({ currency: "EUR", nationality: "FOREIGN" })).toBe("DOVIZ");
  });

  it("her engelin açıklaması vardır", () => {
    expect(blockerMessage("DOVIZ")).toMatch(/döviz/i);
    expect(blockerMessage("YABANCI")).toMatch(/yabancı/i);
  });
});

describe("gövde yardımcıları", () => {
  it("tarihi yyyy-mm-dd biçimine çevirir", () => {
    expect(isoDate(new Date("2026-08-13T20:30:00.000Z"))).toBe("2026-08-13");
  });

  it("açıklamada tur adı ve kalkış tarihi geçer", () => {
    const d = new Date("2026-08-12T17:00:00.000Z");
    const text = invoiceDescription("Büyük Balkan Turu", d);
    expect(text).toContain("Büyük Balkan Turu");
    expect(text).toContain("2026");
  });

  it("birim fiyatı toplam / kişi sayısı olarak hesaplar", () => {
    expect(unitPrice(1500, 3)).toBe(500);
  });

  it("bölünemeyen tutarda kuruş hassasiyeti korunur", () => {
    expect(unitPrice(100, 3)).toBeCloseTo(33.33, 2);
  });

  it("kişi sayısı 0 ise toplamı tek kaleme yazar", () => {
    expect(unitPrice(1500, 0)).toBe(1500);
  });

  it("TRY, Paraşüt kodu TRL'ye eşlenir", () => {
    expect(PARASUT_CURRENCY.TRY).toBe("TRL");
  });
});
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npx vitest run lib/__tests__/parasut-invoice.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/parasut-invoice"`.

- [ ] **Step 3: `lib/parasut-invoice.ts`'i yaz**

```ts
// Fatura iş mantığı — rezervasyonu Paraşüt faturasına çevirir.
//
// Saf HTTP katmanı lib/parasut.ts içinde; burada rezervasyon kavramı,
// idempotency ve boru hattı durumu yönetiliyor.

import { parasutKdvOrani } from "@/lib/parasut";

// Paraşüt para birimi kodları ISO'dan ayrışıyor: Türk Lirası "TRY" değil "TRL".
export const PARASUT_CURRENCY: Record<string, string> = { TRY: "TRL" };

// v1 kapsamı dışında kalan ve ELLE işaretlenecek durumlar.
export type InvoiceBlocker = "DOVIZ" | "YABANCI" | null;

export function invoiceBlocker(input: {
  currency: string;
  nationality: string | null;
}): InvoiceBlocker {
  // Döviz faturası e-Arşiv'de TL karşılığı ve kur tarihi istiyor — ayrı iş.
  if (input.currency !== "TRY") return "DOVIZ";
  // e-Arşiv yabancı alıcıda pasaport numarasını farklı alanda bekliyor.
  if (input.nationality === "FOREIGN") return "YABANCI";
  return null;
}

export function blockerMessage(blocker: Exclude<InvoiceBlocker, null>): string {
  if (blocker === "DOVIZ") {
    return "Döviz cinsi tur — fatura Paraşüt panelinden elle kesilmeli.";
  }
  return "Fatura alıcısı yabancı uyruklu — fatura Paraşüt panelinden elle kesilmeli.";
}

// Paraşüt tarihleri yyyy-mm-dd bekliyor.
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function invoiceDescription(tourTitle: string, departureDate: Date): string {
  const tarih = departureDate.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${tourTitle} (${tarih} kalkışlı)`;
}

// Fatura tek kalem: miktar = kişi sayısı, birim fiyat = toplam / kişi.
// Kuruş hassasiyeti korunur; kişi sayısı bilinmiyorsa tek kalem yazılır.
export function unitPrice(totalAmount: number, quantity: number): number {
  if (quantity <= 0) return totalAmount;
  return Math.round((totalAmount / quantity) * 100) / 100;
}
```

**Not:** `parasutKdvOrani` bu dosyada Task 6'daki boru hattı tarafından kullanılacak; şimdilik import edildiği hâliyle kalsın.

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `npx vitest run lib/__tests__/parasut-invoice.test.ts`
Expected: 14 passed (Task 1'den 2 + bu adımdan 12).

- [ ] **Step 5: Commit (kullanıcı atar)**

```bash
git add lib/parasut-invoice.ts lib/__tests__/parasut-invoice.test.ts
git commit -m "feat(fatura): gövde dönüştürücüleri ve kapsam dışı kontrolleri"
```

---

## Task 5: Mail eki desteği ve fatura e-postası

**Files:**
- Modify: `lib/notify.ts:55-85`
- Modify: `lib/notifications.ts` (sona ekleme)
- Test: `lib/__tests__/parasut-invoice.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `sendEmail(to, subject, html, attachments?)` — `attachments?: { filename: string; content: Buffer }[]`
  - `sendInvoiceEmail(bookingId: string, pdf: Buffer): Promise<boolean>`

- [ ] **Step 1: `sendEmail`'e ek desteği ver**

`lib/notify.ts` içinde `sendEmail` imzasını ve `sendMail` çağrısını değiştir:

```ts
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  // Fatura PDF'i gibi ekler. Opsiyonel — mevcut çağrılar etkilenmez.
  attachments?: { filename: string; content: Buffer }[]
): Promise<boolean> {
  if (!emailConfigured()) {
    console.log(
      `[E-POSTA · simülasyon] → ${to}\nKonu: ${subject}\n` +
        (attachments?.length ? `Ek: ${attachments.map((a) => a.filename).join(", ")}\n` : "")
    );
    return true;
  }
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject,
      html,
      ...(attachments?.length ? { attachments } : {}),
    });
    return true;
  } catch (e) {
    console.error("[E-POSTA · gönderim hatası]", e);
    return false;
  }
}
```

**Not:** `sendEmail`'in geri kalanı (hata dalı, `return false`) değişmez.

- [ ] **Step 2: Fatura e-postasını yaz**

`lib/notifications.ts` sonuna ekle:

```ts
// --- Fatura e-postası ---
// Tur başladıktan sonra kesilen e-Arşiv faturası PDF ekli gönderilir.
export async function sendInvoiceEmail(
  bookingId: string,
  pdf: Buffer
): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tour: true },
  });
  if (!booking) return false;

  const no = booking.id.slice(-8).toUpperCase();
  const html = shell(
    "Faturanız hazır",
    `<p>Sayın ${booking.contactName},</p>
     <p><strong>${booking.tour.title}</strong> turuna ait e-Arşiv faturanız ektedir.</p>
     <p>Rezervasyon No: <strong>${no}</strong></p>
     <p>İyi yolculuklar dileriz.</p>`
  );

  return sendEmail(booking.contactEmail, `Faturanız — ${booking.tour.title}`, html, [
    { filename: `fatura-${no}.pdf`, content: pdf },
  ]);
}
```

**Not:** `shell` ve `sendEmail` bu dosyada zaten kullanılıyor; yeni import gerekmiyorsa ekleme. `sendEmail` import edilmemişse dosyanın üst kısmındaki `@/lib/notify` importuna ekle.

- [ ] **Step 3: Test yaz**

`lib/__tests__/parasut-invoice.test.ts` sonuna ekle:

```ts
describe("sendInvoiceEmail", () => {
  it("SMTP yapılandırılmamışken simülasyona düşer ve başarı döner", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);
    const { sendInvoiceEmail } = await import("@/lib/notifications");

    const ok = await sendInvoiceEmail(bookingId, Buffer.from("%PDF-1.4 test"));

    expect(ok).toBe(true);
  });

  it("rezervasyon yoksa false döner", async () => {
    const { sendInvoiceEmail } = await import("@/lib/notifications");
    expect(await sendInvoiceEmail("yok-boyle-id", Buffer.from("x"))).toBe(false);
  });
});
```

- [ ] **Step 4: Testleri çalıştır**

Run: `npx vitest run lib/__tests__/parasut-invoice.test.ts`
Expected: 16 passed.

- [ ] **Step 5: Tüm testler hâlâ geçiyor mu**

Run: `npx vitest run`
Expected: tüm dosyalar passed (mevcut 159 + yeniler).

- [ ] **Step 6: Commit (kullanıcı atar)**

```bash
git add lib/notify.ts lib/notifications.ts lib/__tests__/parasut-invoice.test.ts
git commit -m "feat(fatura): mail eki desteği ve fatura e-postası"
```

---

## Task 6: Boru hattı — `issueInvoiceForBooking`

**Files:**
- Modify: `lib/parasut-invoice.ts`
- Modify: `lib/__tests__/helpers/db.ts`
- Modify: `lib/__tests__/parasut-invoice.test.ts`

**Interfaces:**
- Consumes: Task 3 (`findContactIdByTaxNumber`, `createContact`, `createSalesInvoice`, `createEArchive`, `fetchEArchivePdf`, `isParasutConfigured`), Task 4 (dönüştürücüler), Task 5 (`sendInvoiceEmail`)
- Produces: `issueInvoiceForBooking(bookingId: string): Promise<{ ok: boolean; status: string; error?: string }>`

- [ ] **Step 1: Test yardımcısına kimlik numarası seçeneği ekle**

`lib/__tests__/helpers/db.ts` içinde `createTestBooking`'in `opts` tipine ekle:

```ts
    totalAmount?: number;
    idNumbers?: string[]; // yolcu kimlik numaraları (fatura testleri için)
    paymentMethod?: string;
    currency?: string;
    departureDate?: Date;
```

Aynı fonksiyonda `tour` oluşturmayı şu hale getir (yalnız `departureDate`, `currency` satırları değişir):

```ts
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
```

`departure` oluşturmayı `departureDate` kullanacak şekilde bırak (zaten `tour.departureDate` kullanıyor).

`booking` oluşturmada `passengers.create` ve `paymentMethod` satırlarını güncelle:

```ts
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
```

- [ ] **Step 2: Boru hattı testlerini yaz**

`lib/__tests__/parasut-invoice.test.ts` sonuna ekle:

```ts
import { vi } from "vitest";

// HTTP katmanı tamamen mock'lanır: testler ağa çıkmaz, boru hattının
// durum yönetimi ve idempotency'si sınanır.
vi.mock("@/lib/parasut", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/parasut")>();
  return {
    ...actual,
    isParasutConfigured: vi.fn(() => true),
    findContactIdByTaxNumber: vi.fn(async () => null),
    createContact: vi.fn(async () => "c-1"),
    createSalesInvoice: vi.fn(async () => "inv-1"),
    createEArchive: vi.fn(async () => "ea-1"),
    fetchEArchivePdf: vi.fn(async () => Buffer.from("%PDF-1.4")),
  };
});

describe("issueInvoiceForBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("baştan sona çalışır ve GONDERILDI durumuna geçer", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(res.ok).toBe(true);
    expect(res.status).toBe("GONDERILDI");
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.invoiceId).toBe("inv-1");
    expect(inv?.eArchiveId).toBe("ea-1");
    expect(inv?.emailSentAt).not.toBeNull();
  });

  it("fatura zaten kesilmişse ikinci kez kesmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);
    vi.clearAllMocks();
    await issueInvoiceForBooking(bookingId);

    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
  });

  it("yarıda kalmışsa fatura adımını atlayıp devam eder", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    // Fatura kesilmiş ama e-Arşiv gönderilmemiş durumu kur.
    await prisma.invoice.create({
      data: { bookingId, contactId: "c-1", invoiceId: "inv-1", status: "KESILDI" },
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
    expect(parasut.createEArchive).toHaveBeenCalledWith("inv-1");
    expect(res.status).toBe("GONDERILDI");
  });

  it("döviz turu ELLE işaretlenir, fatura kesilmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      currency: "EUR",
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(res.status).toBe("ELLE");
    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.errorMessage).toMatch(/döviz/i);
  });

  it("Paraşüt hatasında BASARISIZ yazar ve deneme sayısını artırır", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    vi.mocked(parasut.createSalesInvoice).mockRejectedValueOnce(
      new Error("Geçersiz vergi numarası")
    );
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(res.ok).toBe(false);
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("BASARISIZ");
    expect(inv?.attempts).toBe(1);
    expect(inv?.errorMessage).toMatch(/Geçersiz vergi numarası/);
  });

  it("fatura alıcısı seçilen yolcunun TCKN'si kullanılır", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { invoicePassengerIndex: 1 },
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);

    expect(parasut.findContactIdByTaxNumber).toHaveBeenCalledWith("22345678901");
  });

  it("mevcut cari bulunursa yenisi açılmaz", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    vi.mocked(parasut.findContactIdByTaxNumber).mockResolvedValueOnce("c-mevcut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);

    expect(parasut.createContact).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Testlerin başarısız olduğunu doğrula**

Run: `npx vitest run lib/__tests__/parasut-invoice.test.ts`
Expected: FAIL — `issueInvoiceForBooking is not a function`.

- [ ] **Step 4: Boru hattını yaz**

`lib/parasut-invoice.ts` üstündeki importu genişlet ve sona ekle:

```ts
import { prisma } from "@/lib/db";
import {
  parasutKdvOrani,
  isParasutConfigured,
  findContactIdByTaxNumber,
  createContact,
  createSalesInvoice,
  createEArchive,
  fetchEArchivePdf,
} from "@/lib/parasut";
```

```ts
// ── Boru hattı ──────────────────────────────────────────────────────────────
//
// Altı adım, her birinin sonucu kalıcı yazılır:
//   1. engel kontrolü → ELLE
//   2. cari bul/oluştur → contactId
//   3. sales_invoice   → invoiceId, status=KESILDI
//   4. e_archive       → eArchiveId
//   5. PDF
//   6. mail            → emailSentAt, status=GONDERILDI
//
// Yeniden denemede dolu olan alanların adımı ATLANIR. Bu şart: fatura oluşup
// mail atılırken süreç çökerse sonraki çalışma ikinci bir fatura kesmemeli.

export const MAX_ATTEMPTS = 5;

function kisalt(mesaj: string): string {
  return mesaj.slice(0, 500);
}

export async function issueInvoiceForBooking(
  bookingId: string
): Promise<{ ok: boolean; status: string; error?: string }> {
  if (!isParasutConfigured()) {
    return { ok: false, status: "BEKLIYOR", error: "Paraşüt yapılandırılmamış." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tour: true, departure: true, passengers: true, invoice: true },
  });
  if (!booking) return { ok: false, status: "BASARISIZ", error: "Rezervasyon bulunamadı." };

  // Kayıt yoksa aç — @unique sayesinde eşzamanlı iki çalışma çakışır, biri düşer.
  const invoice =
    booking.invoice ??
    (await prisma.invoice.create({ data: { bookingId, status: "BEKLIYOR" } }));

  if (invoice.status === "GONDERILDI") return { ok: true, status: "GONDERILDI" };
  if (invoice.status === "ELLE") return { ok: false, status: "ELLE", error: invoice.errorMessage ?? undefined };

  // Fatura alıcısı: formda seçilen yolcu, yoksa ilki.
  const idx = booking.invoicePassengerIndex ?? 0;
  const alici = booking.passengers[idx] ?? booking.passengers[0];
  if (!alici) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "BASARISIZ", errorMessage: "Rezervasyonda yolcu yok.", attempts: { increment: 1 } },
    });
    return { ok: false, status: "BASARISIZ", error: "Rezervasyonda yolcu yok." };
  }

  // 1. Kapsam dışı mı? ELLE yazılır, otomatik denenmez.
  const blocker = invoiceBlocker({
    currency: booking.tour.currency,
    nationality: alici.nationality,
  });
  if (blocker) {
    const mesaj = blockerMessage(blocker);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "ELLE", errorMessage: mesaj },
    });
    return { ok: false, status: "ELLE", error: mesaj };
  }

  if (!alici.idNumber) {
    const mesaj = "Fatura alıcısının kimlik numarası yok.";
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "BASARISIZ", errorMessage: mesaj, attempts: { increment: 1 } },
    });
    return { ok: false, status: "BASARISIZ", error: mesaj };
  }

  const kalkis = booking.departure?.departureDate ?? booking.tour.departureDate;

  try {
    // 2. Cari — her rezervasyona yeni cari açmamak için önce aranır.
    let contactId = invoice.contactId;
    if (!contactId) {
      contactId =
        (await findContactIdByTaxNumber(alici.idNumber)) ??
        (await createContact({
          name: `${alici.firstName} ${alici.lastName}`.trim(),
          taxNumber: alici.idNumber,
          email: booking.contactEmail,
          phone: booking.contactPhone,
        }));
      await prisma.invoice.update({ where: { id: invoice.id }, data: { contactId } });
    }

    // 3. Satış faturası — id oluşur oluşmaz yazılır (mükerrer koruması).
    let salesInvoiceId = invoice.invoiceId;
    if (!salesInvoiceId) {
      // Fatura kalemi: tam bölünüyorsa kişi sayısı, bölünmüyorsa tek kalem.
      // Paraşüt toplamı birim × miktar olarak hesapladığı için bu şart —
      // aksi halde fatura toplamı tahsil edilenden sapar.
      const satir = invoiceLine(booking.totalAmount, booking.passengers.length);
      salesInvoiceId = await createSalesInvoice({
        contactId,
        description: invoiceDescription(booking.tour.title, kalkis),
        issueDate: isoDate(new Date()),
        currency: PARASUT_CURRENCY[booking.tour.currency] ?? booking.tour.currency,
        quantity: satir.quantity,
        unitPrice: satir.unitPrice,
        vatRate: parasutKdvOrani(),
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { invoiceId: salesInvoiceId, status: "KESILDI", errorMessage: null },
      });
    }

    // 4. e-Arşiv — GİB'e iletir.
    let eArchiveId = invoice.eArchiveId;
    if (!eArchiveId) {
      eArchiveId = await createEArchive(salesInvoiceId);
      await prisma.invoice.update({ where: { id: invoice.id }, data: { eArchiveId } });
    }

    // 5-6. PDF ve mail.
    const pdf = await fetchEArchivePdf(eArchiveId);
    const { sendInvoiceEmail } = await import("@/lib/notifications");
    const gonderildi = await sendInvoiceEmail(bookingId, pdf);
    if (!gonderildi) throw new Error("Fatura e-postası gönderilemedi.");

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "GONDERILDI", emailSentAt: new Date(), errorMessage: null },
    });
    return { ok: true, status: "GONDERILDI" };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("[fatura hatası]", { bookingId, error: e });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "BASARISIZ",
        errorMessage: kisalt(mesaj),
        attempts: { increment: 1 },
      },
    });
    return { ok: false, status: "BASARISIZ", error: mesaj };
  }
}
```

- [ ] **Step 5: Testlerin geçtiğini doğrula**

Run: `npx vitest run lib/__tests__/parasut-invoice.test.ts`
Expected: 23 passed.

- [ ] **Step 6: Tüm testler ve tip kontrolü**

Run: `npx vitest run && npx tsc --noEmit`
Expected: hepsi passed, tsc çıkış kodu 0.

- [ ] **Step 7: Commit (kullanıcı atar)**

```bash
git add lib/parasut-invoice.ts lib/__tests__/helpers/db.ts lib/__tests__/parasut-invoice.test.ts
git commit -m "feat(fatura): boru hattı ve mükerrer fatura koruması"
```

---

## Task 7: Aday tarayıcı ve cron ucu

**Files:**
- Modify: `lib/parasut-invoice.ts`
- Create: `app/api/cron/faturalar/route.ts`
- Modify: `lib/__tests__/parasut-invoice.test.ts`

**Interfaces:**
- Consumes: Task 6 — `issueInvoiceForBooking`, `MAX_ATTEMPTS`
- Produces: `runPendingInvoices(): Promise<{ islenen: number; basarili: number; hatali: number }>`

- [ ] **Step 1: Testleri yaz**

`lib/__tests__/parasut-invoice.test.ts` sonuna ekle:

```ts
describe("runPendingInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("kalkışı geçmiş ödenmiş rezervasyonu faturalar", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("GONDERILDI");
  });

  it("kalkışı gelmemiş rezervasyonu seçmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() + 7 * 86400000),
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    expect(await prisma.invoice.findUnique({ where: { bookingId } })).toBeNull();
  });

  it("elden satışı seçmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
      paymentMethod: "NAKIT",
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    expect(await prisma.invoice.findUnique({ where: { bookingId } })).toBeNull();
  });

  it("ödenmemiş rezervasyonu seçmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    expect(await prisma.invoice.findUnique({ where: { bookingId } })).toBeNull();
  });

  it("deneme sınırına ulaşmış kaydı yeniden denemez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    await prisma.invoice.create({
      data: { bookingId, status: "BASARISIZ", attempts: 5 },
    });
    const parasut = await import("@/lib/parasut");
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
  });

  it("Paraşüt yapılandırılmamışsa hiçbir şey yapmaz", async () => {
    const prisma = await getTestPrisma();
    await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    vi.mocked(parasut.isParasutConfigured).mockReturnValueOnce(false);
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    const res = await runPendingInvoices();

    expect(res.islenen).toBe(0);
  });
});
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npx vitest run lib/__tests__/parasut-invoice.test.ts`
Expected: FAIL — `runPendingInvoices is not a function`.

- [ ] **Step 3: Tarayıcıyı yaz**

`lib/parasut-invoice.ts` sonuna ekle:

```ts
// ── Aday tarayıcı ───────────────────────────────────────────────────────────
//
// lib/notifications.ts runDepartureReminders'ın aynası; tek fark karşılaştırma
// yönü: orada kalkış yaklaşıyor (gt), burada kalkış OLDU (lte).
//
// Döviz ve yabancı uyruk burada filtrelenmez — filtrelenirse hiç Invoice kaydı
// oluşmaz ve panelde görünmezler. Boru hattı onları ELLE olarak işaretler.

const BATCH = 50; // Paraşüt hız sınırı ~10 istek/10 sn; bir çalışmanın üst sınırı
const ISTEKLER_ARASI_MS = 1200;

export async function runPendingInvoices(): Promise<{
  islenen: number;
  basarili: number;
  hatali: number;
}> {
  if (!isParasutConfigured()) return { islenen: 0, basarili: 0, hatali: 0 };

  const now = new Date();
  const adaylar = await prisma.booking.findMany({
    where: {
      status: "ODENDI",
      paymentMethod: { in: ["ONLINE", "KREDI_KARTI"] },
      OR: [
        { departure: { departureDate: { lte: now } } },
        { departureId: null, tour: { departureDate: { lte: now } } },
      ],
      invoice: {
        is: null,
      },
    },
    select: { id: true },
    take: BATCH,
  });

  // Daha önce denenip başarısız olanlar (sınırın altındakiler) ayrı çekilir:
  // Prisma'da "ilişki yok VEYA ilişki şu durumda" tek where ile yazılamıyor.
  const tekrarlar = await prisma.booking.findMany({
    where: {
      status: "ODENDI",
      paymentMethod: { in: ["ONLINE", "KREDI_KARTI"] },
      OR: [
        { departure: { departureDate: { lte: now } } },
        { departureId: null, tour: { departureDate: { lte: now } } },
      ],
      invoice: {
        // BASARISIZ: hata aldı. KESILDI: fatura kesildi ama boru hattı bitmedi
        // (e-Arşiv ya da mail adımı kaldı) — bunlar da yeniden denenmeli.
        // ISLENIYOR kasten DIŞARIDA: başka bir çalışma o kaydı sahiplenmiş.
        is: { status: { in: ["BASARISIZ", "KESILDI"] }, attempts: { lt: MAX_ATTEMPTS } },
      },
    },
    select: { id: true },
    take: BATCH,
  });

  const hepsi = [...adaylar, ...tekrarlar].slice(0, BATCH);

  let basarili = 0;
  let hatali = 0;
  for (const [i, b] of hepsi.entries()) {
    // Kayıt başına koruma: tek bir rezervasyonun beklenmedik hatası (ör. DB
    // çakışması) 50 kayıtlık partinin tamamını iptal etmemeli.
    let res: { ok: boolean };
    try {
      res = await issueInvoiceForBooking(b.id);
    } catch (e) {
      console.error("[fatura: beklenmedik hata]", { bookingId: b.id, error: e });
      res = { ok: false };
    }
    if (res.ok) basarili++;
    else hatali++;
    // Hız sınırına takılmamak için aralara nefes koy.
    if (i < hepsi.length - 1) {
      await new Promise((r) => setTimeout(r, ISTEKLER_ARASI_MS));
    }
  }

  return { islenen: hepsi.length, basarili, hatali };
}
```

- [ ] **Step 4: Cron ucunu yaz**

`app/api/cron/faturalar/route.ts` oluştur:

```ts
import { NextResponse } from "next/server";
import { runPendingInvoices } from "@/lib/parasut-invoice";

// Kalkışı geçmiş, ödenmiş online rezervasyonlara e-Arşiv faturası keser.
// Dışarıdan bir zamanlayıcıyla (sunucu cron'u) GÜNDE BİR çağrılır.
// Güvenlik: CRON_SECRET tanımlıysa Authorization: Bearer <secret> veya ?key=<secret> gerekir.

async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const auth = req.headers.get("authorization");
    const key = url.searchParams.get("key");
    const ok = auth === `Bearer ${secret}` || key === secret;
    if (!ok) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const result = await runPendingInvoices();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
```

- [ ] **Step 5: Testlerin geçtiğini doğrula**

Run: `npx vitest run lib/__tests__/parasut-invoice.test.ts`
Expected: 29 passed.

**Not:** Bu testler `ISTEKLER_ARASI_MS` beklemesi yüzünden yavaş olabilir. Tek adaylı testlerde bekleme yapılmaz (son eleman), sorun çıkarsa testlerde `vi.useFakeTimers()` kullan.

- [ ] **Step 6: Tip kontrolü ve tüm testler**

Run: `npx vitest run && npx tsc --noEmit`
Expected: hepsi passed.

- [ ] **Step 7: Commit (kullanıcı atar)**

```bash
git add lib/parasut-invoice.ts app/api/cron/faturalar/route.ts lib/__tests__/parasut-invoice.test.ts
git commit -m "feat(fatura): aday tarayıcı ve cron ucu"
```

---

## Task 8: Ödeme formunda fatura alıcısı seçimi

**Files:**
- Modify: `components/CheckoutForm.tsx`
- Modify: `lib/checkout-actions.ts:16-75`
- Modify: `lib/booking.ts` (`CreateBookingInput`, `booking.create`)
- Modify: `lib/__tests__/parasut-invoice.test.ts`

**Interfaces:**
- Consumes: Task 1 — `Booking.invoicePassengerIndex`
- Produces: Form alanı `faturaYolcu` (0 tabanlı sıra, string); `CreateBookingInput.invoicePassengerIndex?: number`

- [ ] **Step 1: `CreateBookingInput`'a alan ekle**

`lib/booking.ts` içinde `CreateBookingInput` arayüzüne, `consent?: ConsentRecord;` satırının üstüne ekle:

```ts
  // Fatura hangi yolcu adına kesilecek (0 tabanlı sıra). Yoksa ilk yolcu.
  invoicePassengerIndex?: number;
```

- [ ] **Step 2: Kayda yaz**

`lib/booking.ts` içinde `tx.booking.create` çağrısındaki `data` nesnesinde, `consentAcceptedAt` satırının üstüne ekle:

```ts
          invoicePassengerIndex:
            input.invoicePassengerIndex !== undefined &&
            input.invoicePassengerIndex >= 0 &&
            input.invoicePassengerIndex < input.passengers.length
              ? input.invoicePassengerIndex
              : null,
```

- [ ] **Step 3: Server action'da form alanını oku**

`lib/checkout-actions.ts` içinde `createPendingBooking` çağrısına, `consent: consentCheck.consent,` satırının üstüne ekle:

```ts
    invoicePassengerIndex: Number(s(fd, "faturaYolcu")) || 0,
```

- [ ] **Step 4: Forma seçimi ekle**

`components/CheckoutForm.tsx` içinde, `const [consentOk, setConsentOk] = useState(false);` satırının üstüne ekle:

```ts
  // Fatura hangi yolcu adına kesilecek. Varsayılan ilk yolcu.
  const [faturaYolcu, setFaturaYolcu] = useState(0);
```

Hidden input'lar bloğunda, `rooms` hidden input'unun altına ekle:

```tsx
      <input type="hidden" name="faturaYolcu" value={String(faturaYolcu)} />
```

Yolcu kartının içinde, `{i + 1}. Yolcu` başlığını taşıyan `<span>`'in kapanışından sonra gelen `{isSeat ? (...) : (...)}` bloğunun ARDINDAN, `</div>` kapanışından önce ekle:

```tsx
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="radio"
                    name="faturaYolcuSecim"
                    checked={faturaYolcu === i}
                    onChange={() => setFaturaYolcu(i)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  Fatura bu kişiye kesilsin
                </label>
```

**Not:** `name="faturaYolcuSecim"` yalnız radio gruplaması için; sunucuya giden değer yukarıdaki hidden `faturaYolcu` alanıdır.

- [ ] **Step 5: Test yaz**

`lib/__tests__/parasut-invoice.test.ts` sonuna ekle:

```ts
describe("fatura alıcısı kaydı", () => {
  it("geçerli sıra numarası kaydedilir", async () => {
    const prisma = await getTestPrisma();
    const { createPendingBooking } = await import("@/lib/booking");
    // createTestBooking KOLTUK tipli tur üretir ve 1A/1B'yi doldurur;
    // 2A/2B/3A/3B boş kalır.
    const { tourId } = await createTestBooking(prisma);

    const res = await createPendingBooking({
      tourId,
      contactName: "Test Müşteri",
      contactPhone: "5551112233",
      contactEmail: "t@example.com",
      seatCodes: ["2A", "2B"],
      invoicePassengerIndex: 1,
      passengers: [
        { firstName: "A", lastName: "B", idNumber: "12345678901", gender: "E", nationality: "TC", seatCode: "2A" },
        { firstName: "C", lastName: "D", idNumber: "22345678901", gender: "E", nationality: "TC", seatCode: "2B" },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const b = await prisma.booking.findUnique({ where: { id: res.bookingId } });
    expect(b?.invoicePassengerIndex).toBe(1);
  });

  it("aralık dışı sıra numarası null yazılır", async () => {
    const prisma = await getTestPrisma();
    const { createPendingBooking } = await import("@/lib/booking");
    const { tourId } = await createTestBooking(prisma);

    const res = await createPendingBooking({
      tourId,
      contactName: "Test Müşteri",
      contactPhone: "5551112233",
      contactEmail: "t2@example.com",
      seatCodes: ["3A"],
      invoicePassengerIndex: 7, // yolcu sayısının dışında
      passengers: [
        { firstName: "A", lastName: "B", idNumber: "12345678901", gender: "E", nationality: "TC", seatCode: "3A" },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const b = await prisma.booking.findUnique({ where: { id: res.bookingId } });
    expect(b?.invoicePassengerIndex).toBeNull();
  });
});
```

**Not:** `createPendingBooking` KOLTUK turunda `seatCodes` ister ve her yolcunun `seatCode`'u dolu olmalı (`lib/booking.ts:222`). `CreateResult` tipi `{ ok: true; bookingId; amount } | { ok: false; error }` (`lib/booking.ts:66`).

- [ ] **Step 6: Testleri çalıştır**

Run: `npx vitest run lib/__tests__/parasut-invoice.test.ts`
Expected: 31 passed.

- [ ] **Step 7: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: çıkış kodu 0.

- [ ] **Step 8: Formu tarayıcıda doğrula**

```bash
npm run dev
```

Bir tura git, rezervasyon formunu aç, her yolcu kartında "Fatura bu kişiye kesilsin" radyo düğmesini gör, ikinciyi seç ve rezervasyonu tamamla. Ardından:

```bash
sqlite3 dev.db "SELECT id, invoicePassengerIndex FROM Booking ORDER BY createdAt DESC LIMIT 1;"
```

Expected: `1` (ikinci yolcu seçildiyse).

- [ ] **Step 9: Commit (kullanıcı atar)**

```bash
git add components/CheckoutForm.tsx lib/checkout-actions.ts lib/booking.ts lib/__tests__/parasut-invoice.test.ts
git commit -m "feat(fatura): ödeme formunda fatura alıcısı seçimi"
```

---

## Task 9: Admin panelinde fatura bölümü ve yeniden deneme

**Files:**
- Create: `lib/invoice-actions.ts`
- Create: `components/admin/InvoiceRetryButton.tsx`
- Modify: `app/admin/(dash)/rezervasyonlar/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 6 — `issueInvoiceForBooking`; Task 1 — `Invoice`
- Produces: `retryInvoice(_prev: FormState, fd: FormData): Promise<FormState>`

- [ ] **Step 1: Server action'ı yaz**

`lib/invoice-actions.ts` oluştur:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionEmail } from "@/lib/auth";
import { issueInvoiceForBooking } from "@/lib/parasut-invoice";
import type { FormState } from "@/lib/form-state";

// Deneme sınırına takılmış ya da ELLE işaretlenmiş faturayı görevli elle
// tetikler. Sınır olmadan sonsuz döngü olur; sınır olup elle tetikleme
// olmazsa takılan fatura kalıcı olarak ölü kalır.
export async function retryInvoice(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const email = await getSessionEmail();
  if (!email) redirect("/admin/login");

  const bookingId = String(fd.get("bookingId") ?? "").trim();
  if (!bookingId) return { ok: false, error: "Rezervasyon belirtilmedi." };

  // Deneme sayacını sıfırla — görevli bilerek yeniden deniyor.
  await prisma.invoice.updateMany({
    where: { bookingId },
    data: { attempts: 0, status: "BEKLIYOR", errorMessage: null },
  });

  const res = await issueInvoiceForBooking(bookingId);
  revalidatePath(`/admin/rezervasyonlar/${bookingId}`);

  if (!res.ok) return { ok: false, error: res.error ?? "Fatura kesilemedi." };
  return { ok: true, message: "Fatura kesildi ve müşteriye gönderildi." };
}
```

- [ ] **Step 2: Düğme bileşenini yaz**

`components/admin/InvoiceRetryButton.tsx` oluştur:

```tsx
"use client";

import { useActionState } from "react";
import { retryInvoice } from "@/lib/invoice-actions";
import type { FormState } from "@/lib/form-state";

export default function InvoiceRetryButton({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    retryInvoice,
    {}
  );

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <button
        disabled={pending}
        className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Deneniyor…" : "Yeniden dene"}
      </button>
      {state.error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Rezervasyon sayfasına fatura bölümünü ekle**

`app/admin/(dash)/rezervasyonlar/[id]/page.tsx` içinde:

(a) Üst kısımdaki importlara ekle:

```tsx
import InvoiceRetryButton from "@/components/admin/InvoiceRetryButton";
```

(b) Rezervasyonu çeken `prisma.booking.findUnique` çağrısının `include` nesnesine `invoice: true` ekle.

(c) "Ödeme Kayıtları" bölümünü kapatan `</section>` (veya `</div>`) etiketinin ardına ekle:

```tsx
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-bold text-brand">Fatura</h2>
              {!b.invoice ? (
                <p className="text-sm text-slate-400">
                  Henüz fatura kaydı yok. Fatura, tur başladıktan sonra otomatik kesilir.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        b.invoice.status === "GONDERILDI"
                          ? "bg-emerald-100 text-emerald-700"
                          : b.invoice.status === "KESILDI"
                            ? "bg-blue-100 text-blue-700"
                            : b.invoice.status === "BASARISIZ"
                              ? "bg-red-100 text-red-700"
                              : b.invoice.status === "ELLE"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {b.invoice.status === "GONDERILDI"
                        ? "Gönderildi"
                        : b.invoice.status === "KESILDI"
                          ? "Kesildi — tamamlanmadı"
                          : b.invoice.status === "BASARISIZ"
                            ? "Hata"
                            : b.invoice.status === "ELLE"
                              ? "Elle faturalanacak"
                              : b.invoice.status === "ISLENIYOR"
                                ? "İşleniyor"
                                : "Bekliyor"}
                    </span>
                    {b.invoice.invoiceId && (
                      <span className="text-xs text-slate-500">
                        Paraşüt No: {b.invoice.invoiceId}
                      </span>
                    )}
                  </div>
                  {b.invoice.emailSentAt && (
                    <p className="text-xs text-slate-400">
                      Müşteriye gönderildi:{" "}
                      {b.invoice.emailSentAt.toLocaleString("tr-TR")}
                    </p>
                  )}
                  {b.invoice.errorMessage && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      {b.invoice.errorMessage}
                      {b.invoice.attempts > 0 && ` (${b.invoice.attempts} deneme)`}
                    </p>
                  )}
                  {b.invoice.status !== "GONDERILDI" && (
                    <InvoiceRetryButton bookingId={b.id} />
                  )}
                </div>
              )}
            </section>
```

- [ ] **Step 4: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: çıkış kodu 0.

- [ ] **Step 5: Panelde gözle doğrula**

```bash
npm run dev
```

`/admin/rezervasyonlar/<id>` aç. Faturası olmayan bir rezervasyonda "Henüz fatura kaydı yok" metnini gör. Ardından elle bir kayıt açıp durumu kontrol et:

```bash
sqlite3 dev.db "INSERT INTO Invoice (id,bookingId,provider,status,attempts,errorMessage,createdAt,updatedAt) VALUES ('test-inv','<booking-id>','PARASUT','BASARISIZ',5,'Test hata mesajı',datetime('now'),datetime('now'));"
```

Sayfayı yenile: kırmızı "Hata" rozeti, hata metni, "(5 deneme)" ve "Yeniden dene" düğmesi görünmeli. Sonra temizle:

```bash
sqlite3 dev.db "DELETE FROM Invoice WHERE id='test-inv';"
```

- [ ] **Step 6: Commit (kullanıcı atar)**

```bash
git add lib/invoice-actions.ts components/admin/InvoiceRetryButton.tsx "app/admin/(dash)/rezervasyonlar/[id]/page.tsx"
git commit -m "feat(fatura): admin panelinde fatura durumu ve yeniden deneme"
```

---

## Task 10: Staging duman testi (gerçek Paraşüt API'sine karşı)

**Files:**
- Create: `scripts/parasut-duman-testi.ts`

**Interfaces:**
- Consumes: Task 3 — tüm kaynak uçları
- Produces: —

Bu görev, plandaki **varsayımları gerçek API'ye karşı doğrular**. Paraşüt dokümantasyonu JS tabanlı olduğu için gövde yapıları SDK'lardan çıkarıldı; şu üç varsayım ancak burada kesinleşir:

1. `sales_invoice_details` ürün ilişkisi olmadan kabul ediliyor mu? (Edilmezse önce bir "Tur Hizmeti" ürünü oluşturulup ilişkilendirilmeli.)
0. **`unit_price` KDV HARİÇ net mi, KDV DAHİL brüt mü?** — Task 6 incelemesinde çıkan
   kritik belirsizlik. `Booking.totalAmount` müşteriden tahsil edilen BRÜT tutardır.
   Paraşüt `unit_price`'ı net kabul ediyorsa, KDV oranı 0'dan farklı ayarlandığı an
   fatura toplamı `totalAmount × (1 + oran)` olur ve tahsil edilenden sapar.
   Duman testinde `vatRate: 20` ile bir fatura kesip Paraşüt'ün hesapladığı toplamı
   oku: 100 mü (brüt semantiği) yoksa 120 mi (net semantiği) döndü?
   **Sonuca göre `lib/parasut-invoice.ts` düzeltilmeli.** Bu doğrulanmadan
   `PARASUT_KDV_ORANI` canlıda 0'dan farklı ayarlanmamalı.
2. `/e_archives/{id}/pdf` JSON içinde `data.attributes.url` mi döndürüyor, yoksa doğrudan PDF mi?
3. `contact_type: "person"` + `tax_number` TCKN için doğru alan mı?

- [ ] **Step 1: Duman testi script'ini yaz**

`scripts/parasut-duman-testi.ts` oluştur:

```ts
// Paraşüt STAGING entegrasyonunu uçtan uca dener.
//
// Kullanım (proje kökünde, .env.local staging anahtarlarıyla dolu olmalı):
//   npx tsx scripts/parasut-duman-testi.ts
//
// Gerçek bir e-Arşiv kaydı oluşturur — YALNIZ STAGING'de çalıştırın.
// Script, üretim adresine işaret eden bir yapılandırmada durur.

import {
  parasutBaseUrl,
  isParasutConfigured,
  findContactIdByTaxNumber,
  createContact,
  createSalesInvoice,
  createEArchive,
  fetchEArchivePdf,
} from "../lib/parasut";

async function main() {
  if (!isParasutConfigured()) {
    console.error("HATA: Paraşüt anahtarları tanımlı değil (.env.local).");
    process.exit(1);
  }

  const base = parasutBaseUrl();
  if (!base.includes("staging") && !base.includes("-dev")) {
    console.error(
      `HATA: Base URL staging değil: ${base}\n` +
        "Bu script gerçek fatura oluşturur. Üretimde çalıştırmayın."
    );
    process.exit(1);
  }
  console.log(`Hedef: ${base}\n`);

  const tckn = "11111111111";

  console.log("1. Cari aranıyor…");
  let contactId = await findContactIdByTaxNumber(tckn);
  console.log(`   ${contactId ?? "bulunamadı"}`);

  if (!contactId) {
    console.log("2. Cari oluşturuluyor…");
    contactId = await createContact({
      name: "Duman Testi Müşteri",
      taxNumber: tckn,
      email: "duman-testi@example.com",
    });
    console.log(`   ${contactId}`);
  }

  console.log("3. Satış faturası oluşturuluyor…");
  const invoiceId = await createSalesInvoice({
    contactId,
    description: "Duman Testi Turu (1 Ocak 2026 kalkışlı)",
    issueDate: new Date().toISOString().slice(0, 10),
    currency: "TRL",
    quantity: 2,
    unitPrice: 50,
    vatRate: 0,
  });
  console.log(`   ${invoiceId}`);

  console.log("4. e-Arşiv gönderiliyor…");
  const eArchiveId = await createEArchive(invoiceId);
  console.log(`   ${eArchiveId}`);

  console.log("5. PDF indiriliyor…");
  const pdf = await fetchEArchivePdf(eArchiveId);
  console.log(`   ${pdf.length} byte, başlangıç: ${pdf.subarray(0, 5).toString()}`);

  console.log("\nTamamlandı ✅");
}

main().catch((e) => {
  console.error("\nHATA:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Staging anahtarlarını `.env.local`'e koy**

Kullanıcı yapar (ajan anahtarları görmez):

```
PARASUT_BASE_URL=https://api.heroku-staging.parasut.com
PARASUT_CLIENT_ID=...
PARASUT_CLIENT_SECRET=...
PARASUT_USERNAME=...
PARASUT_PASSWORD=...
PARASUT_COMPANY_ID=...
PARASUT_KDV_ORANI=0
```

`PARASUT_COMPANY_ID` bilinmiyorsa önce şu çağrı ile öğrenilir (token alıp `/v4/me`).

- [ ] **Step 3: Duman testini çalıştır**

Run: `npx tsx scripts/parasut-duman-testi.ts`
Expected: 5 adım da başarılı, `Tamamlandı ✅`.

- [ ] **Step 4: Çıkan farkları koda yansıt**

Herhangi bir adım hata verirse `lib/parasut.ts`'teki ilgili gövdeyi düzelt ve `lib/__tests__/parasut.test.ts`'teki beklentiyi güncelle. Olası düzeltmeler:

- Ürün zorunluysa: `createProduct` ucu eklenip `sales_invoice_details.relationships.product` doldurulur.
- PDF doğrudan binary dönüyorsa: `fetchEArchivePdf` içindeki iki aşamalı indirme tek aşamaya indirilir.

- [ ] **Step 5: Tüm testler ve derleme**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: hepsi başarılı.

**Not:** `npm run build` yerelde `.venv` dizini yüzünden Turbopack panik verebilir (bozuk sembolik bağ). Olursa `.venv`'i geçici olarak proje dışına taşıyıp derle, sonra geri koy. Sunucuda `.venv` yok.

- [ ] **Step 6: Commit (kullanıcı atar)**

```bash
git add scripts/parasut-duman-testi.ts lib/parasut.ts lib/__tests__/parasut.test.ts
git commit -m "test(parasut): staging duman testi ve gerçek API düzeltmeleri"
```

---

## Dağıtım notu

Canlıya alırken `git pull` sonrası:

```bash
cp data/prod.db data/prod.db.$(date +%F-%H%M)
npm ci
npx prisma generate
DATABASE_URL="file:/var/www/gbt/data/prod.db" npx tsx scripts/deploy-migrate.ts
npm run build
<restart komutu>
```

Çıktıda `+ Invoice tablosu` ve `+ Booking.invoicePassengerIndex` görünmeli.

Ardından sunucu cron'una günlük giriş ekle:

```cron
0 6 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://gozdemburakturizm.com/api/cron/faturalar
```

**Canlıya geçmeden:**
- `PARASUT_KDV_ORANI` mali müşavire teyit ettirilmeli — staging'de serbest bırakıldı.
- Canlı Paraşüt anahtarları sunucudaki `.env`'e; `.env.local` sunucuda **bulunmamalı**.
- İlk gün cron'u elle çalıştırıp çıktıyı izle: `curl .../api/cron/faturalar?key=<secret>`
