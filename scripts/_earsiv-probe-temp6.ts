import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local", override: true });
import { parasutBaseUrl } from "../lib/parasut";

async function rawRequest(method: "GET" | "POST", path: string, body?: any) {
  const creds = {
    clientId: process.env.PARASUT_CLIENT_ID!, clientSecret: process.env.PARASUT_CLIENT_SECRET!,
    username: process.env.PARASUT_USERNAME!, password: process.env.PARASUT_PASSWORD!, companyId: process.env.PARASUT_COMPANY_ID!,
  };
  const tokenRes = await fetch(`${parasutBaseUrl()}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "password", client_id: creds.clientId, client_secret: creds.clientSecret, username: creds.username, password: creds.password, redirect_uri: "urn:ietf:wg:oauth:2.0:oob" }) });
  const token = (await tokenRes.json()).access_token;
  const url = `${parasutBaseUrl()}/v4/${creds.companyId}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function main() {
  const contactId = process.argv[2];
  const productId = process.argv[3];

  console.log("--- Fatura oluştur (vatRate=0) ---");
  const invRes = await rawRequest("POST", "/sales_invoices", {
    data: { type: "sales_invoices", attributes: { item_type: "invoice", description: "Probe F", issue_date: new Date().toISOString().slice(0,10), currency: "TRL" },
      relationships: { contact: { data: { id: contactId, type: "contacts" } },
        details: { data: [{ type: "sales_invoice_details", attributes: { quantity: 1, unit_price: 77, vat_rate: 0, description: "Probe F" }, relationships: { product: { data: { id: productId, type: "products" } } } }] } } },
  });
  const invId = invRes.json?.data?.id;
  console.log("invoiceId:", invId);
  if (!invId) { console.log(JSON.stringify(invRes.json).slice(0,400)); return; }

  console.log("\n--- e_archives: vat_exemption_reason_code DOĞRU YERDE (data.attributes) ---");
  const earchRes = await rawRequest("POST", "/e_archives", {
    data: {
      type: "e_archives",
      attributes: { vat_exemption_reason_code: "350", vat_exemption_reason: "Diğer" },
      relationships: { sales_invoice: { data: { id: invId, type: "sales_invoices" } } },
    },
  });
  console.log("e_archive start:", earchRes.status, JSON.stringify(earchRes.json).slice(0,300));
  const jobId = earchRes.json?.data?.id;
  if (!jobId) return;

  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const jobRes = await rawRequest("GET", `/trackable_jobs/${jobId}`);
    const st = jobRes.json?.data?.attributes?.status;
    console.log(`poll #${i}: ${st}`);
    if (st === "done" || st === "error") { console.log("DETAY:", JSON.stringify(jobRes.json?.data?.attributes)); break; }
  }

  const siRes = await rawRequest("GET", `/sales_invoices/${invId}?include=active_e_document`);
  console.log("\nsales_invoice+active_e_document:");
  console.log(JSON.stringify(siRes.json?.data?.relationships?.active_e_document));
  console.log(JSON.stringify(siRes.json?.included));
}
main().catch(e => { console.error(e); process.exit(1); });
