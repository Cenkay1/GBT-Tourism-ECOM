import { NextResponse } from "next/server";
import { runPendingInvoices } from "@/lib/parasut-invoice";
import { isParasutConfigured } from "@/lib/parasut";

// Kalkışı geçmiş, ödenmiş online rezervasyonlara e-Arşiv faturası keser.
// Dışarıdan bir zamanlayıcıyla (sunucu cron'u) GÜNDE BİR çağrılır.
// Güvenlik: Authorization: Bearer <secret> veya ?key=<secret> gerekir.
//
// FAIL-CLOSED: app/api/cron/reminders ucundaki desenin aksine, CRON_SECRET
// tanımsızken bu uç KONTROLSÜZ ÇALIŞMAZ, tersine tamamen REDDEDER. Reminders
// yalnız hatırlatma maili atar; bu uç ise GİB'e iletilen yasal bir belge
// (e-Arşiv faturası) keser — yanlış yapılandırılmış bir ortamda sessizce
// açık kalması kabul edilemez.
async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET tanımlı değil — fatura ucu güvenlik gereği kapalı." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const key = url.searchParams.get("key");
  const ok = auth === `Bearer ${secret}` || key === secret;
  if (!ok) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  // Paraşüt yapılandırılmamışken runPendingInvoices sessizce sıfır döner ve
  // yanıt "işlenecek iş yoktu" ile ayırt edilemez. Entegrasyonun kapalı
  // olması yapılandırma hatası da olabilir (ör. ortam değişkeni unutulmuş bir
  // deploy): faturalar hiç kesilmezken cron günlerce ok:true raporlar. Bu
  // yüzden durum yanıtta açıkça işaretleniyor.
  if (!isParasutConfigured()) {
    const bos = await runPendingInvoices();
    return NextResponse.json({
      ok: true,
      yapilandirilmamis: true,
      uyari: "Paraşüt anahtarları tanımlı değil — fatura kesilmedi.",
      ...bos,
    });
  }

  const result = await runPendingInvoices();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
