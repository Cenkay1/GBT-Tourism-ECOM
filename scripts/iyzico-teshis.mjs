// iyzico ödeme akışı teşhis aracı.
//
// "Ödeme sayfası açılmadı / failed" gibi durumlarda hatanın HANGİ KATMANDA
// olduğunu kanıta dayalı olarak ayırır:
//   1. Yapılandırma  — anahtarlar ve API adresi uyumlu mu (sandbox/canlı karışmış mı)
//   2. Token sorgusu — iyzico o ödeme için ne diyor (sayfa açıldı mı, kart mı reddedildi)
//   3. Form üretimi  — yeni bir ödeme sayfası üretilebiliyor mu
//   4. Sayfa erişimi — üretilen sayfa SUNUCUDAN açılıyor mu (istemciden bağımsız kanıt)
//
// Saf Node: node_modules ve build gerektirmez. Prisma'ya dokunmaz, veritabanına
// yazmaz. 3. adım iyzico'da yalnız bir ödeme FORMU oluşturur — tahsilat yapmaz,
// Payment kaydı açmaz; o form kullanılmadan süresi dolar.
//
// Kullanım (proje kökünde, .env'in yanında):
//   node scripts/iyzico-teshis.mjs                      # yapılandırma + form üretimi
//   node scripts/iyzico-teshis.mjs <token>              # ek olarak o token'ı sorgular
//
// Çıktı anahtarların yalnız son 6 hanesini yazar; tam anahtar sızdırmaz.

import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const ENV_PATH = process.env.TESHIS_ENV_PATH ?? ".env";

function loadEnv(path) {
  const out = {};
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.error(
      `HATA: ${path} okunamadı. Bu script'i .env dosyasının bulunduğu dizinden çalıştırın ` +
        `(örn. cd /var/www/gbt/app && node scripts/iyzico-teshis.mjs).`
    );
    process.exit(1);
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv(ENV_PATH);
const apiKey = (env.IYZICO_API_KEY || "").trim();
const secretKey = (env.IYZICO_SECRET_KEY || "").trim();
const baseUrl = ((env.IYZICO_BASE_URL || "").trim() || "https://api.iyzipay.com").replace(
  /\/+$/,
  ""
);
const site = (env.NEXT_PUBLIC_SITE_URL || env.AUTH_URL || "").trim();

const mask = (v) => (v ? `...${v.slice(-6)} (${v.length} karakter)` : "TANIMSIZ");

console.log("=== 1. Yapılandırma ===");
console.log("  iyzico API adresi :", baseUrl);
console.log("  API anahtarı      :", mask(apiKey));
console.log("  Secret anahtarı   :", mask(secretKey));
console.log("  Anahtar tipi      :", apiKey.startsWith("sandbox") ? "SANDBOX" : "canlı");
console.log(
  "  Site adresi       :",
  site || "TANIMSIZ — e-postadaki kalan ödeme bağlantıları localhost gösterir"
);

// Sandbox anahtarı + canlı adres (ya da tersi) kombinasyonu, "token üretildi ama
// ödeme sayfası açılmadı" tablosunun bilinen sebeplerinden biri: token yalnız
// üretildiği ortamda tanınır.
const sandboxKey = apiKey.startsWith("sandbox");
const sandboxUrl = baseUrl.includes("sandbox");
if (apiKey && sandboxKey !== sandboxUrl) {
  console.log(
    "\n  ⚠ UYUŞMAZLIK: anahtar ile API adresi aynı ortama ait değil " +
      `(anahtar: ${sandboxKey ? "sandbox" : "canlı"}, adres: ${sandboxUrl ? "sandbox" : "canlı"}).`
  );
}

if (!apiKey || !secretKey) {
  console.error("\nHATA: IYZICO_API_KEY / IYZICO_SECRET_KEY tanımsız — durduruldu.");
  process.exit(1);
}

// iyzico IYZWSv2 (HMAC-SHA256) imzalı istek. lib/iyzico.ts ile aynı şema.
async function post(uriPath, body) {
  const bodyJson = JSON.stringify(body);
  const rnd = `${Date.now()}${crypto.randomInt(100000, 999999)}`;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(rnd + uriPath + bodyJson, "utf8")
    .digest("hex");
  const authorization =
    "IYZWSv2 " +
    Buffer.from(`apiKey:${apiKey}&randomKey:${rnd}&signature:${signature}`, "utf8").toString(
      "base64"
    );

  let res;
  try {
    res = await fetch(baseUrl + uriPath, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "x-iyzi-rnd": rnd,
        "Content-Type": "application/json",
      },
      body: bodyJson,
    });
  } catch (e) {
    return { error: `iyzico servisine ulaşılamadı: ${e.message}` };
  }

  const text = await res.text();
  try {
    return { http: res.status, json: JSON.parse(text) };
  } catch {
    return { http: res.status, raw: text.slice(0, 400) };
  }
}

