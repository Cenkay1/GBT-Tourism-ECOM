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
  const eArchiveId = process.argv[2];
  const res = await rawRequest("GET", `/e_archives/${eArchiveId}/pdf`);
  console.log(res.status, JSON.stringify(res.json).slice(0,500));
}
main().catch(e => { console.error(e); process.exit(1); });
