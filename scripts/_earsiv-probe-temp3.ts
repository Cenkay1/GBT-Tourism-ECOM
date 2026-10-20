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
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "password", client_id: creds.clientId, client_secret: creds.clientSecret, username: creds.username, password: creds.password, redirect_uri: "urn:ietf:wg:oauth:2.0:oob" }),
  });
  const token = (await tokenRes.json()).access_token;
  const url = `${parasutBaseUrl()}/v4/${creds.companyId}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function main() {
  console.log("--- Yeni cari: city/district DOLU ---");
  const contactRes = await rawRequest("POST", "/contacts", {
    data: {
      type: "contacts",
      attributes: {
        name: "EArsiv Probe Musteri CityDistrict",
        contact_type: "person",
        account_type: "customer",
        tax_number: "11111111111",
        email: "earsiv-probe-cd@example.com",
        city: "Zonguldak",
        district: "Ereğli",
      },
    },
  });
  console.log("contact create:", contactRes.status, JSON.stringify(contactRes.json).slice(0,400));
  const contactId = contactRes.json?.data?.id;
  if (!contactId) return;

  const productId = "291543";
  console.log("\n--- Fatura: vatRate=0, vat_exemption_reason_code=350, city/district DOLU ---");
  const invRes = await rawRequest("POST", "/sales_invoices", {
    data: {
      type: "sales_invoices",
      attributes: { item_type: "invoice", description: "EArsiv Probe C", issue_date: new Date().toISOString().slice(0,10), currency: "TRL" },
      relationships: {
        contact: { data: { id: contactId, type: "contacts" } },
        details: { data: [{ type: "sales_invoice_details", attributes: { quantity: 1, unit_price: 77, vat_rate: 0, description: "EArsiv Probe C", vat_exemption_reason_code: "350" }, relationships: { product: { data: { id: productId, type: "products" } } } }] },
      },
    },
  });
  console.log("fatura:", invRes.status, JSON.stringify(invRes.json).slice(0,300));
  const invId = invRes.json?.data?.id;
  if (!invId) return;

  const earchRes = await rawRequest("POST", "/e_archives", {
    data: { type: "e_archives", relationships: { sales_invoice: { data: { id: invId, type: "sales_invoices" } } } },
  });
  console.log("e_archive job start:", earchRes.status, JSON.stringify(earchRes.json).slice(0,300));
  const jobId = earchRes.json?.data?.id;
  if (!jobId) return;

  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const jobRes = await rawRequest("GET", `/trackable_jobs/${jobId}`);
    console.log(`poll #${i}:`, jobRes.status, JSON.stringify(jobRes.json).slice(0,500));
    const status = jobRes.json?.data?.attributes?.status;
    if (status === "done" || status === "error") break;
  }

  const siRes = await rawRequest("GET", `/sales_invoices/${invId}?include=active_e_document`);
  console.log("sales_invoice+active_e_document:", siRes.status, JSON.stringify(siRes.json).slice(0, 1500));
}
main().catch(e => { console.error(e); process.exit(1); });
