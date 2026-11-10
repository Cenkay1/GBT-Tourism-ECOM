// Rezervasyon bildirimleri — onay (satış anında) ve hatırlatma (kalkıştan 24s önce).
import { prisma } from "@/lib/db";
import { sendSms, sendEmail } from "@/lib/notify";
import {
  formatPrice,
  balanceOf,
  BALANCE_REMINDER_DAYS,
} from "@/lib/shared";
import {
  COMPANY as COMPANY_INFO,
  siteBaseUrl,
  balancePaymentPath,
} from "@/lib/company";
import { emailShell } from "@/lib/email-layout";

const COMPANY = "Gözdem Burak Turizm";

function fmtDateTime(d: Date): string {
  return d.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type BookingWithTour = {
  id: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  quantity: number;
  totalAmount: number;
  // Tahsilat durumu — ön ödemeli satışta e-postada kalan tutar ve son ödeme
  // tarihi gösterilir (bkz. balanceBlock).
  paidAmount: number;
  balanceDueAt: Date | null;
  balanceToken: string | null;
  tour: {
    title: string;
    departureDate: Date;
    departureLocation: string;
    currency: string;
    bookingType: string;
    bus: { plate: string; name: string } | null;
  };
  // Rezervasyonun ait olduğu sefer — tarihler ve araç buradan okunur (tur birden
  // çok sefer içerebilir; tur üzerindeki tarih yalnız en yakın seferi gösterir).
  departure: {
    departureDate: Date;
    returnDate: Date | null;
    bus: { plate: string; name: string } | null;
  } | null;
  boardingName: string | null;
  boardingPlace: { name: string; boardingTime: string | null } | null;
  passengers: { seatCode: string | null }[];
};

// Yolcunun bineceği aracın plakası: seferin otobüsü > turun varsayılan otobüsü.
function busPlate(b: BookingWithTour): string | null {
  return b.departure?.bus?.plate ?? b.tour.bus?.plate ?? null;
}

// Biniş noktası metni: ad + otobüsün orada olacağı güncel saat.
function boardingText(b: BookingWithTour): string | null {
  const name = b.boardingPlace?.name ?? b.boardingName;
  if (!name) return null;
  const time = b.boardingPlace?.boardingTime;
  return time ? `${name} · saat ${time}` : name;
}

// Rezervasyonun gerçek kalkış tarihi: seferi varsa seferin, yoksa turun tarihi.
function depDate(b: BookingWithTour): Date {
  return b.departure?.departureDate ?? b.tour.departureDate;
}

function seatText(b: BookingWithTour): string {
  if (b.tour.bookingType !== "KOLTUK") return `${b.quantity} kişi`;
  const seats = b.passengers.map((p) => p.seatCode).filter(Boolean).join(", ");
  return seats ? `Koltuk: ${seats}` : `${b.quantity} kişi`;
}

function ref(b: BookingWithTour): string {
  return b.id.slice(-8).toUpperCase();
}

// Görevlinin yazdığı serbest metin HTML gövdesine gömülüyor; işaretleri kaçır.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Rezervasyonun açık bakiyesi.
function balanceAmount(b: BookingWithTour): number {
  return balanceOf(b.totalAmount, b.paidAmount);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Müşterinin kalan ödemeyi kendi yapabileceği gizli bağlantı. Token yoksa
// (eski kayıt) bağlantı verilmez — tahmin edilebilir bir adres üretilmez.
function balancePaymentUrl(b: BookingWithTour): string | null {
  if (!b.balanceToken) return null;
  return `${siteBaseUrl()}${balancePaymentPath(b.balanceToken)}`;
}

function payBalanceButton(b: BookingWithTour): string {
  const url = balancePaymentUrl(b);
  if (!url) return "";
  return `<p style="margin:18px 0 6px">
      <a href="${url}" style="display:inline-block;background:#6a1f34;color:#fff;text-decoration:none;
         padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px">Kalan Ödemeyi Yap</a>
    </p>
    <p style="font-size:12px;color:#94a3b8;margin:0;word-break:break-all">${url}</p>`;
}

// Ön ödemeli satışta e-postaya giren "kalan tutar + son ödeme tarihi + kural"
// bloğu. Bakiye kapalıysa boş döner.
function balanceBlock(b: BookingWithTour): string {
  const balance = balanceAmount(b);
  if (balance <= 0) return "";
  const due = b.balanceDueAt ? fmtDate(b.balanceDueAt) : null;
  return `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px;margin:18px 0">
      <p style="font-size:15px;font-weight:700;color:#9a3412;margin:0 0 8px">Kalan ödemeniz: ${formatPrice(
        balance,
        b.tour.currency
      )}</p>
      <p style="font-size:14px;color:#7c2d12;margin:0 0 6px">
        Ödenen: <strong>${formatPrice(b.paidAmount, b.tour.currency)}</strong> ·
        Toplam: <strong>${formatPrice(b.totalAmount, b.tour.currency)}</strong>
      </p>
      ${
        due
          ? `<p style="font-size:14px;color:#7c2d12;margin:0">Son ödeme tarihi: <strong>${due}</strong></p>`
          : ""
      }
      <p style="font-size:13px;color:#7c2d12;margin:10px 0 0">
        Son ödeme tarihine kadar tamamlanmayan rezervasyonlar iptal edilerek koltuk hakkı
        diğer misafirlerimizin rezervasyonuna açılabilir.
      </p>
      ${payBalanceButton(b)}
    </div>`;
}

// Rezervasyon koşullarının e-postalarda tekrar edilen kısa özeti.
function termsBlock(): string {
  return `<div style="border-top:1px solid #eee;margin-top:20px;padding-top:14px">
      <p style="font-size:13px;font-weight:700;color:#334155;margin:0 0 6px">Rezervasyon ve iptal koşulları</p>
      <ul style="font-size:12px;color:#64748b;margin:0;padding-left:18px;line-height:1.7">
        <li>Kalan ödeme, tur tarihinden en geç 5 gün önce tamamlanmalıdır.</li>
        <li>Son ödeme tarihine kadar tamamlanmayan rezervasyonlar iptal edilebilir ve koltuk satışa açılabilir.</li>
        <li>Tur hareket tarihine 5 günden az kala yapılan iptallerde ödenen ücretin %50'si iade edilir.</li>
        <li>Tur hareket tarihine 2 günden az kala yapılan iptallerde ücret iadesi yapılmaz.</li>
        <li>İptal talepleri yazılı olarak iletilmelidir. Rezervasyon, acentemizin onayıyla başka bir misafire devredilebilir.</li>
      </ul>
    </div>`;
}

// --- Onay (satış anında) ---
export async function sendBookingConfirmation(bookingId: string): Promise<void> {
  const b = (await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tour: { include: { bus: true } },
      departure: { include: { bus: true } },
      boardingPlace: { select: { name: true, boardingTime: true } },
      passengers: true,
    },
  })) as BookingWithTour | null;
  if (!b) return;

  const plate = busPlate(b);
  const balance = balanceAmount(b);
  const sms =
    `${COMPANY}\n${
      balance > 0 ? "Ön ödemeniz alındı, koltuğunuz ayrıldı." : "Rezervasyonunuz onaylandı."
    }\n` +
    `${b.tour.title}\nKalkış: ${fmtDateTime(depDate(b))}\n` +
    `${boardingText(b) ? `Biniş: ${boardingText(b)}\n` : ""}` +
    `${plate ? `Araç: ${plate} plakalı otobüs\n` : ""}` +
    `${seatText(b)}\n` +
    // Ön ödemede kalan tutar ve son tarih SMS'te de yazılır: müşterinin
    // e-postayı görmemesi bakiyeyi unutmasına yol açmamalı.
    `${
      balance > 0
        ? `Kalan: ${formatPrice(balance, b.tour.currency)}${
            b.balanceDueAt ? ` (son ödeme ${fmtDate(b.balanceDueAt)})` : ""
          }\n`
        : ""
    }` +
    `Rez. No: ${ref(b)}`;

  const email = confirmationEmailHtml(b);

  await Promise.allSettled([
    sendSms(b.contactPhone, sms),
    sendEmail(b.contactEmail, `${COMPANY} — Rezervasyon Onayı (${ref(b)})`, email),
  ]);
}

