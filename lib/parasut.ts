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

// KDV muafiyet kodu — YALNIZ parasutKdvOrani() === 0 iken e-Arşiv isteğine
// eklenir (bkz. lib/parasut-invoice.ts). Hangi kodun Paraşüt/GİB tarafından
// kabul edildiği bir İŞ KARARI; burada uydurulmaz, mali müşavirden alınıp bu
// ortam değişkenine yazılmalı. Tanımlı değilse lib/parasut-invoice.ts
// sessizce geçersiz/varsayılan bir kod göndermek yerine anlamlı bir hata
// fırlatır.
export function parasutKdvMuafiyetKodu(): string | null {
  const raw = process.env.PARASUT_KDV_MUAFIYET_KODU?.trim();
  return raw && raw.length > 0 ? raw : null;
}

// Bazı muafiyet kodları (ör. 250/350 "Diğer") serbest metin bir gerekçe de
// ister; bu da iş kararının parçası olduğu için env'den okunur. Tanımlı
// değilse e-Arşiv isteğine hiç eklenmez (Paraşüt her kod için zorunlu
// tutmuyor olabilir — bkz. startEArchiveJob).
export function parasutKdvMuafiyetNedeni(): string | undefined {
  const raw = process.env.PARASUT_KDV_MUAFIYET_NEDENI?.trim();
  return raw && raw.length > 0 ? raw : undefined;
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

// ── Hız sınırlama (throttle) ────────────────────────────────────────────────
//
// Paraşüt hız sınırı ~10 istek/10 sn. issueInvoiceForBooking tek rezervasyon
// için 4-5 ayrı Paraşüt isteği atıyor (cari arama, cari oluşturma, satış
// faturası, e-Arşiv, PDF) ve bu dosya istek sayan TEK katman olduğu için
// hız sınırı burada, her giden isteğin (token alımı dahil) arasına konur.
// Rezervasyon sınırı burada bilinmez — bu yüzden rezervasyonlar arası değil,
// istekler arası bekleniyor.
//
// 1000 değil 1100 ms seçildi: tam 1000 ms'de 10 istek, ağ/işlemci gecikmesi
// payı bırakmadan sınıra yapışır; 1100 ms küçük bir güvenlik payı ekler.
export const PARASUT_MIN_REQUEST_INTERVAL_MS = 1100;

let throttleMs = PARASUT_MIN_REQUEST_INTERVAL_MS;
let lastRequestAt = 0;

// Yalnız test için — throttle aralığını sıfırlayıp testlerin gerçek zaman
// beklememesini sağlar. Vitest sahte zamanlayıcısı ile birlikte kullanılırsa
// (varsayılan 0'dan farklı bir değerle) bekleme gerçek zaman akıtmadan sınanır.
export function __setParasutThrottleMsForTest(ms: number): void {
  throttleMs = ms;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Her giden istekten (token alımı dahil) önce çağrılır. Son istekten bu yana
// throttleMs'den az zaman geçtiyse farkı kadar bekler.
async function throttle(): Promise<void> {
  const now = Date.now();
  const beklenecek = lastRequestAt + throttleMs - now;
  if (beklenecek > 0) {
    await sleep(beklenecek);
  }
  lastRequestAt = Date.now();
}

// Yalnız test için — modül durumunu sıfırlar.
export function __resetParasutTokenCache(): void {
  cachedToken = null;
  lastRequestAt = 0;
}

const TOKEN_PATH = "/oauth/token";

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const creds = parasutCredentials();
  if (!creds) {
    throw new ParasutError("Paraşüt anahtarları tanımlı değil.", TOKEN_PATH, 0);
  }

  await throttle();

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

// 429 (Too Many Requests) alındığında yeniden deneme ayarları. Throttle
// ardışık istekleri zaten yavaşlatıyor ama paralel çalışan iki süreç (ör.
// cron + panelden elle tetikleme) ya da sınırın tam eşiğinde kalan bir koşu
// yine de 429 alabilir — bu yüzden ikinci bir savunma hattı olarak kalır.
const MAX_429_RETRIES = 2; // Retry-After yoksa en fazla bu kadar yeniden denenir
const RETRY_BACKOFF_BASE_MS = 2000; // İlk bekleme; her denemede ikiye katlanır (2 sn, 4 sn)

// Retry-After için ÜST SINIR. Sunucu istediği kadar büyük bir değer
// gönderebilir (ör. `Retry-After: 600` = 10 dakika) ve bu değere körü körüne
// uymak tek bir isteği dakikalarca sessiz bırakır.
//
// Neden 60 saniye: bu süre boyunca çağıran katman hiçbir ilerleme kaydı
// yazamaz. Üst katman (lib/parasut-invoice.ts) işlenmekte olan kayıtların
// "takılı mı, yoksa hâlâ çalışıyor mu" ayrımını son güncelleme zamanına
// bakarak yapıyor ve bunun için bir bayatlık eşiği kullanıyor (10 dakika).
// Bekleme o eşiği aşarsa YAŞAYAN bir çalışma bayat sanılır, işi ikinci bir
// süreç devralır ve aynı iş iki kez yapılır. MAX_429_RETRIES (2) ile birlikte
// buradaki sınır toplam beklemeyi en fazla ~2 dakikada tutar — eşiğin çok
// altında.
export const MAX_RETRY_AFTER_MS = 60_000;

// Retry-After başlığı Paraşüt'te saniye cinsinden geliyor; sayı değilse (ör.
// HTTP-date biçimi) yok sayılıp artan bekleme (backoff) kullanılır.
// Değer MAX_RETRY_AFTER_MS ile sınırlanır (gerekçe yukarıda).
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return null;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const creds = parasutCredentials();
  if (!creds) throw new ParasutError("Paraşüt anahtarları tanımlı değil.", path, 0);

  const url = `${parasutBaseUrl()}/v4/${creds.companyId}${path}`;

  for (let deneme = 0; ; deneme++) {
    const token = await accessToken();
    await throttle();

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

    if (res.status === 429 && deneme < MAX_429_RETRIES) {
      const bekleme =
        parseRetryAfterMs(res.headers.get("retry-after")) ??
        RETRY_BACKOFF_BASE_MS * 2 ** deneme;
      await sleep(bekleme);
      continue;
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
  // Staging'e karşı denendi: e-Arşiv, cari'de il/ilçe BOŞSA işi
  // "Alıcı il/ilçe adresi doldurulmalı" hatasıyla reddediyor (bkz.
  // createEArchive). Bu yüzden ikisi de opsiyonel ama e-Arşiv'e giden
  // her cari için doldurulmalı.
  city?: string;
  district?: string;
}): Promise<string> {
  const path = "/contacts";
  const json = await request<{ data: JsonApiResource }>("POST", path, {
    data: {
      type: "contacts",
      attributes: {
        name: input.name,
        contact_type: "person", // bireysel müşteri: TCKN tax_number alanına yazılır
        account_type: "customer",
        tax_number: input.taxNumber,
        email: input.email,
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.district ? { district: input.district } : {}),
      },
    },
  });
  const id = json.data?.id;
  if (typeof id !== "string" || !id) {
    throw new ParasutError("Paraşüt cari oluşturma yanıtında id döndürmedi.", path, 0);
  }
  return id;
}

// ── Ürün/hizmet (products) ──────────────────────────────────────────────────
//
// Staging'e karşı denendi: sales_invoice_details, ürün (product) ilişkisi
// OLMADAN HTTP 422 "Ürün/hizmet doldurulmalı" ile reddediliyor. Bu yüzden
// her satış faturasından önce bir ürün bulunmalı/oluşturulmalı — cari ile
// aynı "önce ara, yoksa oluştur" deseni.
export async function findProductIdByName(name: string): Promise<string | null> {
  const query = new URLSearchParams({ "filter[name]": name });
  const json = await request<{ data: JsonApiResource[] }>(
    "GET",
    `/products?${query.toString()}`
  );
  return json.data?.[0]?.id ?? null;
}

export async function createProduct(input: {
  name: string;
  vatRate: number;
}): Promise<string> {
  const path = "/products";
  const json = await request<{ data: JsonApiResource }>("POST", path, {
    data: {
      type: "products",
      attributes: {
        name: input.name,
        vat_rate: input.vatRate,
        unit: "Adet",
        currency: "TRL",
        list_price: 0,
      },
    },
  });
  const id = json.data?.id;
  if (typeof id !== "string" || !id) {
    throw new ParasutError("Paraşüt ürün oluşturma yanıtında id döndürmedi.", path, 0);
  }
  return id;
}

// ── Satış faturası ──────────────────────────────────────────────────────────

export interface SalesInvoiceInput {
  contactId: string;
  productId: string; // sales_invoice_details ürün ilişkisi OLMADAN kabul edilmiyor (bkz. yukarı)
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
  const path = "/sales_invoices";
  const json = await request<{ data: JsonApiResource }>(
    "POST",
    path,
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
                relationships: {
                  product: { data: { id: input.productId, type: "products" } },
                },
              },
            ],
          },
        },
      },
    }
  );
  const id = json.data?.id;
  if (typeof id !== "string" || !id) {
    throw new ParasutError("Paraşüt satış faturası yanıtında id döndürmedi.", path, 0);
  }
  return id;
}

