import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  buildAuthorization,
  trimPriceZeros,
  verifyCheckoutFormSignature,
  type CheckoutFormRetrieveResponse,
} from "@/lib/iyzico";

const SECRET = "test-secret-key";
const API_KEY = "test-api-key";

describe("buildAuthorization", () => {
  it("IYZWSv2 öneki ve base64 gövde üretir", () => {
    const header = buildAuthorization({
      apiKey: API_KEY,
      secretKey: SECRET,
      uriPath: "/payment/test",
      randomKey: "123456789",
      bodyJson: '{"a":1}',
    });

    expect(header.startsWith("IYZWSv2 ")).toBe(true);
    const decoded = Buffer.from(header.slice("IYZWSv2 ".length), "base64").toString("utf8");
    expect(decoded).toContain(`apiKey:${API_KEY}`);
    expect(decoded).toContain("randomKey:123456789");
    expect(decoded).toMatch(/signature:[0-9a-f]{64}$/);
  });

  it("imzayı randomKey + uriPath + gövde üzerinden hesaplar", () => {
    const uriPath = "/payment/test";
    const randomKey = "987654321";
    const bodyJson = '{"price":"100.0"}';

    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(randomKey + uriPath + bodyJson, "utf8")
      .digest("hex");

    const header = buildAuthorization({
      apiKey: API_KEY,
      secretKey: SECRET,
      uriPath,
      randomKey,
      bodyJson,
    });
    const decoded = Buffer.from(header.slice("IYZWSv2 ".length), "base64").toString("utf8");
    expect(decoded).toContain(`signature:${expected}`);
  });

  it("gövde değişince imza değişir", () => {
    const base = {
      apiKey: API_KEY,
      secretKey: SECRET,
      uriPath: "/payment/test",
      randomKey: "111",
    };
    const a = buildAuthorization({ ...base, bodyJson: '{"price":"100.0"}' });
    const b = buildAuthorization({ ...base, bodyJson: '{"price":"1.0"}' });
    expect(a).not.toBe(b);
  });
});

describe("trimPriceZeros", () => {
  it("ondalıktaki sondaki sıfırları atar", () => {
    expect(trimPriceZeros("10.50")).toBe("10.5");
    expect(trimPriceZeros("1500.0")).toBe("1500");
    expect(trimPriceZeros("1500.00000")).toBe("1500");
  });

  it("ondalık yoksa dokunmaz", () => {
    expect(trimPriceZeros("1500")).toBe("1500");
    expect(trimPriceZeros("100")).toBe("100");
  });

  it("anlamlı basamakları korur", () => {
    expect(trimPriceZeros("10.05")).toBe("10.05");
    expect(trimPriceZeros("1500.25")).toBe("1500.25");
  });
});

// İmzayı iyzico'nun hesapladığı gibi üretir.
function signResponse(res: CheckoutFormRetrieveResponse, priceFormatter = (v: string) => v) {
  const payload = [
    res.paymentStatus ?? "",
    res.paymentId ?? "",
    res.currency ?? "",
    res.basketId ?? "",
    res.conversationId ?? "",
    priceFormatter(res.paidPrice ?? ""),
    priceFormatter(res.price ?? ""),
    res.token ?? "",
  ].join(":");
  return crypto.createHmac("sha256", SECRET).update(payload, "utf8").digest("hex");
}

const baseResponse: CheckoutFormRetrieveResponse = {
  status: "success",
  paymentStatus: "SUCCESS",
  paymentId: "20123456",
  currency: "TRY",
  basketId: "booking-abc123",
  conversationId: "booking-abc123",
  paidPrice: "1500.0",
  price: "1500.0",
  token: "tok_test_123",
};

