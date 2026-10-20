// Bildirim altyapısı — SMS (NetGSM) + E-posta (SMTP/nodemailer).
// Anahtar/kimlik bilgileri .env'de tanımlı DEĞİLSE "simülasyon" moduna düşer:
// mesajlar gerçekten gönderilmez, konsola loglanır. Böylece akış test edilebilir.
//
// Gerekli .env değişkenleri (bilgiler geldiğinde eklenecek):
//   SMS:   NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_HEADER (onaylı başlık)
//   EMAIL: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

import { normalizePhone } from "@/lib/shared";

export function smsConfigured(): boolean {
  return Boolean(
    process.env.NETGSM_USERCODE &&
      process.env.NETGSM_PASSWORD &&
      process.env.NETGSM_HEADER
  );
}

export function emailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

// --- SMS (NetGSM) ---
export async function sendSms(to: string, message: string): Promise<boolean> {
  const phone = normalizePhone(to);
  if (!smsConfigured()) {
    console.log(`[SMS · simülasyon] → ${phone}\n${message}\n`);
    return true;
  }
  try {
    const params = new URLSearchParams({
      usercode: process.env.NETGSM_USERCODE!,
      password: process.env.NETGSM_PASSWORD!,
      gsmno: phone,
      message,
      msgheader: process.env.NETGSM_HEADER!,
    });
    const res = await fetch("https://api.netgsm.com.tr/sms/send/get?" + params, {
      method: "GET",
    });
    const text = await res.text();
    // NetGSM başarıda "00" veya "01/02" ile başlayan kod döner.
    const ok = /^0[0-2]/.test(text.trim());
    if (!ok) console.error("[SMS · NetGSM hata]", text);
    return ok;
  } catch (e) {
    console.error("[SMS · gönderim hatası]", e);
    return false;
  }
}

// --- E-posta (SMTP) ---
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  // Fatura PDF'i gibi ekler. Opsiyonel — mevcut çağrılar etkilenmez.
  attachments?: { filename: string; content: Buffer }[]
): Promise<boolean> {
  if (!emailConfigured()) {
    console.log(
      `[E-POSTA · simülasyon] → ${to}\nKonu: ${subject}\n` +
        (attachments?.length ? `Ek: ${attachments.map((a) => a.filename).join(", ")}\n` : "")
    );
    return true;
  }
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject,
      html,
      ...(attachments?.length ? { attachments } : {}),
    });
    return true;
  } catch (e) {
    console.error("[E-POSTA · gönderim hatası]", e);
    return false;
  }
}