// --- Hatırlatma (kalkıştan ~24s önce) ---
export async function sendDepartureReminder(bookingId: string): Promise<void> {
  const b = (await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tour: { include: { bus: true } },
      departure: { include: { bus: true } },
      boardingPlace: { select: { name: true, boardingTime: true } },
      passengers: true,
    },
  })) as BookingWithTour | null;
  if (!b) return;

  // Kalkıştan bir gün önce giden hatırlatma: plaka yazılır ki müşteri otobüsü
  // tanısın ("... plakalı otobüs").
  const plate = busPlate(b);
  const sms =
    `${COMPANY}\nTurunuz yaklaşıyor!\n` +
    `${b.tour.title}\nKalkış: ${fmtDateTime(depDate(b))}\n` +
    `${boardingText(b) ? `Biniş: ${boardingText(b)}\n` : `Kalkış yeri: ${b.tour.departureLocation}\n`}` +
    `${plate ? `Aracınız: ${plate} plakalı otobüs\n` : ""}` +
    `${seatText(b)}\nRez. No: ${ref(b)}\nİyi yolculuklar.`;

  const email = reminderEmailHtml(b);

  await Promise.allSettled([
    sendSms(b.contactPhone, sms),
    sendEmail(b.contactEmail, `${COMPANY} — Tur Hatırlatma (${ref(b)})`, email),
  ]);
}