// Satış faturasının hesaplanan toplamlarını okur. KDV semantiğinin
// (unit_price net mi brüt mü) doğrulanması için var — bkz.
// scripts/parasut-duman-testi.ts.
//
// Alan adları (net_total, gross_total, total_vat) Paraşüt dokümantasyonundan
// biliniyor ama DOĞRULANMADI. Alan yoksa veya sayıya çevrilemiyorsa null
// döner, PATLAMAZ — amaç zaten bu alanların gerçekten var olup olmadığını
// keşfetmek; keşif sırasında hata fırlatmak yanlış sinyal olur.
export interface SalesInvoiceTotals {
  netTotal: number | null;
  grossTotal: number | null;
  totalVat: number | null;
}

export async function fetchSalesInvoiceTotals(
  id: string
): Promise<SalesInvoiceTotals> {
  const path = `/sales_invoices/${id}`;
  const json = await request<{ data: JsonApiResource }>("GET", path);
  const attrs = json.data?.attributes ?? {};
  return {
    netTotal: toNumberOrNull(attrs.net_total),
    grossTotal: toNumberOrNull(attrs.gross_total),
    totalVat: toNumberOrNull(attrs.total_vat),
  };
}

// Paraşüt bazı sayısal alanları metin olarak döndürebilir; ikisi de kabul
// edilir. Alan yoksa veya sayıya çevrilemiyorsa null (asla fırlatmaz).
function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ── e-Arşiv ─────────────────────────────────────────────────────────────────
//
// Staging'e karşı denendi ve GERÇEĞİ ortaya çıkardı: `POST /e_archives`
// e_archive kaydının kendi id'sini DEĞİL, bir `trackable_jobs` (asenkron iş
// takip) kaydının id'sini döndürür. GİB'e iletim arka planda biter; iş
// bitince GERÇEK e-belge id'si faturanın kendisinden
// `GET /sales_invoices/{id}?include=active_e_document` ile okunur (bkz.
// fetchActiveEDocumentId) — işin `result` alanından DEĞİL, o alan boş kalır.
//
// Ayrıca staging'de şu ikisi de doğrulandı:
//   - Cari'de il/ilçe boşsa iş "Alıcı il/ilçe adresi doldurulmalı" hatasıyla
//     "error" durumuna düşer (bkz. createContact).
//   - `vat_rate: 0` olan bir kalem varsa, `POST /e_archives` isteğinin
//     GÖVDESİNDE (sales_invoice_details'te DEĞİL — orada denendi, kabul
//     edilmedi) `vat_exemption_reason_code` + (kod 250/350 ise)
//     `vat_exemption_reason` gönderilmezse iş "Vat exemption reason code
//     KDV muafiyet kodu kabul edilen bir kelime değil" hatasıyla reddedilir.

