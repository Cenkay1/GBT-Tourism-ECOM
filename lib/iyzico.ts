// iyzico API istemcisi — saf HTTP katmanı.
//
// Bu dosya iş kuralı bilmez: Prisma, Next.js, rezervasyon kavramı buraya girmez.
// Tek işi iyzico'ya imzalı istek atıp tipli yanıt döndürmek. İş mantığı
// lib/payment.ts içinde.
//
// Kimlik doğrulama: IYZWSv2 (HMAC-SHA256)
//   signature = HMAC-SHA256(secretKey, randomKey + uriPath + JSON(body))  → hex
//   Authorization: IYZWSv2 base64("apiKey:<key>&randomKey:<rnd>&signature:<hex>")
//   x-iyzi-rnd: <randomKey>
// Doküman: https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth

import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://api.iyzipay.com";

// Sandbox'a geçmek için IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
export function iyzicoBaseUrl(): string {
  const raw = process.env.IYZICO_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function iyzicoCredentials(): { apiKey: string; secretKey: string } | null {
  const apiKey = process.env.IYZICO_API_KEY?.trim();
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim();
  if (!apiKey || !secretKey) return null;
  return { apiKey, secretKey };
}

export class IyzicoError extends Error {
  readonly errorCode?: string;
  readonly uriPath: string;
  constructor(message: string, uriPath: string, errorCode?: string) {
    super(message);
    this.name = "IyzicoError";
    this.uriPath = uriPath;
    this.errorCode = errorCode;
  }
}

// ── İmzalama ────────────────────────────────────────────────────────────────

function hmacSha256Hex(secretKey: string, payload: string): string {
  return crypto.createHmac("sha256", secretKey).update(payload, "utf8").digest("hex");
}

// Her istekte yeni. iyzico tekrar gönderimi (replay) bununla ayırt eder.
export function generateRandomKey(): string {
  return `${Date.now()}${crypto.randomInt(100000, 999999)}`;
}

// Saf fonksiyon — birim testi lib/__tests__/iyzico.test.ts içinde.
export function buildAuthorization(params: {
  apiKey: string;
  secretKey: string;
  uriPath: string;
  randomKey: string;
  bodyJson: string;
}): string {
  const { apiKey, secretKey, uriPath, randomKey, bodyJson } = params;
  const signature = hmacSha256Hex(secretKey, randomKey + uriPath + bodyJson);
  const authString = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return `IYZWSv2 ${Buffer.from(authString, "utf8").toString("base64")}`;
}

// ── Yanıt imzası doğrulama ──────────────────────────────────────────────────
//
// iyzico fiyat alanlarındaki sondaki sıfırların kırpılmasını şart koşuyor
// ("10.50" → "10.5"). Pratikte farklı uçlar farklı biçimde döndürdüğü için
// hem ham hem kırpılmış değeri deniyoruz: imza yine gizli anahtarla
// hesaplandığından bu güvenliği zayıflatmaz, yalnızca yanlış ret riskini
// ortadan kaldırır.
// Doküman: https://docs.iyzico.com/en/advanced/response-signature-validation

// DİKKAT: buraya gelen değerin tipine GÜVENİLMEZ. Aşağıdaki arayüzler alanları
// `string` ilan eder ama bu yalnız derleme zamanı geçerlidir; gövde iyzico'nun
// JSON'undan parse edilir ve iyzico fiyatı kimi zaman metin ("1500.0"), kimi
// zaman SAYI (1) olarak döndürür. Sayı geldiğinde burada .includes çağırmak
// "TypeError: value.includes is not a function" ile patlıyordu: ödeme iyzico
// tarafında tamamlanmış olmasına rağmen rezervasyon işlenmeden kalıyordu.
export function trimPriceZeros(value: string | number): string {
  const text = String(value ?? "");
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

function priceVariants(value: string | number | null | undefined): string[] {
  if (value === null || value === undefined) return [""];
  const raw = String(value);
  const variants = new Set<string>([raw, trimPriceZeros(raw)]);
  // Değer JSON'da sayı olarak geldiyse metinsel biçimi kaybolmuştur: 1 bize
  // "1" olarak ulaşır ama iyzico imzayı "1.0" üzerinden hesaplamış olabilir.
  // Olası biçimleri deniyoruz — imza gizli anahtarla hesaplandığından bu
  // güvenliği zayıflatmaz, yalnız yanlış ret riskini kaldırır.
  if (typeof value === "number" && Number.isFinite(value)) {
    variants.add(value.toFixed(1));
    variants.add(value.toFixed(2));
  }
  return [...variants];
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), "utf8");
  const bufB = Buffer.from(b.toLowerCase(), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Checkout Form "retrieve" yanıtının gerçekten iyzico'dan geldiğini kanıtlar.
// Alan sırası dokümanda sabit:
//   paymentStatus:paymentId:currency:basketId:conversationId:paidPrice:price:token
export function verifyCheckoutFormSignature(
  res: CheckoutFormRetrieveResponse,
  secretKey: string
): boolean {
  if (!res.signature) return false;

  for (const paidPrice of priceVariants(res.paidPrice ?? "")) {
    for (const price of priceVariants(res.price ?? "")) {
      const payload = [
        res.paymentStatus ?? "",
        res.paymentId ?? "",
        res.currency ?? "",
        res.basketId ?? "",
        res.conversationId ?? "",
        paidPrice,
        price,
        res.token ?? "",
      ].join(":");
      if (timingSafeEqualHex(hmacSha256Hex(secretKey, payload), res.signature)) {
        return true;
      }
    }
  }
  return false;
}

// ── İstek gönderimi ─────────────────────────────────────────────────────────

interface IyzicoBaseResponse {
  status?: "success" | "failure";
  errorCode?: string;
  errorMessage?: string;
  conversationId?: string;
  systemTime?: number;
  locale?: string;
}

async function post<T extends IyzicoBaseResponse>(
  uriPath: string,
  body: Record<string, unknown>
): Promise<T> {
  const creds = iyzicoCredentials();
  if (!creds) throw new IyzicoError("iyzico anahtarları tanımlı değil.", uriPath);

  const bodyJson = JSON.stringify(body);
  const randomKey = generateRandomKey();
  const authorization = buildAuthorization({ ...creds, uriPath, randomKey, bodyJson });

  let res: Response;
  try {
    res = await fetch(`${iyzicoBaseUrl()}${uriPath}`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "x-iyzi-rnd": randomKey,
        "Content-Type": "application/json",
      },
      body: bodyJson,
      cache: "no-store",
    });
  } catch (e) {
    // Ağ hatası — iyzico'ya hiç ulaşamadık.
    throw new IyzicoError(
      `iyzico servisine ulaşılamadı: ${e instanceof Error ? e.message : String(e)}`,
      uriPath
    );
  }

  const text = await res.text();
  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    throw new IyzicoError(
      `iyzico beklenmeyen yanıt döndürdü (HTTP ${res.status}).`,
      uriPath
    );
  }

  if (json.status !== "success") {
    throw new IyzicoError(
      json.errorMessage ?? `iyzico isteği başarısız (HTTP ${res.status}).`,
      uriPath,
      json.errorCode
    );
  }
  return json;
}