// Kalkışına ~24 saat kalan, hatırlatması gitmemiş ödenmiş rezervasyonlara gönder.
export async function runDepartureReminders(): Promise<{ sent: number }> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Hatırlatma seferin kalkış tarihine göre seçilir. Seferi olmayan eski
  // kayıtlar için tur tarihine düşülür.
  const bookings = await prisma.booking.findMany({
    where: {
      status: "ODENDI",
      reminderSentAt: null,
      OR: [
        { departure: { departureDate: { gt: now, lte: in24h } } },
        { departureId: null, tour: { departureDate: { gt: now, lte: in24h } } },
      ],
    },
    select: { id: true },
  });

  let sent = 0;
  for (const b of bookings) {
    await sendDepartureReminder(b.id);
    await prisma.booking.update({
      where: { id: b.id },
      data: { reminderSentAt: new Date() },
    });
    sent++;
  }
  return { sent };
}

// --- Yaş doğrulama: acenteye onay bildirimi ---
// Çocuk/bebek yolcu içeren ödeme alındığında acente adresine mail gider;
// maildeki düğme admin panelindeki rezervasyon sayfasına götürür ve yaş
// oradan onaylanır.
export function adminNotifyEmail(): string {
  return (
    process.env.ADMIN_NOTIFY_EMAIL?.trim() || COMPANY_INFO.emails[0]
  );
}