export interface EArchiveInput {
  salesInvoiceId: string;
  // parasutKdvOrani() === 0 iken zorunlu (bkz. yukarı). "350" (Diğer) GİB'in
  // genel amaçlı istisna kodu — staging'e karşı denendi ve kabul edildi.
  vatExemptionReasonCode?: string;
  vatExemptionReason?: string;
}

// `POST /e_archives` — yalnız bir ASENKRON İŞ başlatır. Döndürdüğü id bir
// `trackable_jobs` id'sidir, e_archive id'si DEĞİLDİR; doğrudan
// fetchEArchivePdf'e VERİLEMEZ. Gerçek e-belge id'sine ulaşmak için
// createEArchive (iş bitene kadar bekleyip gerçek id'yi çözen üst katman)
// kullanılmalı.
export async function startEArchiveJob(input: EArchiveInput): Promise<string> {
  const path = "/e_archives";
  const json = await request<{ data: JsonApiResource }>("POST", path, {
    data: {
      type: "e_archives",
      attributes: {
        ...(input.vatExemptionReasonCode
          ? { vat_exemption_reason_code: input.vatExemptionReasonCode }
          : {}),
        ...(input.vatExemptionReason
          ? { vat_exemption_reason: input.vatExemptionReason }
          : {}),
      },
      relationships: {
        sales_invoice: { data: { id: input.salesInvoiceId, type: "sales_invoices" } },
      },
    },
  });
  const jobId = json.data?.id;
  if (typeof jobId !== "string" || !jobId) {
    throw new ParasutError("Paraşüt e-Arşiv işi başlatma yanıtında id döndürmedi.", path, 0);
  }
  return jobId;
}

