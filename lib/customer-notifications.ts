// Müşteri hesap e-postaları — doğrulama, şifre sıfırlama, hoşgeldin.
// Anahtar yoksa lib/notify.ts simülasyon moduna düşer (link konsola loglanır).
import { sendEmail } from "@/lib/notify";
import { WELCOME_POINTS } from "@/lib/loyalty";

const COMPANY = "Gözdem Burak Turizm";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.AUTH_URL ??
  "http://localhost:3000";

function shell(title: string, body: string): string {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2550">
    <div style="background:#22306a;padding:20px;border-radius:12px 12px 0 0">
      <h1 style="color:#fff;margin:0;font-size:18px">${COMPANY}</h1>
    </div>
    <div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="font-size:16px;margin:0 0 12px">${title}</h2>
      ${body}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Bu e-posta ${COMPANY} tarafından gönderilmiştir. Bu işlemi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
    </div>
  </div>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#6a1f34;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;margin:8px 0">${label}</a>`;
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const url = `${SITE_URL}/eposta-dogrula?token=${encodeURIComponent(token)}`;
  const html = shell(
    "E-posta adresinizi doğrulayın",
    `<p style="font-size:14px;color:#475569">Hesabınızı etkinleştirmek için aşağıdaki bağlantıya tıklayın. Bağlantı 24 saat geçerlidir.</p>
     ${button(url, "E-postamı Doğrula")}
     <p style="font-size:12px;color:#94a3b8;margin-top:12px;word-break:break-all">${url}</p>`
  );
  await sendEmail(email, `${COMPANY} — E-posta Doğrulama`, html);
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const url = `${SITE_URL}/sifre-sifirla?token=${encodeURIComponent(token)}`;
  const html = shell(
    "Şifre sıfırlama isteği",
    `<p style="font-size:14px;color:#475569">Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın. Bağlantı 1 saat geçerlidir.</p>
     ${button(url, "Şifremi Sıfırla")}
     <p style="font-size:12px;color:#94a3b8;margin-top:12px;word-break:break-all">${url}</p>`
  );
  await sendEmail(email, `${COMPANY} — Şifre Sıfırlama`, html);
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const html = shell(
    "Aramıza hoş geldiniz!",
    `<p style="font-size:14px;color:#475569">Sayın ${name}, ${COMPANY} sadakat programına katıldığınız için teşekkürler. Hesabınıza <strong>${WELCOME_POINTS.toLocaleString(
       "tr-TR"
     )} hoşgeldin puanı</strong> tanımlandı.</p>
     <p style="font-size:14px;color:#475569">Ödediğiniz her 1 ₺ hesabınıza 1 puan olarak eklenir; kademe atladıkça yeni avantajların kilidini açarsınız.</p>
     ${button(`${SITE_URL}/hesabim`, "Hesabıma Git")}`
  );
  await sendEmail(email, `${COMPANY} — Hoş Geldiniz`, html);
}
