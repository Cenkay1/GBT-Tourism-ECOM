// Paraşüt firma numarasını (company_id) öğrenir.
//
// Tavuk-yumurta sorununu çözer: PARASUT_COMPANY_ID olmadan API'ye istek
// atılamıyor, ama o numarayı da API'den öğrenmek gerekiyor. Bu script token
// alıp GET /v4/me çağırıyor ve bulduğu firma numarasını yazdırıyor.
//
// Kullanım (proje kökünde, .env.local'de diğer 5 anahtar tanımlıyken):
//   npx tsx scripts/parasut-firma-no.ts
//
// Çıktıdaki numarayı .env.local'e PARASUT_COMPANY_ID olarak ekleyin.
//
// Anahtar değerleri ekrana YAZDIRILMAZ.
import { config as loadEnv } from "dotenv";

loadEnv();
loadEnv({ path: ".env.local", override: true });

function gerekli(ad: string): string {
  const v = process.env[ad]?.trim();
  if (!v) {
    console.error(`HATA: ${ad} tanımlı değil (.env.local).`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const base = (process.env.PARASUT_BASE_URL?.trim() || "https://api.parasut.com")
    .replace(/\/+$/, "");
  const clientId = gerekli("PARASUT_CLIENT_ID");
  const clientSecret = gerekli("PARASUT_CLIENT_SECRET");
  const username = gerekli("PARASUT_USERNAME");
  const password = gerekli("PARASUT_PASSWORD");

  console.log(`Hedef: ${base}\n`);

  console.log("1. Token alınıyor…");
  const tokenRes = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: clientId,
      client_secret: clientSecret,
      username,
      password,
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    }),
  });

  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    console.error(
      `HATA: Token alınamadı (HTTP ${tokenRes.status}).\n` +
        `Paraşüt yanıtı: ${tokenText.slice(0, 300)}\n\n` +
        "Kontrol edin: client_id/secret doğru mu, kullanıcı adı/şifre bu ortama ait mi, " +
        "PARASUT_BASE_URL doğru ortamı gösteriyor mu?"
    );
    process.exit(1);
  }

  const token = (JSON.parse(tokenText) as { access_token?: string }).access_token;
  if (!token) {
    console.error("HATA: Yanıtta access_token yok.");
    process.exit(1);
  }
  console.log("   alındı ✓\n");

  console.log("2. Firma bilgisi okunuyor (GET /v4/me)…");
  const meRes = await fetch(`${base}/v4/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const meText = await meRes.text();
  if (!meRes.ok) {
    console.error(`HATA: /v4/me başarısız (HTTP ${meRes.status}): ${meText.slice(0, 300)}`);
    process.exit(1);
  }

  // Paraşüt'ün /me yanıt şekli sürümden sürüme değişebildiği için birkaç
  // olası konuma bakıyoruz; bulunamazsa ham yanıtı gösterip elle okumayı
  // mümkün kılıyoruz.
  const me = JSON.parse(meText) as Record<string, unknown>;
  const adaylar: unknown[] = [];
  const data = me.data as Record<string, unknown> | undefined;
  const rel = data?.relationships as Record<string, unknown> | undefined;
  const companies = rel?.companies as Record<string, unknown> | undefined;
  const list = companies?.data as { id?: string }[] | undefined;
  if (Array.isArray(list)) adaylar.push(...list.map((c) => c.id));
  const included = me.included as { type?: string; id?: string }[] | undefined;
  if (Array.isArray(included)) {
    adaylar.push(...included.filter((x) => x.type === "companies").map((x) => x.id));
  }

  const bulunan = [...new Set(adaylar.filter((x): x is string => typeof x === "string"))];

  if (bulunan.length === 0) {
    console.log("   Firma numarası otomatik çıkarılamadı. Ham yanıt:\n");
    console.log(meText.slice(0, 2000));
    console.log(
      "\nYukarıdaki yanıtta \"companies\" altındaki \"id\" değerini bulup " +
        ".env.local'e PARASUT_COMPANY_ID olarak ekleyin."
    );
    return;
  }

  console.log("   bulundu ✓\n");
  if (bulunan.length === 1) {
    console.log(`PARASUT_COMPANY_ID=${bulunan[0]}`);
    console.log("\nBu satırı .env.local dosyanıza ekleyin.");
  } else {
    console.log("Birden çok firma bulundu — hangisini kullanacağınızı seçin:");
    for (const id of bulunan) console.log(`  PARASUT_COMPANY_ID=${id}`);
  }
}

main().catch((e) => {
  console.error("\nHATA:", e instanceof Error ? e.message : e);
  process.exit(1);
});
