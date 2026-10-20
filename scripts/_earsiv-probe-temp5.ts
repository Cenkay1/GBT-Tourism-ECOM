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

async function tryCode(contactId: string, productId: string, code: any, reason?: string, label?: string) {
  console.log(`\n=== ${label ?? code} ===`);
  const invRes = await rawRequest("POST", "/sales_invoices", {
    data: { type: "sales_invoices", attributes: { item_type: "invoice", description: `Probe E`, issue_date: new Date().toISOString().slice(0,10), currency: "TRL" },
      relationships: { contact: { data: { id: contactId, type: "contacts" } },
        details: { data: [{ type: "sales_invoice_details", attributes: { quantity: 1, unit_price: 77, vat_rate: 0, description: "Probe E", vat_exemption_reason_code: code, ...(reason ? { vat_exemption_reason: reason } : {}) }, relationships: { product: { data: { id: productId, type: "products" } } } }] } } },
  });
  const invId = invRes.json?.data?.id;
  if (!invId) { console.log("fatura oluşmadı:", invRes.status, JSON.stringify(invRes.json).slice(0,300)); return; }

  const earchRes = await rawRequest("POST", "/e_archives", { data: { type: "e_archives", relationships: { sales_invoice: { data: { id: invId, type: "sales_invoices" } } } } });
  const jobId = earchRes.json?.data?.id;
  if (!jobId) { console.log("job başlamadı:", earchRes.status, JSON.stringify(earchRes.json).slice(0,300)); return; }

  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const jobRes = await rawRequest("GET", `/trackable_jobs/${jobId}`);
    const st = jobRes.json?.data?.attributes?.status;
    if (st === "done" || st === "error") { console.log("SONUÇ:", st, JSON.stringify(jobRes.json?.data?.attributes?.errors)); return; }
  }
  console.log("zaman aşımı");
}

async function main() {
  const contactId = process.argv[2];
  const productId = process.argv[3];
  await tryCode(contactId, productId, 350, "Diğer", "integer 350");
  await tryCode(contactId, productId, 301, undefined, "integer 301");
  await tryCode(contactId, productId, "İhracat İstisnası", undefined, "word: İhracat İstisnası");
  await tryCode(contactId, productId, "diger", "Diğer", "word: diger");
}
main().catch(e => { console.error(e); process.exit(1); });