describe("verifyCheckoutFormSignature", () => {
  it("geçerli imzayı kabul eder", () => {
    const res = { ...baseResponse };
    res.signature = signResponse(res);
    expect(verifyCheckoutFormSignature(res, SECRET)).toBe(true);
  });

  it("fiyatlar kırpılmış biçimde imzalanmışsa da kabul eder", () => {
    const res = { ...baseResponse };
    res.signature = signResponse(res, trimPriceZeros);
    expect(verifyCheckoutFormSignature(res, SECRET)).toBe(true);
  });

  it("imza yoksa reddeder", () => {
    expect(verifyCheckoutFormSignature({ ...baseResponse }, SECRET)).toBe(false);
  });

  it("yanlış gizli anahtarla reddeder", () => {
    const res = { ...baseResponse };
    res.signature = signResponse(res);
    expect(verifyCheckoutFormSignature(res, "baska-secret")).toBe(false);
  });

  // Asıl saldırı: saldırgan tutarı ya da rezervasyon kimliğini oynatıp
  // imzayı güncelleyemez, çünkü gizli anahtar onda değil.
  it("tutar kurcalanmışsa reddeder", () => {
    const res = { ...baseResponse };
    res.signature = signResponse(res);
    const tampered = { ...res, price: "1.0", paidPrice: "1.0" };
    expect(verifyCheckoutFormSignature(tampered, SECRET)).toBe(false);
  });

  it("basketId (rezervasyon) kurcalanmışsa reddeder", () => {
    const res = { ...baseResponse };
    res.signature = signResponse(res);
    const tampered = { ...res, basketId: "booking-baskasi" };
    expect(verifyCheckoutFormSignature(tampered, SECRET)).toBe(false);
  });

  it("paymentStatus kurcalanmışsa reddeder", () => {
    const res = { ...baseResponse, paymentStatus: "FAILURE" };
    res.signature = signResponse(res);
    const tampered = { ...res, paymentStatus: "SUCCESS" };
    expect(verifyCheckoutFormSignature(tampered, SECRET)).toBe(false);
  });

  it("uzunluğu farklı bozuk imzayı reddeder (timingSafeEqual patlamaz)", () => {
    const res = { ...baseResponse, signature: "kisa" };
    expect(verifyCheckoutFormSignature(res, SECRET)).toBe(false);
  });
});

// iyzico fiyat alanlarını JSON'da SAYI olarak döndürebiliyor ("price": 1).
// TypeScript tipi `string` der ama bu yalnız derleme zamanı geçerlidir; gelen
// JSON'un gerçek tipi değişebilir. Sayı geldiğinde kod `.includes` çağırıp
// "TypeError: e.includes is not a function" ile patlıyordu — ödeme iyzico'da
// tamamlanmış olmasına rağmen rezervasyon işlenmeden kalıyordu (canlı, 2026-10-12).
describe("verifyCheckoutFormSignature — fiyat sayı olarak geldiğinde", () => {
  // Tipi kasıtlı olarak esnetiyoruz: amaç derleyicinin değil, çalışma zamanının
  // davranışını sınamak.
  const numeric = {
    ...baseResponse,
    paidPrice: 1 as unknown as string,
    price: 1 as unknown as string,
  };

  it("sayı fiyatla patlamaz", () => {
    expect(() => verifyCheckoutFormSignature(numeric, SECRET)).not.toThrow();
  });

  it("iyzico '1' olarak imzaladıysa kabul eder", () => {
    const res = { ...numeric };
    res.signature = signResponse(res, (v) => String(v));
    expect(verifyCheckoutFormSignature(res, SECRET)).toBe(true);
  });

  it("iyzico '1.0' olarak imzaladıysa da kabul eder", () => {
    const res = { ...numeric };
    res.signature = signResponse(res, (v) => Number(v).toFixed(1));
    expect(verifyCheckoutFormSignature(res, SECRET)).toBe(true);
  });

  it("sayı fiyat kurcalanmışsa yine reddeder", () => {
    const res = { ...numeric };
    res.signature = signResponse(res, (v) => String(v));
    const tampered = { ...res, price: 9999 as unknown as string };
    expect(verifyCheckoutFormSignature(tampered, SECRET)).toBe(false);
  });
});

describe("trimPriceZeros — sayı girdi", () => {
  it("sayı geldiğinde patlamaz", () => {
    expect(() => trimPriceZeros(1 as unknown as string)).not.toThrow();
    expect(trimPriceZeros(1 as unknown as string)).toBe("1");
    expect(trimPriceZeros(10.5 as unknown as string)).toBe("10.5");
  });
});
