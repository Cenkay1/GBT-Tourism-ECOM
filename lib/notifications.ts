// Rezervasyon bildirimleri — onay (satış anında) ve hatırlatma (kalkıştan 24s önce).
import { prisma } from "@/lib/db";
import { sendSms, sendEmail } from "@/lib/notify";
import { formatPrice } from "@/lib/shared";
import { COMPANY as COMPANY_INFO } from "@/lib/company";
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
  const sms =
    `${COMPANY}\nRezervasyonunuz onaylandı.\n` +
    `${b.tour.title}\nKalkış: ${fmtDateTime(depDate(b))}\n` +
    `${boardingText(b) ? `Biniş: ${boardingText(b)}\n` : ""}` +
    `${plate ? `Araç: ${plate} plakalı otobüs\n` : ""}` +
    `${seatText(b)}\nRez. No: ${ref(b)}`;

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

function siteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
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
        )}. Tutar bankanıza bağlı olarak 3-7 iş günü içinde kartınıza yansır.</p>`
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