// ── Checkout Form: başlat ───────────────────────────────────────────────────

export interface IyzicoBuyer {
  id: string;
  name: string;
  surname: string;
  identityNumber: string;
  email: string;
  gsmNumber?: string;
  registrationAddress: string;
  city: string;
  country: string;
  ip?: string;
}

export interface IyzicoAddress {
  contactName: string;
  address: string;
  city: string;
  country: string;
}

export interface IyzicoBasketItem {
  id: string;
  name: string;
  category1: string;
  itemType: "PHYSICAL" | "VIRTUAL";
  price: string;
}

export interface CheckoutFormInitializeInput {
  conversationId: string;
  basketId: string;
  price: string;
  paidPrice: string;
  currency: string;
  callbackUrl: string;
  enabledInstallments: number[];
  buyer: IyzicoBuyer;
  shippingAddress: IyzicoAddress;
  billingAddress: IyzicoAddress;
  basketItems: IyzicoBasketItem[];
}

export interface CheckoutFormInitializeResponse extends IyzicoBaseResponse {
  token: string;
  paymentPageUrl: string;
  checkoutFormContent?: string;
  tokenExpireTime?: number;
}

const INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";
const REFUND_PATH = "/v2/payment/refund";
const CANCEL_PATH = "/payment/cancel";

export async function initializeCheckoutForm(
  input: CheckoutFormInitializeInput
): Promise<CheckoutFormInitializeResponse> {
  return post<CheckoutFormInitializeResponse>(INITIALIZE_PATH, {
    locale: "tr",
    paymentGroup: "PRODUCT",
    ...input,
  });
}

// ── Checkout Form: sonucu sorgula ───────────────────────────────────────────

export interface CheckoutFormRetrieveResponse extends IyzicoBaseResponse {
  token?: string;
  paymentStatus?: string; // SUCCESS | FAILURE | INIT_THREEDS | CALLBACK_THREEDS | ...
  paymentId?: string;
  price?: string;
  paidPrice?: string;
  currency?: string;
  basketId?: string;
  installment?: number;
  fraudStatus?: number;
  cardType?: string;
  cardAssociation?: string;
  cardFamily?: string;
  lastFourDigits?: string;
  signature?: string;
  itemTransactions?: { paymentTransactionId?: string }[];
}

export async function retrieveCheckoutForm(
  token: string,
  conversationId?: string
): Promise<CheckoutFormRetrieveResponse> {
  return post<CheckoutFormRetrieveResponse>(RETRIEVE_PATH, {
    locale: "tr",
    token,
    ...(conversationId ? { conversationId } : {}),
  });
}

// ── İade / iptal ────────────────────────────────────────────────────────────

export interface RefundResponse extends IyzicoBaseResponse {
  paymentId?: string;
  price?: string;
  currency?: string;
  authCode?: string;
  hostReference?: string;
  refundHostReference?: string;
  cancelHostReference?: string;
}

// Aynı gün, banka mutabakatından önce: ekstreye hiç düşmez, kısmi olamaz.
export async function cancelPayment(params: {
  paymentId: string;
  conversationId?: string;
  ip?: string;
}): Promise<RefundResponse> {
  return post<RefundResponse>(CANCEL_PATH, {
    locale: "tr",
    paymentId: params.paymentId,
    ...(params.conversationId ? { conversationId: params.conversationId } : {}),
    ...(params.ip ? { ip: params.ip } : {}),
  });
}

// Sonraki günler (365 güne kadar): kısmi iade destekler.
export async function refundPayment(params: {
  paymentId: string;
  price: string;
  currency?: string;
  conversationId?: string;
  ip?: string;
}): Promise<RefundResponse> {
  return post<RefundResponse>(REFUND_PATH, {
    locale: "tr",
    paymentId: params.paymentId,
    price: params.price,
    ...(params.currency ? { currency: params.currency } : {}),
    ...(params.conversationId ? { conversationId: params.conversationId } : {}),
    ...(params.ip ? { ip: params.ip } : {}),
  });
}
