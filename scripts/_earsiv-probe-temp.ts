// GEÇİCİ keşif script'i — iş bitince silinecek. Repoda İZ BIRAKMAZ.
import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local", override: true });

import {
  parasutBaseUrl,
  isParasutConfigured,
  findContactIdByTaxNumber,
  createContact,
  findProductIdByName,
  createProduct,
  createEArchive,
} from "../lib/parasut";

async function rawRequest(method: "GET" | "POST", path: string, body?: any) {
  const creds = {
    clientId: process.env.PARASUT_CLIENT_ID!,
    clientSecret: process.env.PARASUT_CLIENT_SECRET!,
    username: process.env.PARASUT_USERNAME!,
    password: process.env.PARASUT_PASSWORD!,
    companyId: process.env.PARASUT_COMPANY_ID!,
  };
  const tokenRes = await fetch(`${parasutBaseUrl()}/oauth/token`, {
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
  });
  const tokenJson = await tokenRes.json();
  const token = tokenJson.access_token;

  const url = `${parasutBaseUrl()}/v4/${creds.companyId}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function main() {
  if (!isParasutConfigured()) {
    console.error("Paraşüt yapılandırılmamış.");
    process.exit(1);
  }
  const base = parasutBaseUrl();
  if (!base.includes("staging") && !base.includes("-dev")) {
    console.error("STAGING değil, çıkılıyor:", base);
    process.exit(1);
  }

  const tckn = "11111111111";
  let contactId = await findContactIdByTaxNumber(tckn);
  if (!contactId) {
    contactId = await createContact({
      name: "EArsiv Probe Musteri",
      taxNumber: tckn,
      email: "earsiv-probe@example.com",
    });
  }
  console.log("contactId =", contactId);

  let productId = await findProductIdByName("Tur Hizmeti");
  if (!productId) {
    productId = await createProduct({ name: "Tur Hizmeti", vatRate: 0 });
  }
  console.log("productId =", productId);

  // 1) vatRate: 0 ile fatura kes, e-Arşiv dene — exemption code sorusu.
  console.log("\n--- Test A: vatRate=0, city/district YOK ---");
  const invARes = await rawRequest("POST", "/sales_invoices", {
    data: {
      type: "sales_invoices",
      attributes: {
        item_type: "invoice",
        description: "EArsiv Probe A (vatRate=0)",
        issue_date: new Date().toISOString().slice(0, 10),
        currency: "TRL",
      },
      relationships: {
        contact: { data: { id: contactId, type: "contacts" } },
        details: {
          data: [
            {
              type: "sales_invoice_details",
              attributes: {
                quantity: 1,
                unit_price: 77,
                vat_rate: 0,
                description: "EArsiv Probe A",
              },
              relationships: {
                product: { data: { id: productId, type: "products" } },
              },
            },
          ],
        },
      },
    },
  });
  console.log("satış faturası A status:", invARes.status, JSON.stringify(invARes.json).slice(0, 300));
  const invAId = invARes.json?.data?.id;

  if (invAId) {
    const jobId = await createEArchive(invAId);
    console.log("job id A =", jobId);

    // trackable_jobs durumunu birkaç kez poll et
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const jobRes = await rawRequest("GET", `/trackable_jobs/${jobId}`);
      console.log(`job A poll #${i}:`, jobRes.status, JSON.stringify(jobRes.json).slice(0, 500));
      const status = jobRes.json?.data?.attributes?.status;
      if (status === "done" || status === "error") break;
    }

    // sales_invoice'ı active_e_document include ile oku
    const siRes = await rawRequest("GET", `/sales_invoices/${invAId}?include=active_e_document`);
    console.log("sales_invoice A + active_e_document:", siRes.status, JSON.stringify(siRes.json).slice(0, 800));
  }
}

main().catch((e) => {
  console.error("BEKLENMEYEN HATA:", e);
  process.exit(1);
});
