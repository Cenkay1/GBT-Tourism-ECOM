import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { getTestPrisma, createTestBooking } from "./helpers/db";

// nodemailer `lib/notify.ts` içinde dinamik import (`await import("nodemailer")`)
// ile yükleniyor; vi.mock modül kaydını baştan değiştirdiği için dinamik import
// da sahte modülü yakalar.
const sendMailMock = vi.fn().mockResolvedValue({ messageId: "test" });
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
  createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
}));

// HTTP katmanı tamamen mock'lanır: testler ağa çıkmaz, boru hattının
// durum yönetimi ve idempotency'si sınanır. DİKKAT: vi.mock dosya kapsamlıdır
// ve bu dosyadaki TÜM testlere uygulanır — bu yüzden diğer mock'un yanında,
// dosyanın başında duruyor (hoisting sayesinde aşağıda da çalışırdı ama
// okuyan göremezdi).
vi.mock("@/lib/parasut", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/parasut")>();
  return {
    ...actual,
    isParasutConfigured: vi.fn(() => true),
    findContactIdByTaxNumber: vi.fn(async () => null),
    createContact: vi.fn(async () => "c-1"),
    findProductIdByName: vi.fn(async () => null),
    createProduct: vi.fn(async () => "p-1"),
    createSalesInvoice: vi.fn(async () => "inv-1"),
    createEArchive: vi.fn(async () => "ea-1"),
    fetchEArchivePdf: vi.fn(async () => Buffer.from("%PDF-1.4")),
  };
});

// KDV oranı 0 (muaf) iken boru hattının e-Arşiv'e gönderdiği muafiyet kodu
// artık env'den okunuyor (bkz. lib/parasut.ts parasutKdvMuafiyetKodu) — bir
// iş kararı olduğu için kodda uydurulmuyor. Bu dosyadaki testlerin BÜYÜK
// ÇOĞUNLUĞU "env'de bir kod tanımlıysa akış başarıyla ilerler" senaryosunu
// sınadığı için varsayılan olarak burada bir test değeri atanır; env
// değişkeninin TANIMLI OLMADIĞI durumu sınayan test (aşağıda) kendi içinde
// bunu geçici olarak siler.
let savedMuafiyetKodu: string | undefined;
let savedMuafiyetNedeni: string | undefined;
beforeEach(() => {
  savedMuafiyetKodu = process.env.PARASUT_KDV_MUAFIYET_KODU;
  savedMuafiyetNedeni = process.env.PARASUT_KDV_MUAFIYET_NEDENI;
  process.env.PARASUT_KDV_MUAFIYET_KODU = "350";
  process.env.PARASUT_KDV_MUAFIYET_NEDENI = "Diğer";
});
afterEach(() => {
  if (savedMuafiyetKodu === undefined) delete process.env.PARASUT_KDV_MUAFIYET_KODU;
  else process.env.PARASUT_KDV_MUAFIYET_KODU = savedMuafiyetKodu;
  if (savedMuafiyetNedeni === undefined) delete process.env.PARASUT_KDV_MUAFIYET_NEDENI;
  else process.env.PARASUT_KDV_MUAFIYET_NEDENI = savedMuafiyetNedeni;
});

describe("Invoice şeması", () => {
  it("rezervasyona fatura kaydı bağlanabilir", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);

    const invoice = await prisma.invoice.create({
      data: { bookingId, status: "BEKLIYOR" },
    });

    expect(invoice.provider).toBe("PARASUT");
    expect(invoice.attempts).toBe(0);
    expect(invoice.status).toBe("BEKLIYOR");
  });

  it("aynı rezervasyona ikinci fatura kaydı açılamaz", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);

    await prisma.invoice.create({ data: { bookingId } });

    await expect(
      prisma.invoice.create({ data: { bookingId } })
    ).rejects.toThrow();
  });
});

import {
  invoiceBlocker,
  blockerMessage,
  isoDate,
  invoiceDescription,
  invoiceLine,
  PARASUT_CURRENCY,
  __resetParasutProductCacheForTest,
} from "@/lib/parasut-invoice";

