// Rezervasyon bildirimleri — onay (satış anında) ve hatırlatma (kalkıştan 24s önce).
import { prisma } from "@/lib/db";
import { sendSms, sendEmail } from "@/lib/notify";
import { formatPrice } from "@/lib/shared";

const COMPANY = "Gözdem Burak Turizm";

function fmtDateTime(d: Date): string {
  return d.toLocaleString("tr-TR", {
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
  };
  passengers: { seatCode: string | null }[];
};

function seatText(b: BookingWithTour): string {
  if (b.tour.bookingType !== "KOLTUK") return `${b.quantity} kişi`;
  const seats = b.passengers.map((p) => p.seatCode).filter(Boolean).join(", ");
  return seats ? `Koltuk: ${seats}` : `${b.quantity} kişi`;
}

function ref(b: BookingWithTour): string {
  return b.id.slice(-8).toUpperCase();
}

// --- Onay (satış anında) ---
export async function sendBookingConfirmation(bookingId: string): Promise<void> {
  const b = (await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tour: true, passengers: true },
  })) as BookingWithTour | null;
  if (!b) return;

  const sms =
    `${COMPANY}\nRezervasyonunuz onaylandı.\n` +
    `${b.tour.title}\nKalkış: ${fmtDateTime(b.tour.departureDate)}\n` +
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
    include: { tour: true, passengers: true },
  })) as BookingWithTour | null;
  if (!b) return;

  const sms =
    `${COMPANY}\nTurunuz yaklaşıyor!\n` +
    `${b.tour.title}\nKalkış: ${fmtDateTime(b.tour.departureDate)}\n` +
    `Kalkış yeri: ${b.tour.departureLocation}\n${seatText(b)}\nRez. No: ${ref(b)}\nİyi yolculuklar.`;

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

  const bookings = await prisma.booking.findMany({
    where: {
      status: "ODENDI",
      reminderSentAt: null,
      tour: { departureDate: { gt: now, lte: in24h } },
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
    ["Tur", b.tour.title],
    ["Kalkış", fmtDateTime(b.tour.departureDate)],
    ["Kalkış Yeri", b.tour.departureLocation],
    ["Detay", seatText(b)],
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
    `<p style="font-size:14px;color:#475569">Sayın ${b.contactName}, ödemeniz alındı ve rezervasyonunuz oluşturuldu.</p>${detailsTable(
      b
    )}`
  );
}

function reminderEmailHtml(b: BookingWithTour): string {
  return shell(
    "Turunuz yaklaşıyor",
    `<p style="font-size:14px;color:#475569">Sayın ${b.contactName}, turunuzun kalkışına az kaldı. Detaylar aşağıdadır.</p>${detailsTable(
      b
    )}<p style="font-size:14px;color:#475569;margin-top:12px">İyi yolculuklar dileriz.</p>`
  );
}
