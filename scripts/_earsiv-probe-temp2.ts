import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local", override: true });

import { parasutBaseUrl } from "../lib/parasut";

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
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function main() {
  const contactId = process.argv[2];
  const productId = process.argv[3];
  console.log("contactId", contactId, "productId", productId);

  // Deneme: city/district DOLU, vat_exemption_reason_code alan adı tahmini ile gönder
  const attempts = [
    { field: "vat_exemption_reason_code", value: "350" },
  ];

  for (const a of attempts) {
    console.log(`\n--- Deneme: ${a.field}=${a.value} ---`);
    const res = await rawRequest("POST", "/sales_invoices", {
      data: {
        type: "sales_invoices",
        attributes: {
          item_type: "invoice",
          description: `EArsiv Probe B (${a.field}=${a.value})`,
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
                  description: "EArsiv Probe B",
                  [a.field]: a.value,
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
    console.log("fatura status:", res.status, JSON.stringify(res.json).slice(0, 300));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