describe("fatura engelleri", () => {
  it("TRY ve TC uyruk engelsizdir", () => {
    expect(invoiceBlocker({ currency: "TRY", nationality: "TC" })).toBeNull();
  });

  it("döviz turu engellenir", () => {
    expect(invoiceBlocker({ currency: "EUR", nationality: "TC" })).toBe("DOVIZ");
  });

  it("yabancı uyruklu alıcı engellenir", () => {
    expect(invoiceBlocker({ currency: "TRY", nationality: "FOREIGN" })).toBe("YABANCI");
  });

  it("uyruk boşsa TC sayılır", () => {
    expect(invoiceBlocker({ currency: "TRY", nationality: null })).toBeNull();
  });

  it("döviz, yabancı uyruktan önce gelir", () => {
    expect(invoiceBlocker({ currency: "EUR", nationality: "FOREIGN" })).toBe("DOVIZ");
  });

  it("her engelin açıklaması vardır", () => {
    expect(blockerMessage("DOVIZ")).toMatch(/döviz/i);
    expect(blockerMessage("YABANCI")).toMatch(/yabancı/i);
  });
});

describe("gövde yardımcıları", () => {
  it("tarihi yyyy-mm-dd biçimine çevirir", () => {
    expect(isoDate(new Date("2026-08-13T20:30:00.000Z"))).toBe("2026-08-13");
  });

  it("TRT gece yarısından hemen sonrasını bir gün geriye kaydırmaz", () => {
    // UTC 2026-08-13 22:00 = TRT 2026-08-14 01:00 (UTC+3)
    expect(isoDate(new Date("2026-08-13T22:00:00.000Z"))).toBe("2026-08-14");
  });

  it("isoDate çıktısı gerçekten yyyy-mm-dd biçimindedir", () => {
    expect(isoDate(new Date("2026-08-13T20:30:00.000Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
  });

  it("açıklamada tur adı ve kalkış tarihi geçer", () => {
    const d = new Date("2026-08-12T17:00:00.000Z");
    const text = invoiceDescription("Büyük Balkan Turu", d);
    expect(text).toContain("Büyük Balkan Turu");
    expect(text).toContain("2026");
  });

  it("açıklama TRT gece yarısından hemen sonrasında da doğru günü yazar", () => {
    // UTC 2026-08-13 22:00 = TRT 2026-08-14 01:00 (UTC+3)
    const d = new Date("2026-08-13T22:00:00.000Z");
    const text = invoiceDescription("Büyük Balkan Turu", d);
    expect(text).toContain("14 Ağustos 2026");
  });

  it("tam bölünüyorsa kişi sayısı kadar kalem üretir", () => {
    expect(invoiceLine(1500, 3)).toEqual({ quantity: 3, unitPrice: 500 });
  });

  it("bölünmüyorsa tek kaleme düşer ve tüm tutarı yazar", () => {
    expect(invoiceLine(100, 3)).toEqual({ quantity: 1, unitPrice: 100 });
  });

  it("kişi sayısı 0 ise toplamı tek kaleme yazar", () => {
    expect(invoiceLine(1500, 0)).toEqual({ quantity: 1, unitPrice: 1500 });
  });

  it("değişmez kural: quantity × unitPrice her zaman totalAmount'a eşittir", () => {
    const cases: Array<[number, number]> = [
      [1500, 3],
      [100, 3],
      [1500, 0],
      [999.99, 7],
      [250, 2],
      [1, 3],
      [0, 5],
    ];

    for (const [totalAmount, passengerCount] of cases) {
      const { quantity, unitPrice } = invoiceLine(totalAmount, passengerCount);
      const toplamKurus = Math.round(totalAmount * 100);
      const uretilenKurus = Math.round(unitPrice * 100) * quantity;
      expect(uretilenKurus).toBe(toplamKurus);
    }
  });

  it("TRY, Paraşüt kodu TRL'ye eşlenir", () => {
    expect(PARASUT_CURRENCY.TRY).toBe("TRL");
  });
});

describe("sendInvoiceEmail", () => {
  it("SMTP yapılandırılmamışken simülasyona düşer ve başarı döner", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma);
    const { sendInvoiceEmail } = await import("@/lib/notifications");

    const ok = await sendInvoiceEmail(bookingId, Buffer.from("%PDF-1.4 test"));

    expect(ok).toBe(true);
  });

  it("rezervasyon yoksa false döner", async () => {
    const { sendInvoiceEmail } = await import("@/lib/notifications");
    expect(await sendInvoiceEmail("yok-boyle-id", Buffer.from("x"))).toBe(false);
  });

  describe("SMTP yapılandırılmışken", () => {
    const SMTP_ENV_KEYS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const;
    const savedSmtpEnv: Record<string, string | undefined> = {};

    afterEach(() => {
      for (const k of SMTP_ENV_KEYS) {
        if (savedSmtpEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedSmtpEnv[k];
      }
      sendMailMock.mockClear();
    });

    it("PDF eki gerçekten nodemailer'a gönderilen payload'a ekleniyor", async () => {
      for (const k of SMTP_ENV_KEYS) savedSmtpEnv[k] = process.env[k];
      process.env.SMTP_HOST = "smtp.test.local";
      process.env.SMTP_USER = "test@example.com";
      process.env.SMTP_PASS = "sifre";

      const prisma = await getTestPrisma();
      const { bookingId } = await createTestBooking(prisma);
      const { sendInvoiceEmail } = await import("@/lib/notifications");

      const pdf = Buffer.from("%PDF-1.4 test");
      const ok = await sendInvoiceEmail(bookingId, pdf);

      expect(ok).toBe(true);
      expect(sendMailMock).toHaveBeenCalledTimes(1);

      const payload = sendMailMock.mock.calls[0][0];
      expect(Array.isArray(payload.attachments)).toBe(true);
      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].filename).toMatch(/^fatura-.*\.pdf$/);
      expect(payload.attachments[0].content).toBe(pdf);
    });
  });
});