interface TrackableJobStatus {
  status: string;
  errors: string[] | null;
}

// `GET /trackable_jobs/{id}` — status "queued"/"running"/"done"/"error"
// olabilir (staging'de gözlenen değerler). `result` alanı GÜVENİLİR DEĞİL —
// e-Arşiv'de gerçek id'yi VERMEDİĞİ staging'de doğrulandı (null kaldı).
async function fetchTrackableJobStatus(jobId: string): Promise<TrackableJobStatus> {
  const path = `/trackable_jobs/${jobId}`;
  const json = await request<{ data: JsonApiResource }>("GET", path);
  const attrs = json.data?.attributes ?? {};
  const status = typeof attrs.status === "string" ? attrs.status : "bilinmiyor";
  const rawErrors = attrs.errors;
  const errors = Array.isArray(rawErrors)
    ? rawErrors.filter((e): e is string => typeof e === "string")
    : null;
  return { status, errors };
}

// Satış faturasının AKTİF e-belgesinin (e_archive/e_invoice) gerçek id'sini
// okur. Staging'de doğrulanan yanıt şekli:
//   data.relationships.active_e_document.data.id
// (aynı id `included` dizisinde de karşılığını bulur). İlişki henüz
// oluşmadıysa (iş hâlâ sürüyor/hiç başlamadıysa) null döner, PATLAMAZ.
export async function fetchActiveEDocumentId(
  salesInvoiceId: string
): Promise<string | null> {
  const path = `/sales_invoices/${salesInvoiceId}?include=active_e_document`;
  const json = await request<{
    data: JsonApiResource & {
      relationships?: { active_e_document?: { data?: { id: string } | null } };
    };
  }>("GET", path);
  const id = json.data?.relationships?.active_e_document?.data?.id;
  return typeof id === "string" && id ? id : null;
}

// e-Arşiv işinin tamamlanmasını beklerken aralarda bekleme. Testlerde
// gerçek zaman akıtmamak için __setEArchivePollIntervalMsForTest ile
// sıfırlanabilir (bkz. __setParasutThrottleMsForTest ile aynı desen).
let eArchivePollIntervalMs = 2000;
export function __setEArchivePollIntervalMsForTest(ms: number): void {
  eArchivePollIntervalMs = ms;
}

// e-Arşiv asenkron oluştuğu için işi başlattıktan hemen sonra GERÇEK
// e-belge id'si henüz hazır olmayabilir — üst sınırlı bir bekleme/yeniden
// deneme döngüsüyle beklenir. Sınıra ulaşılırsa anlamlı bir ParasutError
// fırlatılır (sonsuz döngü YOK).
const E_ARCHIVE_POLL_MAX_ATTEMPTS = 5;

// Faturayı GİB'e iletir ve GERÇEK e-belge (e_archive) id'sini döndürür.
// Fatura kaydı önce oluşturulmuş olmalı. `POST /e_archives`'in döndürdüğü
// id bir iş (trackable_jobs) id'sidir ve burada DIŞARI VERİLMEZ — çağıran
// yalnız gerçek, PDF ucunda kullanılabilir e-belge id'sini görür.
export async function createEArchive(
  salesInvoiceId: string,
  options?: { vatExemptionReasonCode?: string; vatExemptionReason?: string }
): Promise<string> {
  const jobId = await startEArchiveJob({ salesInvoiceId, ...options });

  for (let deneme = 0; deneme < E_ARCHIVE_POLL_MAX_ATTEMPTS; deneme++) {
    await sleep(eArchivePollIntervalMs);

    const job = await fetchTrackableJobStatus(jobId);
    if (job.status === "error") {
      throw new ParasutError(
        `Paraşüt e-Arşiv işi başarısız: ${job.errors?.join("; ") ?? "bilinmeyen hata"}`,
        "/e_archives",
        0
      );
    }
    if (job.status !== "done") {
      continue; // hâlâ "queued"/"running" — sıradaki denemede tekrar bakılır
    }

    const eArchiveId = await fetchActiveEDocumentId(salesInvoiceId);
    if (eArchiveId) return eArchiveId;
    // İş "done" ama ilişki henüz görünmüyor (kısa bir yayılma gecikmesi
    // olabilir) — sıradaki denemede tekrar bakılır.
  }

  throw new ParasutError(
    `Paraşüt e-Arşiv işi ${E_ARCHIVE_POLL_MAX_ATTEMPTS} denemede tamamlanmadı ` +
      "(gerçek e-belge id'si alınamadı).",
    "/e_archives",
    0
  );
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
