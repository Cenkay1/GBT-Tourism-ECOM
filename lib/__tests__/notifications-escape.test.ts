// lib/notifications.ts giden e-posta gövdelerinde müşteri kaynaklı değerlerin
// (ad/soyad, tur başlığı vb.) HTML olarak kaçırıldığını doğrular. Kaçırma
// yoksa kötü niyetli bir müşteri adı/iletişim bilgisiyle HTML/script enjekte
// edebilir (bkz. sendAgeVerificationRequest → acenteye giden mail).
import { describe, it, expect, afterEach, vi } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";

// nodemailer `lib/notify.ts` içinde dinamik import ile yükleniyor; vi.mock
// dosya kapsamlıdır, bu yüzden en üstte duruyor (parasut-invoice.test.ts'teki
// desenin aynısı).
const sendMailMock = vi.fn().mockResolvedValue({ messageId: "test" });
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
  createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
}));

const SMTP_ENV_KEYS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const;
const savedSmtpEnv: Record<string, string | undefined> = {};

function withSmtpConfigured() {
  for (const k of SMTP_ENV_KEYS) savedSmtpEnv[k] = process.env[k];
  process.env.SMTP_HOST = "smtp.test.local";
  process.env.SMTP_USER = "test@example.com";
  process.env.SMTP_PASS = "sifre";
}

afterEach(() => {
  for (const k of SMTP_ENV_KEYS) {
    if (savedSmtpEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedSmtpEnv[k];
  }
  sendMailMock.mockClear();
});

describe("notifications: HTML kaçırma", () => {
  it("fatura mailinde müşteri adındaki <script> etiketi ham geçmez, kaçırılmış geçer", async () => {
    withSmtpConfigured();

    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);

    const kotuAd = '<script>alert(1)</script>';
    await prisma.booking.update({
      where: { id: bookingId },
      data: { contactName: kotuAd },
    });

    const { sendInvoiceEmail } = await import("@/lib/notifications");
    const ok = await sendInvoiceEmail(bookingId, Buffer.from("%PDF-1.4 test"));
    expect(ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const html: string = sendMailMock.mock.calls[0][0].html;
    expect(html).not.toContain(kotuAd);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("tur başlığındaki <b> etiketi fatura mailinde kaçırılır", async () => {
    withSmtpConfigured();

    const prisma = await getTestPrisma();
    const { bookingId, tourId } = await createTestBooking(prisma);

    const kotuBaslik = "Kapadokya <b>Turu</b>";
    await prisma.tour.update({
      where: { id: tourId },
      data: { title: kotuBaslik },
    });

    const { sendInvoiceEmail } = await import("@/lib/notifications");
    await sendInvoiceEmail(bookingId, Buffer.from("%PDF-1.4 test"));

    const html: string = sendMailMock.mock.calls[0][0].html;
    expect(html).not.toContain("<b>Turu</b>");
    expect(html).toContain("Kapadokya &lt;b&gt;Turu&lt;/b&gt;");
  });
});