describe("issueInvoiceForBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ürün önbelleği süreç belleğinde tutuluyor; testler arası sızmasın.
    __resetParasutProductCacheForTest();
  });

  it("baştan sona çalışır ve GONDERILDI durumuna geçer", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(res.ok).toBe(true);
    expect(res.status).toBe("GONDERILDI");
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.invoiceId).toBe("inv-1");
    expect(inv?.eArchiveId).toBe("ea-1");
    expect(inv?.emailSentAt).not.toBeNull();
  });

  it("fatura zaten kesilmişse ikinci kez kesmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);
    vi.clearAllMocks();
    await issueInvoiceForBooking(bookingId);

    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
  });

  it("yarıda kalmışsa fatura adımını atlayıp devam eder", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    // Fatura kesilmiş ama e-Arşiv gönderilmemiş durumu kur.
    await prisma.invoice.create({
      data: { bookingId, contactId: "c-1", invoiceId: "inv-1", status: "KESILDI" },
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
    // KDV oranı env'de tanımsız → 0 sayılır → boru hattı muafiyet kodunu
    // PARASUT_KDV_MUAFIYET_KODU'ndan (bu dosyanın üst beforeEach'inde "350"
    // olarak ayarlandı) doldurmalı.
    expect(parasut.createEArchive).toHaveBeenCalledWith(
      "inv-1",
      expect.objectContaining({ vatExemptionReasonCode: expect.any(String) })
    );
    expect(res.status).toBe("GONDERILDI");
  });

  it("döviz turu ELLE işaretlenir, fatura kesilmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      currency: "EUR",
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(res.status).toBe("ELLE");
    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.errorMessage).toMatch(/döviz/i);
    // ELLE bir hata değil, kapsam dışı işareti: deneme sayacı ARTMAMALI —
    // aksi halde kayıt sessizce MAX_ATTEMPTS'e dayanıp görevlinin elle
    // tetiklemesini de bloke ederdi.
    expect(inv?.attempts).toBe(0);
  });

  it("Paraşüt hatasında BASARISIZ yazar ve deneme sayısını artırır", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    vi.mocked(parasut.createSalesInvoice).mockRejectedValueOnce(
      new Error("Geçersiz vergi numarası")
    );
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(res.ok).toBe(false);
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("BASARISIZ");
    expect(inv?.attempts).toBe(1);
    expect(inv?.errorMessage).toMatch(/Geçersiz vergi numarası/);
  });

  it("fatura alıcısı seçilen yolcunun TCKN'si kullanılır", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { invoicePassengerIndex: 1 },
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);

    expect(parasut.findContactIdByTaxNumber).toHaveBeenCalledWith("22345678901");
  });

  it("mevcut cari bulunursa yenisi açılmaz", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    vi.mocked(parasut.findContactIdByTaxNumber).mockResolvedValueOnce("c-mevcut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);

    expect(parasut.createContact).not.toHaveBeenCalled();
  });

  it("yeni cari il/ilçe bilgisiyle açılır (e-Arşiv bu alanlar boşsa reddediyor)", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);

    expect(parasut.createContact).toHaveBeenCalledWith(
      expect.objectContaining({ city: expect.any(String), district: expect.any(String) })
    );
  });

  it("KDV oranı 0 iken e-Arşiv'e muafiyet kodu gönderilir", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    // PARASUT_KDV_ORANI env'de tanımsız → parasutKdvOrani() 0 döner.
    delete process.env.PARASUT_KDV_ORANI;

    await issueInvoiceForBooking(bookingId);

    expect(parasut.createEArchive).toHaveBeenCalledWith(
      "inv-1",
      expect.objectContaining({
        vatExemptionReasonCode: expect.any(String),
        vatExemptionReason: expect.any(String),
      })
    );
  });

  it("KDV oranı 0 iken PARASUT_KDV_MUAFIYET_KODU tanımlı değilse anlamlı hata verir, e-Arşiv hiç denenmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    // Üst beforeEach bu testler için "350" atıyor; burada kasıtlı olarak
    // siliniyor — gerçek bir ortamda hiç tanımlanmamış senaryo.
    delete process.env.PARASUT_KDV_MUAFIYET_KODU;

    const res = await issueInvoiceForBooking(bookingId);

    expect(res.ok).toBe(false);
    // Fatura zaten kesildi (sales_invoice adımı e-Arşiv'den ÖNCE başarıyla
    // bitti) — bu yüzden durum BASARISIZ'a DÜŞÜRÜLMEZ, KESILDI'de kalır
    // (bkz. issueInvoiceForBooking catch bloğu yorumu).
    expect(res.status).toBe("KESILDI");
    expect(res.error).toMatch(/PARASUT_KDV_MUAFIYET_KODU/);
    expect(parasut.createEArchive).not.toHaveBeenCalled();

    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("KESILDI");
    expect(inv?.eArchiveId).toBeNull();
    expect(inv?.errorMessage).toMatch(/PARASUT_KDV_MUAFIYET_KODU/);
  });

  it("KDV oranı 0'dan farklıyken e-Arşiv'e muafiyet kodu gönderilmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const onceki = process.env.PARASUT_KDV_ORANI;
    process.env.PARASUT_KDV_ORANI = "20";
    try {
      await issueInvoiceForBooking(bookingId);
    } finally {
      if (onceki === undefined) delete process.env.PARASUT_KDV_ORANI;
      else process.env.PARASUT_KDV_ORANI = onceki;
    }

    expect(parasut.createEArchive).toHaveBeenCalledWith("inv-1", undefined);
  });

  it("boru hattı ürünü bir kez arayıp faturaya bağlar", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);

    expect(parasut.findProductIdByName).toHaveBeenCalledTimes(1);
    expect(parasut.findProductIdByName).toHaveBeenCalledWith("Tur Hizmeti");
    expect(parasut.createProduct).toHaveBeenCalledTimes(1);
    expect(parasut.createSalesInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "p-1" })
    );
  });

  it("mevcut ürün bulunduğunda yenisini açmaz", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    vi.mocked(parasut.findProductIdByName).mockResolvedValueOnce("p-mevcut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);

    expect(parasut.createProduct).not.toHaveBeenCalled();
    expect(parasut.createSalesInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "p-mevcut" })
    );
  });

  it("fatura kalemini (quantity/unitPrice) Paraşüt'e doğru bağlar", async () => {
    const prisma = await getTestPrisma();
    // 2000 TL / 2 yolcu = tam bölünüyor → 2 kalem × 1000 TL.
    // Alanlar yer değişirse (quantity=1000, unitPrice=2) veya quantity yerine
    // başka bir alan geçerse bu test düşer. "Fatura toplamı = tahsil edilen
    // tutar" kısıtının boru hattı seviyesindeki tek garantisi budur.
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      totalAmount: 2000,
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    await issueInvoiceForBooking(bookingId);

    expect(parasut.createSalesInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 2, unitPrice: 1000 })
    );
  });

  it("mail hatasında invoiceId korunur, durum KESILDI kalır, ikinci denemede fatura kesilmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    // SMTP'yi yapılandır ve gönderimi düşür: fatura kesilir, mail gitmez.
    const SMTP = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const;
    const kayitli: Record<string, string | undefined> = {};
    for (const k of SMTP) kayitli[k] = process.env[k];
    process.env.SMTP_HOST = "smtp.test.local";
    process.env.SMTP_USER = "test@example.com";
    process.env.SMTP_PASS = "sifre";
    sendMailMock.mockRejectedValueOnce(new Error("smtp kapalı"));

    let res: Awaited<ReturnType<typeof issueInvoiceForBooking>>;
    try {
      res = await issueInvoiceForBooking(bookingId);
    } finally {
      for (const k of SMTP) {
        if (kayitli[k] === undefined) delete process.env[k];
        else process.env[k] = kayitli[k];
      }
      sendMailMock.mockClear();
    }

    // "Belge var, mail gitmedi" — "para alındı, belge yok" DEĞİL.
    expect(res.ok).toBe(false);
    expect(res.status).toBe("KESILDI");
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("KESILDI");
    expect(inv?.invoiceId).toBe("inv-1");
    expect(inv?.eArchiveId).toBe("ea-1");
    expect(inv?.attempts).toBe(1);
    expect(inv?.errorMessage).toMatch(/e-posta/i);

    // İkinci deneme: fatura ve e-Arşiv adımları ATLANIR, yalnız mail atılır.
    vi.clearAllMocks();
    const res2 = await issueInvoiceForBooking(bookingId);

    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
    expect(parasut.createEArchive).not.toHaveBeenCalled();
    expect(res2.status).toBe("GONDERILDI");
  });

  it("Paraşüt yapılandırılmamışsa hiç DB yazısı yapılmaz", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    vi.mocked(parasut.isParasutConfigured).mockReturnValueOnce(false);
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(res.status).toBe("BEKLIYOR");
    // Kayıt açılmamalı: yapılandırma gelince boru hattı sıfırdan başlamalı,
    // panelde "fatura kaydı var ama hiç denenmemiş" hayaleti olmamalı.
    expect(await prisma.invoice.findUnique({ where: { bookingId } })).toBeNull();
  });

  it("ISLENIYOR durumundaki kayda hiçbir Paraşüt çağrısı yapılmaz", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    // Başka bir çalışmanın satırı sahiplendiği durumu kur.
    await prisma.invoice.create({ data: { bookingId, status: "ISLENIYOR" } });
    const parasut = await import("@/lib/parasut");
    const { issueInvoiceForBooking } = await import("@/lib/parasut-invoice");

    const res = await issueInvoiceForBooking(bookingId);

    expect(res.ok).toBe(false);
    expect(res.status).toBe("ISLENIYOR");
    expect(parasut.findContactIdByTaxNumber).not.toHaveBeenCalled();
    expect(parasut.createContact).not.toHaveBeenCalled();
    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
    expect(parasut.createEArchive).not.toHaveBeenCalled();
    expect(parasut.fetchEArchivePdf).not.toHaveBeenCalled();
  });
});

