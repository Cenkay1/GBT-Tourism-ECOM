import { NextResponse } from "next/server";
import { runDepartureReminders, runBalanceReminders } from "@/lib/notifications";
import { releaseUnpaidBalances } from "@/lib/booking";

// Zamanlanmış rezervasyon işleri. Dışarıdan bir zamanlayıcıyla (Vercel Cron
// veya sunucu cron'u) periyodik çağrılır — günde en az bir kez çalışmalı.
//   1. Kalkışına ~24 saat kalan rezervasyonlara tur hatırlatması
//   2. Kalan ödemesi olan rezervasyonlara, son ödeme tarihinden bir gün önce
//      (kalkışa 6 gün) bakiye hatırlatması
//   3. Son ödeme tarihi geçmiş ve bakiyesi kapanmamış rezervasyonların iptali
//      (koltuklar satışa açılır, müşteriye ve acenteye bilgi gider)
//
// Sıra önemli: hatırlatma iptalden ÖNCE çalışır ki aynı koşuda hem hatırlatma
// alıp hem iptal edilen bir rezervasyon oluşmasın.
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

  const reminders = await runDepartureReminders();
  const balanceReminders = await runBalanceReminders();
  const released = await releaseUnpaidBalances();
  return NextResponse.json({
    ok: true,
    sent: reminders.sent,
    balanceRemindersSent: balanceReminders.sent,
    unpaidCancelled: released.cancelled,
    unpaidFailed: released.failed.length,
  });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