export async function sendAgeVerificationRequest(bookingId: string): Promise<void> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tour: { include: { bus: true } },
      departure: { include: { bus: true } },
      boardingPlace: { select: { name: true, boardingTime: true } },
      passengers: true,
    },
  });
  if (!b) return;

  // Yalnız yaş onayı bekleyen (çocuk/bebek, henüz onaylanmamış) yolcular.
  const pending = b.passengers.filter(
    (p) => (p.ageBand === "CHILD" || p.ageBand === "INFANT") && !p.ageVerified
  );
  if (pending.length === 0) return;

  const ref = b.id.slice(-8).toUpperCase();
  const adminUrl = `${siteBaseUrl()}/admin/rezervasyonlar/${b.id}`;
  const depText = fmtDateTime(b.departure?.departureDate ?? b.tour.departureDate);

  const rows = pending
    .map((p) => {
      const band = p.ageBand === "CHILD" ? "Çocuk (4-12)" : "Bebek (0-3)";
      const birth = p.birthDate ? p.birthDate.toLocaleDateString("tr-TR") : "—";
      const doc = p.idDocument ? "Kimlik belgesi yüklendi" : "Belge YOK — tam ücret alındı";
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${band}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${birth}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${doc}</td>
      </tr>`;
    })
    .join("");

  const html = shell(
    "Yaş onayı bekleyen rezervasyon",
    `<p style="font-size:14px;color:#475569">
       <strong>${ref}</strong> numaralı rezervasyonda yaş onayı bekleyen ${pending.length} yolcu var.
       Yüklenen kimlik belgesini admin panelde görüp yaşı onaylayabilirsiniz.
     </p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
       <thead>
         <tr style="text-align:left;color:#64748b">
           <th style="padding:6px 8px">Yolcu</th>
           <th style="padding:6px 8px">Yaş Grubu</th>
           <th style="padding:6px 8px">Doğum T.</th>
           <th style="padding:6px 8px">Belge</th>
         </tr>
       </thead>
       <tbody>${rows}</tbody>
     </table>
     <p style="font-size:13px;color:#64748b;margin-top:12px">
       Tur: <strong>${escapeHtml(b.tour.title)}</strong><br>Kalkış: ${depText}<br>
       İletişim: ${escapeHtml(b.contactName)} · ${escapeHtml(b.contactPhone)}
     </p>
     <p style="margin-top:20px">
       <a href="${adminUrl}"
          style="display:inline-block;background:#22306a;color:#fff;text-decoration:none;
                 padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px">
         Admin Panelde İncele ve Onayla
       </a>
     </p>
     <p style="font-size:12px;color:#94a3b8;margin-top:12px">
       Düğme sizi admin paneline götürür; giriş yaptıktan sonra yolcu satırındaki
       “Yaşı Onayla” düğmesini kullanın.
     </p>`
  );

  await sendEmail(adminNotifyEmail(), `Yaş onayı bekliyor — ${ref}`, html);
}

// --- E-posta HTML şablonları ---
function shell(title: string, body: string): string {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2550">
    <div style="background:#22306a;padding:20px;border-radius:12px 12px 0 0">
      <h1 style="color:#fff;margin:0;font-size:18px">${COMPANY}</h1>
    </div>
    <div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="font-size:16px;margin:0 0 12px">${title}</h2>
      ${body}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Bu e-posta ${COMPANY} tarafından gönderilmiştir.</p>
    </div>
  </div>`;
}

function detailsTable(b: BookingWithTour): string {
  const rows: [string, string][] = [
    ["Tur", escapeHtml(b.tour.title)],
    ["Kalkış", fmtDateTime(depDate(b))],
    ...((b.departure?.returnDate
      ? [["Dönüş", fmtDateTime(b.departure.returnDate)]]
      : []) as [string, string][]),
    ["Kalkış Yeri", escapeHtml(b.tour.departureLocation)],
    ...((boardingText(b) ? [["Biniş Noktası", escapeHtml(boardingText(b)!)]] : []) as [
      string,
      string
    ][]),
    // Aracın plakası: müşteri otobüsü tanısın.
    ...((busPlate(b) ? [["Araç", `${escapeHtml(busPlate(b)!)} plakalı otobüs`]] : []) as [
      string,
      string
    ][]),
    ["Detay", escapeHtml(seatText(b))],
    ["Tutar", formatPrice(b.totalAmount, b.tour.currency)],
    // Eksik tahsilat varsa toplamın yanında ne kadarının alındığı da yazılır.
    ...((balanceAmount(b) > 0
      ? [
          ["Ödenen", formatPrice(b.paidAmount, b.tour.currency)],
          ["Kalan", formatPrice(balanceAmount(b), b.tour.currency)],
        ]
      : []) as [string, string][]),
    ["Rezervasyon No", ref(b)],
  ];
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#64748b">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600">${v}</td></tr>`
    )
    .join("")}</table>`;
}

function confirmationEmailHtml(b: BookingWithTour): string {
  const balance = balanceAmount(b);
  if (balance > 0) {
    return shell(
      "Ön ödemeniz alındı, koltuğunuz ayrıldı",
      `<p style="font-size:14px;color:#475569">Sayın ${escapeHtml(
        b.contactName
      )}, ön ödemeniz alındı ve koltuk numaranız size ayrıldı. Rezervasyonunuzun kesinleşmesi için
       kalan ödemenin aşağıda belirtilen son ödeme tarihine kadar tamamlanması gerekmektedir.</p>
       ${detailsTable(b)}${balanceBlock(b)}${termsBlock()}`
    );
  }
  return shell(
    "Rezervasyonunuz onaylandı",
    `<p style="font-size:14px;color:#475569">Sayın ${escapeHtml(b.contactName)}, ödemeniz alındı ve rezervasyonunuz oluşturuldu.</p>${detailsTable(
      b
    )}`
  );
}

function reminderEmailHtml(b: BookingWithTour): string {
  return shell(
    "Turunuz yaklaşıyor",
    `<p style="font-size:14px;color:#475569">Sayın ${escapeHtml(b.contactName)}, turunuzun kalkışına az kaldı. Detaylar aşağıdadır.</p>${detailsTable(
      b
    )}<p style="font-size:14px;color:#475569;margin-top:12px">İyi yolculuklar dileriz.</p>`
  );
}

// --- İptal bildirimi ---
//
// Görevli panelden rezervasyonu iptal edince müşteriye gider. Gönderen adresi
// .env'deki SMTP_FROM'dur (info@gozdemburakturizm.com olarak ayarlanmalı).
// SMS gönderilmez — iptal gerekçesi uzun metin, e-posta için uygun.
export async function sendBookingCancellation(
  bookingId: string,
  reason: string,
  opts?: { refundAmount?: number }
): Promise<void> {
  const b = (await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tour: { include: { bus: true } },
      departure: { include: { bus: true } },
      boardingPlace: { select: { name: true, boardingTime: true } },
      passengers: true,
    },
  })) as BookingWithTour | null;
  if (!b) return;

  const passengerList = b.passengers.length
    ? `<p style="font-size:14px;color:#475569;margin:4px 0"><strong>Yolcular:</strong> ${escapeHtml(seatText(b))}</p>`
    : "";

  // Iade satırı yalnız iade tutarı sıfırdan büyükse gösterilir.
  // Sıfır veya boş değerler gereksiz bir bildirim oluşturmaması için filtrelenir.
  const refundLine =
    opts?.refundAmount != null && opts.refundAmount > 0
      ? `<p style="font-size:14px;color:#475569;margin:12px 0 0"><strong>İade tutarı:</strong> ${formatPrice(
          opts.refundAmount,
          b.tour.currency
        )}. Tutar bankanıza bağlı olarak 7 iş günü içinde kartınıza yansır.</p>`
      : "";

  const html = emailShell(
    "Rezervasyonunuz iptal edildi",
    `<p style="font-size:14px;color:#475569">Sayın ${escapeHtml(b.contactName)}, aşağıdaki rezervasyonunuz iptal edilmiştir.</p>
     <div style="background:#f8fafc;border-radius:10px;padding:16px;margin:16px 0">
       <p style="font-size:14px;color:#475569;margin:4px 0"><strong>Rezervasyon No:</strong> ${ref(b)}</p>
       <p style="font-size:14px;color:#475569;margin:4px 0"><strong>Tur:</strong> ${escapeHtml(b.tour.title)}</p>
       <p style="font-size:14px;color:#475569;margin:4px 0"><strong>Kalkış:</strong> ${fmtDateTime(depDate(b))}</p>
       ${passengerList}
     </div>
     <p style="font-size:14px;color:#475569;margin:0 0 4px"><strong>İptal nedeni:</strong></p>
     <p style="font-size:14px;color:#475569;white-space:pre-wrap;margin:0">${escapeHtml(reason)}</p>
     ${refundLine}
     <p style="font-size:14px;color:#475569;margin-top:20px">Sorularınız için bize ${COMPANY_INFO.phones[0]} numarasından veya ${COMPANY_INFO.emails[0]} adresinden ulaşabilirsiniz.</p>`
  );

  await sendEmail(b.contactEmail, `${COMPANY} — Rezervasyon İptali (${ref(b)})`, html);
}

// --- Fatura e-postası ---
// Tur başladıktan sonra kesilen e-Arşiv faturası PDF ekli gönderilir.
export async function sendInvoiceEmail(
  bookingId: string,
  pdf: Buffer
): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tour: true },
  });
  if (!booking) return false;

  const no = booking.id.slice(-8).toUpperCase();
  const html = emailShell(
    "Faturanız hazır",
    `<p>Sayın ${escapeHtml(booking.contactName)},</p>
     <p><strong>${escapeHtml(booking.tour.title)}</strong> turuna ait e-Arşiv faturanız ektedir.</p>
     <p>Rezervasyon No: <strong>${no}</strong></p>
     <p>İyi yolculuklar dileriz.</p>`
  );

  return sendEmail(booking.contactEmail, `Faturanız — ${booking.tour.title}`, html, [
    { filename: `fatura-${no}.pdf`, content: pdf },
  ]);
}

// --- Kalan ödeme hatırlatması ---------------------------------------------
//
// Kalkışa BALANCE_REMINDER_DAYS (6) gün kalınca, yani son ödeme tarihinden
// bir gün önce, bakiyesi kapanmamış rezervasyonlara gider. Amaç müşterinin
// koltuğunu son gün kaybetmemesi.
export async function sendBalanceReminder(bookingId: string): Promise<void> {
  const b = (await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tour: { include: { bus: true } },
      departure: { include: { bus: true } },
      boardingPlace: { select: { name: true, boardingTime: true } },
      passengers: true,
    },
  })) as BookingWithTour | null;
  if (!b) return;
  const balance = balanceAmount(b);
  if (balance <= 0) return;

  const due = b.balanceDueAt ? fmtDate(b.balanceDueAt) : null;
  const sms =
    `${COMPANY}\nKalan ödeme hatırlatması\n` +
    `${b.tour.title}\nKalkış: ${fmtDateTime(depDate(b))}\n` +
    `Kalan: ${formatPrice(balance, b.tour.currency)}\n` +
    `${due ? `Son ödeme: ${due}\n` : ""}` +
    `Ödeme tamamlanmazsa koltuğunuz serbest bırakılır.\nRez. No: ${ref(b)}`;

  const html = emailShell(
    "Kalan ödemeniz için son hatırlatma",
    `<p style="font-size:14px;color:#475569">Sayın ${escapeHtml(b.contactName)},
       <strong>${escapeHtml(b.tour.title)}</strong> turu için ayrılan koltuğunuzun
       kesinleşmesi için kalan ödemeniz bekleniyor.</p>
     ${balanceBlock(b)}
     ${detailsTable(b)}
     ${termsBlock()}
     <p style="font-size:14px;color:#475569;margin-top:16px">
       Ödemenizi yaptıysanız bu e-postayı yok sayabilirsiniz. Sorularınız için
       ${COMPANY_INFO.phones[0]} numarasından bize ulaşabilirsiniz.
     </p>`
  );

  await Promise.allSettled([
    sendSms(b.contactPhone, sms),
    sendEmail(b.contactEmail, `${COMPANY} — Kalan Ödeme Hatırlatması (${ref(b)})`, html),
  ]);
}

// Kalkışa BALANCE_REMINDER_DAYS gün kalmış, bakiyesi açık ve hatırlatması
// gitmemiş rezervasyonlara hatırlatma gönder. Cron'dan çağrılır.
export async function runBalanceReminders(
  now: Date = new Date()
): Promise<{ sent: number }> {
  const until = new Date(now.getTime() + BALANCE_REMINDER_DAYS * 24 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      status: "ODENDI",
      balanceReminderSentAt: null,
      OR: [
        { departure: { departureDate: { gt: now, lte: until } } },
        { departureId: null, tour: { departureDate: { gt: now, lte: until } } },
      ],
    },
    select: { id: true, totalAmount: true, paidAmount: true },
  });

  let sent = 0;
  for (const b of bookings) {
    if (balanceOf(b.totalAmount, b.paidAmount) <= 0) continue;
    await sendBalanceReminder(b.id);
    await prisma.booking.update({
      where: { id: b.id },
      data: { balanceReminderSentAt: new Date() },
    });
    sent++;
  }
  return { sent };
}

// --- Ödeme tamamlandı bildirimi ------------------------------------------
// Bakiye kapandığında (online kalan ödeme ya da panelden girilen tahsilat)
// müşteriye gider. lib/collections.ts tarafından tetiklenir.
export async function sendBalanceCompleted(bookingId: string): Promise<void> {
  const b = (await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tour: { include: { bus: true } },
      departure: { include: { bus: true } },
      boardingPlace: { select: { name: true, boardingTime: true } },
      passengers: true,
    },
  })) as BookingWithTour | null;
  if (!b) return;
  if (balanceAmount(b) > 0) return;

  const sms =
    `${COMPANY}\nÖdemeniz tamamlandı, rezervasyonunuz kesinleşti.\n` +
    `${b.tour.title}\nKalkış: ${fmtDateTime(depDate(b))}\n` +
    `${seatText(b)}\nRez. No: ${ref(b)}\nİyi yolculuklar.`;

  const html = emailShell(
    "Ödemeniz tamamlandı",
    `<p style="font-size:14px;color:#475569">Sayın ${escapeHtml(b.contactName)},
       ödemenizin tamamı alınmıştır; rezervasyonunuz kesinleşti.</p>
     ${detailsTable(b)}
     <p style="font-size:14px;color:#475569;margin-top:16px">
       Kalkıştan bir gün önce hareket saati ve buluşma noktası bilgileri sizinle
       paylaşılacaktır. İyi yolculuklar dileriz.
     </p>`
  );

  await Promise.allSettled([
    sendSms(b.contactPhone, sms),
    sendEmail(b.contactEmail, `${COMPANY} — Ödemeniz Tamamlandı (${ref(b)})`, html),
  ]);
}

// --- Acenteye özet: ödemesi tamamlanmadığı için iptal edilen rezervasyonlar ---
export async function sendUnpaidReleaseSummary(bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds } },
    include: {
      tour: { select: { title: true, currency: true, departureDate: true } },
      departure: { select: { departureDate: true } },
      passengers: { select: { seatCode: true } },
    },
  });

  const rows = bookings
    .map((b) => {
      const seats = b.passengers.map((p) => p.seatCode).filter(Boolean).join(", ") || "—";
      const dep = b.departure?.departureDate ?? b.tour.departureDate;
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${b.id.slice(-8).toUpperCase()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(b.contactName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(b.tour.title)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${fmtDate(dep)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(seats)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${formatPrice(
          b.paidAmount,
          b.tour.currency
        )} / ${formatPrice(b.totalAmount, b.tour.currency)}</td>
      </tr>`;
    })
    .join("");

  const html = emailShell(
    "Ödemesi tamamlanmayan rezervasyonlar iptal edildi",
    `<p style="font-size:14px;color:#475569">
       Son ödeme tarihi geçtiği için aşağıdaki ${bookings.length} rezervasyon iptal edildi ve
       koltukları satışa açıldı. Müşterilere bilgilendirme e-postası gönderildi.
     </p>
     <p style="font-size:13px;color:#b45309;background:#fffbeb;padding:10px 12px;border-radius:8px">
       Tahsil edilmiş ön ödemelerin iadesi OTOMATİK YAPILMAZ. İade gerekiyorsa
       rezervasyon sayfasından elle işlem yapın.
     </p>
     <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:12px">
       <thead>
         <tr style="text-align:left;color:#64748b">
           <th style="padding:6px 8px">Rez. No</th>
           <th style="padding:6px 8px">Müşteri</th>
           <th style="padding:6px 8px">Tur</th>
           <th style="padding:6px 8px">Kalkış</th>
           <th style="padding:6px 8px">Koltuk</th>
           <th style="padding:6px 8px">Tahsil / Toplam</th>
         </tr>
       </thead>
       <tbody>${rows}</tbody>
     </table>`
  );

  await sendEmail(
    adminNotifyEmail(),
    `Ödemesi tamamlanmayan ${bookings.length} rezervasyon iptal edildi`,
    html
  );
}

