// Giden tüm e-postaların ortak HTML kabuğu. Marka renkleri ve yapı tek yerde
// dursun diye ayrıldı — hesap e-postaları (lib/customer-notifications.ts) ve
// rezervasyon bildirimleri (lib/notifications.ts) buradan besleniyor.

const COMPANY = "Gözdem Burak Turizm";

export function emailShell(title: string, body: string): string {
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

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#6a1f34;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;margin:8px 0">${label}</a>`;
}
