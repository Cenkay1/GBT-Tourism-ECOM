import { NextResponse } from "next/server";
import { runDepartureReminders } from "@/lib/notifications";

// Kalkışına ~24 saat kalan rezervasyonlara hatırlatma gönderir.
// Dışarıdan bir zamanlayıcıyla (Vercel Cron veya sunucu cron'u) periyodik çağrılır.
// Güvenlik: CRON_SECRET tanımlıysa Authorization: Bearer <secret> veya ?key=<secret> gerekir.

async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const auth = req.headers.get("authorization");
    const key = url.searchParams.get("key");
    const ok = auth === `Bearer ${secret}` || key === secret;
    if (!ok) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const result = await runDepartureReminders();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
