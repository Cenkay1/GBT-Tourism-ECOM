import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";
import type { FormState } from "@/lib/form-state";

// retryInvoice yetki kontrolü için getSessionEmail çağırıyor; bu normalde
// next/headers cookies()'e dayanıyor ve test ortamında (gerçek bir HTTP
// isteği yokken) çağrılamaz. Testler yetkilendirmeyi değil, mükerrer fatura
// kilidini sınadığı için her zaman oturum açık gibi davranıyoruz.
vi.mock("@/lib/auth", () => ({
  getSessionEmail: vi.fn(async () => "admin@test.com"),
}));

// revalidatePath gerçek bir Next.js istek/render bağlamı (static generation
// store) gerektiriyor; testte bu yok. Boru hattının çağrılıp çağrılmadığını
// sınadığımız için önbellek geçersizleştirmesi burada ilgisiz — sahteleniyor.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// lib/parasut-invoice.ts'e DOKUNULMUYOR — boru hattının kendisi burada test
// edilmiyor, sadece retryInvoice'un onu ÇAĞIRIP ÇAĞIRMADIĞI sınanıyor. Bu
// yüzden yalnız issueInvoiceForBooking sahteleniyor; modülün geri kalanı
// (ör. bayatlık eşiği STALE_ISLENIYOR_MS — retryInvoice onu buradan okuyor)
// GERÇEK değerleriyle kalır, aksi halde test gerçek eşiği değil kendi
// uydurduğu bir eşiği sınamış olur.
const issueInvoiceForBookingMock = vi.fn(async (_bookingId: string) => ({
  ok: true,
  status: "GONDERILDI",
}));
vi.mock("@/lib/parasut-invoice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/parasut-invoice")>();
  return {
    ...actual,
    issueInvoiceForBooking: (...args: unknown[]) =>
      issueInvoiceForBookingMock(...(args as [string])),
  };
});

function fdWith(bookingId: string): FormData {
  const fd = new FormData();
  fd.set("bookingId", bookingId);
  return fd;
}

const EMPTY_STATE: FormState = {};

beforeEach(() => {
  issueInvoiceForBookingMock.mockClear();
});

describe("retryInvoice — mükerrer fatura kilidi", () => {
  it("GONDERILDI kayıtta boru hattını ÇAĞIRMAZ ve durumu değiştirmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);
    await prisma.invoice.create({
      data: {
        bookingId,
        status: "GONDERILDI",
        invoiceId: "inv-1",
        eArchiveId: "ea-1",
        emailSentAt: new Date(),
      },
    });

    const { retryInvoice } = await import("@/lib/invoice-actions");
    const res = await retryInvoice(EMPTY_STATE, fdWith(bookingId));

    expect(issueInvoiceForBookingMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/zaten kesilmiş ve gönderilmiş/);

    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("GONDERILDI");
    expect(inv?.attempts).toBe(0);
  });

  it("taze ISLENIYOR kayıtta ÇAĞIRMAZ (aktif çalışma sürüyor sayılır)", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);
    await prisma.invoice.create({ data: { bookingId, status: "ISLENIYOR" } });

    const { retryInvoice } = await import("@/lib/invoice-actions");
    const res = await retryInvoice(EMPTY_STATE, fdWith(bookingId));

    expect(issueInvoiceForBookingMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/işleniyor/);

    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("ISLENIYOR");
  });

  it("bayatlamış ISLENIYOR kayıtta sıfırlar ve ÇAĞIRIR (çökmüş çalışmanın kurtarılması)", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);
    const invoice = await prisma.invoice.create({
      data: { bookingId, status: "ISLENIYOR" },
    });

    // prisma.invoice.update `updatedAt`'i otomatik şimdiki zamana çeker;
    // bayat bir kayıt kurmak için doğrudan SQL ile geçmişe çekiyoruz (eşik
    // retryInvoice içinde 10 dakika — burada 11 dakika öncesine çekiliyor).
    const bayatTarih = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    await prisma.$executeRawUnsafe(
      `UPDATE "Invoice" SET "updatedAt" = ? WHERE "id" = ?`,
      bayatTarih,
      invoice.id
    );

    const { retryInvoice } = await import("@/lib/invoice-actions");
    const res = await retryInvoice(EMPTY_STATE, fdWith(bookingId));

    expect(issueInvoiceForBookingMock).toHaveBeenCalledWith(bookingId);
    expect(res.ok).toBe(true);
  });

  it("BASARISIZ kayıtta attempts sıfırlanır ve çağırır", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);
    await prisma.invoice.create({
      data: {
        bookingId,
        status: "BASARISIZ",
        attempts: 3,
        errorMessage: "eski hata",
      },
    });

    const { retryInvoice } = await import("@/lib/invoice-actions");
    const res = await retryInvoice(EMPTY_STATE, fdWith(bookingId));

    expect(issueInvoiceForBookingMock).toHaveBeenCalledWith(bookingId);
    expect(res.ok).toBe(true);

    // issueInvoiceForBooking sahte (DB'ye dokunmuyor); sıfırlamanın
    // GERÇEKTEN DB'ye yazıldığını doğrudan kontrol ediyoruz.
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.attempts).toBe(0);
    expect(inv?.status).toBe("BEKLIYOR");
    expect(inv?.errorMessage).toBeNull();
  });

  it("fatura kaydı hiç yoksa boru hattını ÇAĞIRMAZ", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);
    // Kasıtlı olarak Invoice satırı oluşturulmadı.

    const { retryInvoice } = await import("@/lib/invoice-actions");
    const res = await retryInvoice(EMPTY_STATE, fdWith(bookingId));

    expect(issueInvoiceForBookingMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
  });
});