// --- "Tatil & Otel" talebi: acenteye bildirim ----------------------------
export async function sendHotelInquiryNotice(inquiryId: string): Promise<boolean> {
  const q = await prisma.hotelInquiry.findUnique({ where: { id: inquiryId } });
  if (!q) return false;

  const html = emailShell(
    "Yeni tatil & otel talebi",
    `<p style="font-size:14px;color:#475569">Siteden yeni bir tatil &amp; otel talebi geldi.</p>
     <div style="background:#f8fafc;border-radius:10px;padding:16px;margin:16px 0">
       <p style="font-size:15px;color:#1a2550;margin:4px 0"><strong>Ad Soyad:</strong> ${escapeHtml(
         `${q.firstName} ${q.lastName}`
       )}</p>
       <p style="font-size:15px;color:#1a2550;margin:4px 0"><strong>Telefon:</strong>
         <a href="tel:${escapeHtml(q.phone)}" style="color:#6a1f34">${escapeHtml(q.phone)}</a></p>
       ${
         q.note
           ? `<p style="font-size:14px;color:#475569;margin:10px 0 0;white-space:pre-wrap"><strong>Not:</strong> ${escapeHtml(
               q.note
             )}</p>`
           : ""
       }
     </div>
     <p style="font-size:13px;color:#64748b">
       Talep yönetim panelindeki <strong>Talepler</strong> sekmesinde de kayıtlıdır.
     </p>
     <p style="margin-top:16px">
       <a href="${siteBaseUrl()}/admin/talepler"
          style="display:inline-block;background:#22306a;color:#fff;text-decoration:none;
                 padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px">
         Panelde Görüntüle
       </a>
     </p>`
  );

  return sendEmail(
    adminNotifyEmail(),
    `Tatil & Otel talebi — ${q.firstName} ${q.lastName}`,
    html
  );
}