const token = process.argv[2];
if (token) {
  console.log("\n=== 2. iyzico bu token için ne diyor? ===");
  const r = await post("/payment/iyzipos/checkoutform/auth/ecom/detail", {
    locale: "tr",
    token,
  });
  if (r.error) {
    console.log("  " + r.error);
  } else {
    console.log("  HTTP:", r.http);
    console.log(JSON.stringify(r.json ?? r.raw, null, 2));
    const ps = r.json?.paymentStatus;
    console.log(
      "  YORUM:",
      !ps
        ? "paymentStatus yok → ödeme sayfası hiç açılmamış (hata tarayıcı ile iyzico arasında)"
        : ps === "SUCCESS"
          ? "ödeme iyzico'da BAŞARILI — callback bize ulaşmamış olabilir"
          : `ödeme sayfası açılmış, sonuç: ${ps}`
    );
  }
} else {
  console.log("\n=== 2. Token sorgusu atlandı (argüman verilmedi) ===");
}

console.log("\n=== 3. Yeni ödeme sayfası üretilebiliyor mu? ===");
const callbackUrl = `${site || "https://www.gozdemburakturizm.com"}/api/odeme/iyzico/callback`;
console.log("  callbackUrl:", callbackUrl);

const init = await post("/payment/iyzipos/checkoutform/initialize/auth/ecom", {
  locale: "tr",
  paymentGroup: "PRODUCT",
  conversationId: "teshis",
  basketId: "teshis",
  price: "1.0",
  paidPrice: "1.0",
  currency: "TRY",
  callbackUrl,
  enabledInstallments: [1],
  buyer: {
    id: "teshis",
    name: "Test",
    surname: "Test",
    identityNumber: "11111111111",
    email: "test@example.com",
    gsmNumber: "+905000000000",
    registrationAddress: "Eregli",
    city: "Zonguldak",
    country: "Turkey",
  },
  shippingAddress: {
    contactName: "Test",
    address: "Eregli",
    city: "Zonguldak",
    country: "Turkey",
  },
  billingAddress: {
    contactName: "Test",
    address: "Eregli",
    city: "Zonguldak",
    country: "Turkey",
  },
  basketItems: [
    {
      id: "teshis",
      name: "Teshis",
      category1: "Tur",
      itemType: "VIRTUAL",
      price: "1.0",
    },
  ],
});

if (init.error) {
  console.log("  " + init.error);
  process.exit(1);
}
console.log("  HTTP:", init.http, "· status:", init.json?.status ?? "(yok)");
if (init.json?.errorCode || init.json?.errorMessage) {
  console.log("  Hata:", init.json.errorCode ?? "", init.json.errorMessage ?? "");
}
const pageUrl = init.json?.paymentPageUrl;
console.log("  paymentPageUrl:", pageUrl ?? "(yok)");
if (init.json?.tokenExpireTime) {
  console.log("  Token geçerlilik süresi:", init.json.tokenExpireTime, "saniye");
}

if (!pageUrl) {
  console.log("\nÖdeme sayfası üretilemedi — yukarıdaki hata mesajı sebebi gösteriyor.");
  process.exit(1);
}

console.log("\n=== 4. Üretilen sayfa SUNUCUDAN açılıyor mu? ===");
try {
  const page = await fetch(pageUrl, { redirect: "manual" });
  const location = page.headers.get("location");
  console.log("  HTTP:", page.status, location ? `→ ${location}` : "");
  const html = await page.text();
  console.log("  Sayfa uzunluğu:", html.length, "karakter");
  console.log("  İlk satırlar  :", html.replace(/\s+/g, " ").slice(0, 250));
  console.log(
    "  YORUM:",
    page.status === 200 && html.length > 500
      ? "sayfa sunucudan açılıyor → altyapı sağlam, sorun istemci tarafında (ağ/eklenti/DNS)"
      : "sayfa sunucudan da açılmıyor → iyzico hesabı ya da ortam sorunu"
  );
} catch (e) {
  console.log("  ERİŞİLEMEDİ:", e.message);
  console.log("  YORUM: sunucudan cpp.iyzipay.com'a çıkış engelli olabilir (güvenlik duvarı).");
}