describe("runPendingInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ürün önbelleği süreç belleğinde tutuluyor; testler arası sızmasın.
    __resetParasutProductCacheForTest();
  });

  it("kalkışı geçmiş ödenmiş rezervasyonu faturalar", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("GONDERILDI");
  });

  it("kalkışı gelmemiş rezervasyonu seçmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() + 7 * 86400000),
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    expect(await prisma.invoice.findUnique({ where: { bookingId } })).toBeNull();
  });

  it("elden satışı seçmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
      paymentMethod: "NAKIT",
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    expect(await prisma.invoice.findUnique({ where: { bookingId } })).toBeNull();
  });

  it("elden satışı seçmez (HAVALE)", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
      paymentMethod: "HAVALE",
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    expect(await prisma.invoice.findUnique({ where: { bookingId } })).toBeNull();
  });

  it("ödenmemiş rezervasyonu seçmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    expect(await prisma.invoice.findUnique({ where: { bookingId } })).toBeNull();
  });

  it("deneme sınırına ulaşmış kaydı yeniden denemez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    await prisma.invoice.create({
      data: { bookingId, status: "BASARISIZ", attempts: 5 },
    });
    const parasut = await import("@/lib/parasut");
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    expect(parasut.createSalesInvoice).not.toHaveBeenCalled();
  });

  it("Paraşüt yapılandırılmamışsa hiçbir şey yapmaz", async () => {
    const prisma = await getTestPrisma();
    await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const parasut = await import("@/lib/parasut");
    vi.mocked(parasut.isParasutConfigured).mockReturnValueOnce(false);
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    const res = await runPendingInvoices();

    expect(res.islenen).toBe(0);
  });

  it("KESILDI kaydı yeniden işlenir (e-Arşiv/mail adımı tamamlanır)", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    await prisma.invoice.create({
      data: { bookingId, contactId: "c-1", invoiceId: "inv-1", status: "KESILDI" },
    });
    const parasut = await import("@/lib/parasut");
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    // Zaten kesilmiş fatura ikinci kez kesilmemeli (invoiceId değişmemeli),
    // ama kalan adımlar (e-Arşiv, mail) sürmeli.
    // Not: Bu dosyadaki testler aynı test DB'sini paylaşır ve önceki testlerin
    // bıraktığı başka adaylar da bu runPendingInvoices çağrısında işlenebilir
    // — bu yüzden createSalesInvoice'un "hiç çağrılmadığı" gibi genel bir
    // iddia yerine, BU rezervasyonun invoiceId'sinin sabit kaldığı kontrol
    // edilir.
    expect(parasut.createEArchive).toHaveBeenCalledWith(
      "inv-1",
      expect.objectContaining({ vatExemptionReasonCode: expect.any(String) })
    );
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.invoiceId).toBe("inv-1");
    expect(inv?.status).toBe("GONDERILDI");
  });

  it("ISLENIYOR kaydı atlanır, durumu değişmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    await prisma.invoice.create({ data: { bookingId, status: "ISLENIYOR" } });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    // ISLENIYOR, hem tekrarlar hem de yeni-aday sorgusunun dışında kalır
    // (bkz. runPendingInvoices yorumu); bu yüzden hiçbir çalışma bu kaydı
    // sahiplenip durumunu değiştiremez.
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("ISLENIYOR");
  });

  it("ELLE kaydı asla yeniden denenmez", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      currency: "EUR",
      departureDate: new Date(Date.now() - 86400000),
    });
    await prisma.invoice.create({
      data: { bookingId, status: "ELLE", errorMessage: "Döviz turu — elle kesilmeli." },
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    // ELLE de her iki sorgunun dışında kalır (tekrarlar yalnız
    // BASARISIZ/KESILDI alır, adaylar yalnız invoice:null alır).
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("ELLE");
  });

  it("50'den fazla yeni aday varken bile BASARISIZ kaydı işlenir (yeniden deneme kotası)", async () => {
    const prisma = await getTestPrisma();

    // Yeniden denenecek kayıt: önceden hata almış.
    const { bookingId: retryBookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    await prisma.invoice.create({
      data: { bookingId: retryBookingId, status: "BASARISIZ", attempts: 1 },
    });

    // Yeni adaylar: BATCH'i (50) aşacak kadar — eski kodda bunlar retry
    // kaydını tamamen aç bırakırdı.
    for (let i = 0; i < 55; i++) {
      await createTestBooking(prisma, {
        idNumbers: ["12345678901", "22345678901"],
        departureDate: new Date(Date.now() - 86400000),
      });
    }

    const parasut = await import("@/lib/parasut");
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    const inv = await prisma.invoice.findUnique({ where: { bookingId: retryBookingId } });
    expect(inv?.status).toBe("GONDERILDI");
    expect(parasut.createSalesInvoice).toHaveBeenCalled();
  });

  it("BEKLIYOR kaydı cron tarafından alınır (yörüngesiz kalmaz)", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    // Kayıt VAR ama hiç işlenmemiş. Bu satır gerçekte oluşuyor: panelden
    // "yeniden dene" durumu BEKLIYOR'a çekiyor, boru hattı claim'den önce
    // dönebiliyor. Yeni-aday sorgusu `invoice: null` aradığı için bu satırı
    // görmez; tekrar sorgusu almazsa kayıt sonsuza kadar bekler.
    await prisma.invoice.create({ data: { bookingId, status: "BEKLIYOR" } });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    await runPendingInvoices();

    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("GONDERILDI");
  });

  it("bayat ISLENIYOR kaydı devralınır (sorgu seçer, claim kabul eder)", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    const { runPendingInvoices, STALE_ISLENIYOR_MS } = await import(
      "@/lib/parasut-invoice"
    );
    // Çökmüş bir çalışmanın kalıntısı: eşiğin çok ötesinde güncellenmiş.
    await prisma.invoice.create({
      data: {
        bookingId,
        status: "ISLENIYOR",
        updatedAt: new Date(Date.now() - 2 * STALE_ISLENIYOR_MS),
      },
    });

    const res = await runPendingInvoices();

    // Hem tarayıcı hem atomik claim bu kaydı kabul etmeli; biri reddederse
    // kayıt kalıcı olarak takılı kalır.
    const inv = await prisma.invoice.findUnique({ where: { bookingId } });
    expect(inv?.status).toBe("GONDERILDI");
    expect(res.takili).toBeGreaterThanOrEqual(1);
  });

  it("taze ISLENIYOR kaydına dokunulmaz (claim de reddeder)", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      departureDate: new Date(Date.now() - 86400000),
    });
    await prisma.invoice.create({ data: { bookingId, status: "ISLENIYOR" } });
    const { runPendingInvoices, issueInvoiceForBooking } = await import(
      "@/lib/parasut-invoice"
    );

    await runPendingInvoices();
    expect((await prisma.invoice.findUnique({ where: { bookingId } }))?.status).toBe(
      "ISLENIYOR"
    );

    // Doğrudan çağrı (panel yolu) da claim'i alamamalı: aktif bir çalışmanın
    // sahipliği ezilirse GİB'e iki e-Arşiv gider.
    const res = await issueInvoiceForBooking(bookingId);
    expect(res.ok).toBe(false);
    expect(res.status).toBe("ISLENIYOR");
  });

  it("ELLE işaretlenen kayıt `elle` sayacına yazılır, `hatali`ya değil", async () => {
    const prisma = await getTestPrisma();
    const { bookingId } = await createTestBooking(prisma, {
      idNumbers: ["12345678901", "22345678901"],
      currency: "EUR",
      departureDate: new Date(Date.now() - 86400000),
    });
    const { runPendingInvoices } = await import("@/lib/parasut-invoice");

    const res = await runPendingInvoices();

    expect((await prisma.invoice.findUnique({ where: { bookingId } }))?.status).toBe(
      "ELLE"
    );
    expect(res.elle).toBeGreaterThanOrEqual(1);
  });
});

