// Müşteri hesap e-postaları — doğrulama, şifre sıfırlama, hoşgeldin.
// Anahtar yoksa lib/notify.ts simülasyon moduna düşer (link konsola loglanır).
import { sendEmail } from "@/lib/notify";
import { WELCOME_POINTS } from "@/lib/loyalty";
import { emailShell as shell, emailButton as button } from "@/lib/email-layout";

const COMPANY = "Gözdem Burak Turizm";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.AUTH_URL ??
  "http://localhost:3000";

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