describe("fatura alıcısı kaydı", () => {
  it("geçerli sıra numarası kaydedilir", async () => {
    const prisma = await getTestPrisma();
    const { createPendingBooking } = await import("@/lib/booking");
    // createTestBooking KOLTUK tipli tur üretir ve 1A/1B'yi doldurur;
    // 2A/2B/3A/3B boş kalır.
    const { tourId } = await createTestBooking(prisma);

    const res = await createPendingBooking({
      tourId,
      contactName: "Test Müşteri",
      contactPhone: "5551112233",
      contactEmail: "t@example.com",
      seatCodes: ["2A", "2B"],
      invoicePassengerIndex: 1,
      passengers: [
        { firstName: "A", lastName: "B", idNumber: "12345678950", gender: "E", nationality: "TC", seatCode: "2A" },
        { firstName: "C", lastName: "D", idNumber: "22345678928", gender: "E", nationality: "TC", seatCode: "2B" },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const b = await prisma.booking.findUnique({ where: { id: res.bookingId } });
    expect(b?.invoicePassengerIndex).toBe(1);
  });

  it("aralık dışı sıra numarası null yazılır", async () => {
    const prisma = await getTestPrisma();
    const { createPendingBooking } = await import("@/lib/booking");
    const { tourId } = await createTestBooking(prisma);

    const res = await createPendingBooking({
      tourId,
      contactName: "Test Müşteri",
      contactPhone: "5551112233",
      contactEmail: "t2@example.com",
      seatCodes: ["3A"],
      invoicePassengerIndex: 7, // yolcu sayısının dışında
      passengers: [
        { firstName: "A", lastName: "B", idNumber: "12345678950", gender: "E", nationality: "TC", seatCode: "3A" },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const b = await prisma.booking.findUnique({ where: { id: res.bookingId } });
    expect(b?.invoicePassengerIndex).toBeNull();
  });

  // Geçersiz değerlerin hepsi null olmalı — uydurma bir indeks yasal belgenin
  // alıcısını belirleyemez.
  //
  // Ondalık ayrıca önemli: aralık kontrolü tek başına 0.5'i geçiriyordu ve
  // SQLite değeri sessizce 0'a kırpıyor. Proje canlıda PostgreSQL'e geçecek;
  // orada ondalığın Int sütununa yazılması rezervasyon oluşturmayı çökertebilir.
  const gecersizIndeksler: Array<[string, number]> = [
    ["ondalık (0.5)", 0.5],
    ["ondalık (1.9)", 1.9],
    ["negatif", -1],
    ["NaN", NaN],
    ["aralığın çok üstünde", 999],
  ];

  for (const [ad, deger] of gecersizIndeksler) {
    it(`geçersiz sıra numarası null yazılır: ${ad}`, async () => {
      const prisma = await getTestPrisma();
      const { createPendingBooking } = await import("@/lib/booking");
      const { tourId } = await createTestBooking(prisma);

      const res = await createPendingBooking({
        tourId,
        contactName: "Test Müşteri",
        contactPhone: "5551112233",
        contactEmail: `gecersiz-${Date.now()}-${Math.random()}@example.com`,
        seatCodes: ["2A", "2B"],
        invoicePassengerIndex: deger,
        passengers: [
          { firstName: "A", lastName: "B", idNumber: "12345678950", gender: "E", nationality: "TC", seatCode: "2A" },
          { firstName: "C", lastName: "D", idNumber: "22345678928", gender: "E", nationality: "TC", seatCode: "2B" },
        ],
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const b = await prisma.booking.findUnique({ where: { id: res.bookingId } });
      expect(b?.invoicePassengerIndex).toBeNull();
    });
  }
});
