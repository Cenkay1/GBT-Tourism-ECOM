import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parasutBaseUrl,
  parasutCredentials,
  isParasutConfigured,
  parasutKdvOrani,
  parasutKdvMuafiyetKodu,
  parasutKdvMuafiyetNedeni,
  ParasutError,
  __resetParasutTokenCache,
  __accessTokenForTest,
  __setParasutThrottleMsForTest,
  findContactIdByTaxNumber,
  createContact,
  findProductIdByName,
  createProduct,
  createSalesInvoice,
  fetchSalesInvoiceTotals,
  startEArchiveJob,
  fetchActiveEDocumentId,
  createEArchive,
  fetchEArchivePdf,
  __setEArchivePollIntervalMsForTest,
  MAX_RETRY_AFTER_MS,
} from "@/lib/parasut";

const ENV_KEYS = [
  "PARASUT_BASE_URL",
  "PARASUT_CLIENT_ID",
  "PARASUT_CLIENT_SECRET",
  "PARASUT_USERNAME",
  "PARASUT_PASSWORD",
  "PARASUT_COMPANY_ID",
  "PARASUT_KDV_ORANI",
  "PARASUT_KDV_MUAFIYET_KODU",
  "PARASUT_KDV_MUAFIYET_NEDENI",
] as const;

const saved: Record<string, string | undefined> = {};

function setCreds() {
  process.env.PARASUT_BASE_URL = "https://api.heroku-staging.parasut.com";
  process.env.PARASUT_CLIENT_ID = "cid";
  process.env.PARASUT_CLIENT_SECRET = "csecret";
  process.env.PARASUT_USERNAME = "user@example.com";
  process.env.PARASUT_PASSWORD = "sifre";
  process.env.PARASUT_COMPANY_ID = "12345";
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  __resetParasutTokenCache();
  // Hız sınırlama (throttle) testleri gerçek zaman akıtmadan yazılabilsin diye
  // varsayılan olarak kapalı; ihtiyacı olan testler kendi içinde geri açar.
  __setParasutThrottleMsForTest(0);
  // e-Arşiv poll aralığı da aynı sebeple varsayılan olarak kapalı.
  __setEArchivePollIntervalMsForTest(0);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  // Sahte zamanlayıcı kullanan bir test ortasında patlarsa sahte zaman
  // sonraki testlere sızar ve onları anlaşılmaz biçimde bozar; burada
  // koşulsuz geri alıyoruz.
  vi.useRealTimers();
  __resetParasutTokenCache();
  __setParasutThrottleMsForTest(0);
  __setEArchivePollIntervalMsForTest(0);
});

describe("yapılandırma", () => {
  it("anahtar yoksa yapılandırılmamış sayılır", () => {
    expect(parasutCredentials()).toBeNull();
    expect(isParasutConfigured()).toBe(false);
  });

  it("tüm anahtarlar varsa yapılandırılmış sayılır", () => {
    setCreds();
    expect(isParasutConfigured()).toBe(true);
    expect(parasutCredentials()?.companyId).toBe("12345");
  });

  it("tek bir anahtar eksikse yapılandırılmamış sayılır", () => {
    setCreds();
    delete process.env.PARASUT_COMPANY_ID;
    expect(isParasutConfigured()).toBe(false);
  });

  it("base URL sondaki eğik çizgiyi atar", () => {
    process.env.PARASUT_BASE_URL = "https://api.heroku-staging.parasut.com/";
    expect(parasutBaseUrl()).toBe("https://api.heroku-staging.parasut.com");
  });

  it("base URL yoksa üretim adresine düşer", () => {
    expect(parasutBaseUrl()).toBe("https://api.parasut.com");
  });

  it("KDV oranı tanımsızsa 0 döner", () => {
    expect(parasutKdvOrani()).toBe(0);
  });

  it("KDV oranı env'den okunur", () => {
    process.env.PARASUT_KDV_ORANI = "20";
    expect(parasutKdvOrani()).toBe(20);
  });

  it("geçersiz KDV oranı 0 sayılır", () => {
    process.env.PARASUT_KDV_ORANI = "abc";
    expect(parasutKdvOrani()).toBe(0);
  });

  it("KDV muafiyet kodu tanımsızsa null döner", () => {
    expect(parasutKdvMuafiyetKodu()).toBeNull();
  });

  it("KDV muafiyet kodu env'den okunur", () => {
    process.env.PARASUT_KDV_MUAFIYET_KODU = "350";
    expect(parasutKdvMuafiyetKodu()).toBe("350");
  });

  it("boş KDV muafiyet kodu null sayılır", () => {
    process.env.PARASUT_KDV_MUAFIYET_KODU = "   ";
    expect(parasutKdvMuafiyetKodu()).toBeNull();
  });

  it("KDV muafiyet nedeni tanımsızsa undefined döner", () => {
    expect(parasutKdvMuafiyetNedeni()).toBeUndefined();
  });

  it("KDV muafiyet nedeni env'den okunur", () => {
    process.env.PARASUT_KDV_MUAFIYET_NEDENI = "Diğer";
    expect(parasutKdvMuafiyetNedeni()).toBe("Diğer");
  });
});

describe("accessToken", () => {
  it("password grant ile token alır", async () => {
    setCreds();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "tok-1", expires_in: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await __accessTokenForTest();

    expect(token).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.heroku-staging.parasut.com/oauth/token");
    const body = JSON.parse(init.body as string);
    expect(body.grant_type).toBe("password");
    expect(body.redirect_uri).toBe("urn:ietf:wg:oauth:2.0:oob");
    expect(body.username).toBe("user@example.com");
  });

  it("geçerli token'ı önbellekten verir, ikinci kez istek atmaz", async () => {
    setCreds();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "tok-1", expires_in: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await __accessTokenForTest();
    await __accessTokenForTest();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("token alınamazsa ParasutError fırlatır", async () => {
    setCreds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 })
      )
    );

    await expect(__accessTokenForTest()).rejects.toBeInstanceOf(ParasutError);
  });

  it("anahtar yoksa ParasutError fırlatır", async () => {
    await expect(__accessTokenForTest()).rejects.toBeInstanceOf(ParasutError);
  });

  it("süresi dolan token yeniden alınır", async () => {
    setCreds();
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "tok-1", expires_in: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await __accessTokenForTest();
    // TTL = expires_in * 900 ms. Süresi dolmuş token'ı tetiklemek için TTL'yi aş.
    vi.advanceTimersByTime(7200 * 900 + 1);
    await __accessTokenForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

// Önce token, sonra asıl istek — iki aşamalı mock.
function mockFetchSequence(responses: Response[]) {
  const fetchMock = vi.fn();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function tokenResponse() {
  return new Response(
    JSON.stringify({ access_token: "tok-1", expires_in: 7200 }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("kaynak uçları", () => {
  it("cari aramasında TCKN filtresi kullanır ve id döner", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: [{ id: "c-99", type: "contacts" }] }),
    ]);

    const id = await findContactIdByTaxNumber("12345678901");

    expect(id).toBe("c-99");
    const [url] = fetchMock.mock.calls[1] as unknown as [string];
    expect(url).toContain("/v4/12345/contacts");
    expect(url).toContain("filter%5Btax_number%5D=12345678901");
  });

  it("cari bulunamazsa null döner", async () => {
    setCreds();
    mockFetchSequence([tokenResponse(), jsonResponse({ data: [] })]);
    expect(await findContactIdByTaxNumber("12345678901")).toBeNull();
  });

  it("cari oluşturur ve id döner", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "c-1", type: "contacts" } }),
    ]);

    const id = await createContact({
      name: "Ahmet Yılmaz",
      taxNumber: "12345678901",
      email: "a@example.com",
    });

    expect(id).toBe("c-1");
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.type).toBe("contacts");
    expect(body.data.attributes.contact_type).toBe("person");
    expect(body.data.attributes.account_type).toBe("customer");
    expect(body.data.attributes.tax_number).toBe("12345678901");
    // city/district verilmediyse gövdede hiç YER ALMAMALI (staging boş
    // string'i de reddediyor olabilir — alan hiç gönderilmeyince güvenli).
    expect(body.data.attributes.city).toBeUndefined();
    expect(body.data.attributes.district).toBeUndefined();
  });

  it("cari oluştururken il/ilçe verilirse gövdeye eklenir", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "c-2", type: "contacts" } }),
    ]);

    const id = await createContact({
      name: "Ahmet Yılmaz",
      taxNumber: "12345678901",
      email: "a@example.com",
      city: "Zonguldak",
      district: "Ereğli",
    });

    expect(id).toBe("c-2");
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    // Staging'de doğrulandı: il/ilçe boşsa e-Arşiv "Alıcı il/ilçe adresi
    // doldurulmalı" hatasıyla reddediyor — bu alanların gerçekten gövdeye
    // gittiğini doğrulamak kritik.
    expect(body.data.attributes.city).toBe("Zonguldak");
    expect(body.data.attributes.district).toBe("Ereğli");
  });

  it("satış faturası gövdesini doğru kurar", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "inv-1", type: "sales_invoices" } }),
    ]);

    const id = await createSalesInvoice({
      contactId: "c-1",
      productId: "p-1",
      description: "Test Turu (12.08.2026 kalkışlı)",
      issueDate: "2026-08-13",
      currency: "TRL",
      quantity: 3,
      unitPrice: 500,
      vatRate: 0,
    });

    expect(id).toBe("inv-1");
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.attributes.item_type).toBe("invoice");
    expect(body.data.attributes.currency).toBe("TRL");
    expect(body.data.relationships.contact.data.id).toBe("c-1");
    const detail = body.data.relationships.details.data[0];
    expect(detail.type).toBe("sales_invoice_details");
    expect(detail.attributes.quantity).toBe(3);
    expect(detail.attributes.unit_price).toBe(500);
    expect(detail.attributes.vat_rate).toBe(0);
    // Ürün ilişkisi olmadan Paraşüt faturayı reddediyor (bkz. lib/parasut.ts
    // yorumu) — gövdenin gerçekten ürün ilişkisi taşıdığını doğrula.
    expect(detail.relationships.product.data.id).toBe("p-1");
    expect(detail.relationships.product.data.type).toBe("products");
  });

  it("ürün adıyla arar ve id döner", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: [{ id: "p-99", type: "products" }] }),
    ]);

    const id = await findProductIdByName("Tur Hizmeti");

    expect(id).toBe("p-99");
    const [url] = fetchMock.mock.calls[1] as unknown as [string];
    expect(url).toContain("/v4/12345/products");
    expect(url).toContain("filter%5Bname%5D=Tur+Hizmeti");
  });

  it("ürün bulunamazsa null döner", async () => {
    setCreds();
    mockFetchSequence([tokenResponse(), jsonResponse({ data: [] })]);
    expect(await findProductIdByName("Tur Hizmeti")).toBeNull();
  });

  it("ürün oluşturur ve id döner", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "p-1", type: "products" } }),
    ]);

    const id = await createProduct({ name: "Tur Hizmeti", vatRate: 20 });

    expect(id).toBe("p-1");
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.type).toBe("products");
    expect(body.data.attributes.name).toBe("Tur Hizmeti");
    expect(body.data.attributes.vat_rate).toBe(20);
  });

  it("satış faturası toplamlarını okur: alanlar varsa sayıya çevirir", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({
        data: {
          id: "inv-1",
          type: "sales_invoices",
          attributes: { net_total: "100.0", gross_total: "120.0", total_vat: 20 },
        },
      }),
    ]);

    const totals = await fetchSalesInvoiceTotals("inv-1");

    expect(totals).toEqual({ netTotal: 100, grossTotal: 120, totalVat: 20 });
    const [url] = fetchMock.mock.calls[1] as unknown as [string];
    expect(url).toContain("/v4/12345/sales_invoices/inv-1");
  });

  it("satış faturası toplamlarını okur: alanlar yoksa null döner, patlamaz", async () => {
    setCreds();
    mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "inv-1", type: "sales_invoices", attributes: {} } }),
    ]);

    const totals = await fetchSalesInvoiceTotals("inv-1");

    expect(totals).toEqual({ netTotal: null, grossTotal: null, totalVat: null });
  });

  it("startEArchiveJob: POST /e_archives'e bağ verir ve İŞ id'si döner", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "job-1", type: "trackable_jobs" } }),
    ]);

    const jobId = await startEArchiveJob({ salesInvoiceId: "inv-1" });

    expect(jobId).toBe("job-1");
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.type).toBe("e_archives");
    expect(body.data.relationships.sales_invoice.data.id).toBe("inv-1");
    expect(body.data.relationships.sales_invoice.data.type).toBe("sales_invoices");
  });

  it("startEArchiveJob: KDV muafiyet alanları verilince gövdeye eklenir", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "job-1", type: "trackable_jobs" } }),
    ]);

    await startEArchiveJob({
      salesInvoiceId: "inv-1",
      vatExemptionReasonCode: "350",
      vatExemptionReason: "Diğer",
    });

    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    // Staging'de doğrulandı: bu alanlar sales_invoice_details'te DEĞİL,
    // doğrudan e_archives isteğinin gövdesinde olmalı.
    expect(body.data.attributes.vat_exemption_reason_code).toBe("350");
    expect(body.data.attributes.vat_exemption_reason).toBe("Diğer");
  });

  it("startEArchiveJob: API hatasında ParasutError fırlatır ve mesajı taşır", async () => {
    setCreds();
    mockFetchSequence([
      tokenResponse(),
      jsonResponse(
        { errors: [{ title: "Geçersiz vergi numarası" }] },
        422
      ),
    ]);

    await expect(startEArchiveJob({ salesInvoiceId: "inv-1" })).rejects.toThrow(
      /Geçersiz vergi numarası/
    );
  });

  it("fetchActiveEDocumentId: ilişki doluysa gerçek e-belge id'sini döner", async () => {
    setCreds();
    mockFetchSequence([
      tokenResponse(),
      jsonResponse({
        data: {
          id: "inv-1",
          type: "sales_invoices",
          relationships: { active_e_document: { data: { id: "206163", type: "e_archives" } } },
        },
      }),
    ]);

    expect(await fetchActiveEDocumentId("inv-1")).toBe("206163");
  });

  it("fetchActiveEDocumentId: ilişki yoksa/boşsa null döner, patlamaz", async () => {
    setCreds();
    mockFetchSequence([
      tokenResponse(),
      jsonResponse({
        data: { id: "inv-1", type: "sales_invoices", relationships: { active_e_document: { data: null } } },
      }),
    ]);

    expect(await fetchActiveEDocumentId("inv-1")).toBeNull();
  });

  it("createEArchive: iş hemen 'done' olursa gerçek e-belge id'sini döner (job id'si DEĞİL)", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(), // startEArchiveJob
      jsonResponse({ data: { id: "job-1", type: "trackable_jobs" } }),
      jsonResponse({ // fetchTrackableJobStatus
        data: { id: "job-1", type: "trackable_jobs", attributes: { status: "done", errors: null } },
      }),
      jsonResponse({ // fetchActiveEDocumentId
        data: {
          id: "inv-1",
          type: "sales_invoices",
          relationships: { active_e_document: { data: { id: "206163", type: "e_archives" } } },
        },
      }),
    ]);

    const eArchiveId = await createEArchive("inv-1");

    // Kritik regresyon testi: önceki hatalı davranış job id'sini
    // (job-1) döndürüyordu — burada GERÇEK e-belge id'si (206163) dönmeli.
    expect(eArchiveId).toBe("206163");
    expect(eArchiveId).not.toBe("job-1");
    expect(fetchMock).toHaveBeenCalledTimes(4); // token + job start + job poll + sales_invoice
  });

  it("createEArchive: iş 'running' iken bir tur bekler, sonra 'done' olup id'yi döner", async () => {
    setCreds();
    mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "job-1", type: "trackable_jobs" } }), // start
      jsonResponse({ data: { attributes: { status: "running", errors: null } } }), // 1. poll: hâlâ sürüyor
      jsonResponse({ data: { attributes: { status: "done", errors: null } } }), // 2. poll: bitti
      jsonResponse({
        data: { relationships: { active_e_document: { data: { id: "206163" } } } },
      }), // sales_invoice
    ]);

    const eArchiveId = await createEArchive("inv-1");

    expect(eArchiveId).toBe("206163");
  });

  it("createEArchive: iş 'error' durumuna düşerse anlamlı bir ParasutError fırlatır", async () => {
    setCreds();
    mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "job-1", type: "trackable_jobs" } }),
      jsonResponse({
        data: {
          attributes: {
            status: "error",
            errors: [
              "Receiver district Alıcı ilçe adresi doldurulmalı",
              "Receiver city Alıcı il adresi doldurulmalı",
            ],
          },
        },
      }),
    ]);

    await expect(createEArchive("inv-1")).rejects.toThrow(/Alıcı il adresi doldurulmalı/);
  });

  it("createEArchive: üst sınır denemede tamamlanmazsa ParasutError fırlatır (sonsuz döngü yok)", async () => {
    setCreds();
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: "job-1", type: "trackable_jobs" } }));
    // Her poll "running" döner — hiçbir zaman "done"/"error" olmaz.
    for (let i = 0; i < 10; i++) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: { attributes: { status: "running", errors: null } } })
      );
    }
    vi.stubGlobal("fetch", fetchMock);

    await expect(createEArchive("inv-1")).rejects.toBeInstanceOf(ParasutError);
    // token + job start + N poll (üst sınırla kırpılmış, sonsuz değil)
    expect(fetchMock.mock.calls.length).toBeLessThan(10);
  });

  it("createEArchive: KDV muafiyet seçeneklerini startEArchiveJob'a iletir", async () => {
    setCreds();
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "job-1", type: "trackable_jobs" } }),
      jsonResponse({ data: { attributes: { status: "done", errors: null } } }),
      jsonResponse({ data: { relationships: { active_e_document: { data: { id: "206163" } } } } }),
    ]);

    await createEArchive("inv-1", {
      vatExemptionReasonCode: "350",
      vatExemptionReason: "Diğer",
    });

    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.attributes.vat_exemption_reason_code).toBe("350");
    expect(body.data.attributes.vat_exemption_reason).toBe("Diğer");
  });

  it("e-Arşiv PDF'ini iki adımda indirir: önce adres, sonra dosya", async () => {
    setCreds();
    const pdfBody = Buffer.from("%PDF-1.4 test");
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({
        data: {
          id: "ea-1",
          type: "e_archives",
          attributes: { url: "https://cdn.example.com/f.pdf" },
        },
      }),
      new Response(pdfBody, { status: 200 }),
    ]);

    const buffer = await fetchEArchivePdf("ea-1");

    expect(buffer.toString()).toBe("%PDF-1.4 test");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [pdfUrl, pdfInit] = fetchMock.mock.calls[2] as unknown as [
      string,
      RequestInit | undefined,
    ];
    expect(pdfUrl).toBe("https://cdn.example.com/f.pdf");
    // İmzalı/geçici indirme adresi üçüncü taraf host'a gider; Paraşüt
    // token'ı buraya sızmamalı.
    expect(
      (pdfInit?.headers as Record<string, string> | undefined)?.Authorization
    ).toBeUndefined();
  });

  it("PDF adresi yoksa ParasutError fırlatır", async () => {
    setCreds();
    mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: { id: "ea-1", type: "e_archives", attributes: {} } }),
    ]);

    await expect(fetchEArchivePdf("ea-1")).rejects.toBeInstanceOf(ParasutError);
  });

  it("PDF indirme başarısız olursa ParasutError fırlatır", async () => {
    setCreds();
    mockFetchSequence([
      tokenResponse(),
      jsonResponse({
        data: {
          id: "ea-1",
          type: "e_archives",
          attributes: { url: "https://cdn.example.com/f.pdf" },
        },
      }),
      new Response("yasak", { status: 403 }),
    ]);

    await expect(fetchEArchivePdf("ea-1")).rejects.toBeInstanceOf(ParasutError);
  });
});

describe("hız sınırlama (throttle)", () => {
  it("ardışık iki istek arasında en az throttle aralığı kadar beklenir", async () => {
    setCreds();
    vi.useFakeTimers();
    // Bu testte throttle'ı kasıtlı olarak geri açıyoruz — global beforeEach'in
    // sıfırladığı 0 ms burada gerçek bekleme davranışını saklardı.
    __setParasutThrottleMsForTest(1100);
    const fetchMock = mockFetchSequence([
      tokenResponse(),
      jsonResponse({ data: [] }),
      jsonResponse({ data: [] }),
    ]);

    // Isınma: token önceden alınır. Hiç istek atılmamıştı, bu yüzden bekleme
    // olmaz — ama bundan sonraki HER giden istek (token alımı dahil) bu
    // zaman damgasına göre ölçülür.
    const tokenPromise = __accessTokenForTest();
    await vi.advanceTimersByTimeAsync(0);
    await tokenPromise;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Birinci kaynak isteği: token önbellekten geldiği için TEK throttle
    // uygulanır, ama token alımından (son giden istekten) 1100 ms geçmesi
    // gerekir.
    const p1 = findContactIdByTaxNumber("11111111111");
    await vi.advanceTimersByTimeAsync(0); // throttle beklemesine ulaşsın
    expect(fetchMock).toHaveBeenCalledTimes(1); // henüz atılmadı
    await vi.advanceTimersByTimeAsync(1100);
    await p1;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // İkinci istek hemen ardından başlasın: throttle aralığı dolmadan ikinci
    // fetch tetiklenmemeli.
    const p2 = findContactIdByTaxNumber("22222222222");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(2); // henüz beklemede

    await vi.advanceTimersByTimeAsync(700); // toplam 1200 ms > 1100 ms eşiği
    await p2;
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("429 alınca Retry-After'a uyup yeniden dener, sonunda başarılı olur", async () => {
    setCreds();
    vi.useFakeTimers();
    __setParasutThrottleMsForTest(0);
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockResolvedValueOnce(
      new Response("çok hızlı", {
        status: 429,
        headers: { "Retry-After": "3" },
      })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const sonuc = findContactIdByTaxNumber("33333333333");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2); // token + ilk deneme (429)

    await vi.advanceTimersByTimeAsync(3000); // Retry-After: 3 sn
    expect(await sonuc).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3); // yeniden deneme başarılı oldu

    vi.useRealTimers();
  });

  it("art üste 429 alınca en fazla MAX kadar deneyip sonunda ParasutError fırlatır", async () => {
    setCreds();
    vi.useFakeTimers();
    __setParasutThrottleMsForTest(0);
    const tooMany = () =>
      new Response("çok hızlı", { status: 429, headers: { "Retry-After": "2" } });
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockResolvedValueOnce(tooMany());
    fetchMock.mockResolvedValueOnce(tooMany());
    fetchMock.mockResolvedValueOnce(tooMany());
    vi.stubGlobal("fetch", fetchMock);

    const sonuc = findContactIdByTaxNumber("44444444444");
    const beklenti = expect(sonuc).rejects.toBeInstanceOf(ParasutError);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);
    await beklenti;
    // token + 3 deneme (ilk + 2 yeniden deneme) = 4 çağrı
    expect(fetchMock).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it("aşırı büyük Retry-After üst sınırla kırpılır (10 dk beklenmez)", async () => {
    setCreds();
    vi.useFakeTimers();
    __setParasutThrottleMsForTest(0);
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(tokenResponse());
    // Paraşüt 600 saniye (10 dakika) bekleme isterse: bu süre boyunca kayda
    // hiçbir ilerleme yazılmaz ve üst katmanın bayatlık eşiği aşılır — yaşayan
    // bir claim bayat sanılıp iş ikinci kez yapılabilir. Bu yüzden kırpılır.
    fetchMock.mockResolvedValueOnce(
      new Response("çok hızlı", { status: 429, headers: { "Retry-After": "600" } })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const sonuc = findContactIdByTaxNumber("55555555555");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2); // token + ilk deneme (429)

    // Üst sınır kadar ilerletmek yeniden denemeyi tetiklemeye YETER;
    // kırpılmasaydı 600 sn'de hâlâ uyuyor olurdu.
    await vi.advanceTimersByTimeAsync(MAX_RETRY_AFTER_MS);
    expect(await sonuc).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(MAX_RETRY_AFTER_MS).toBeLessThan(600_000);

    vi.useRealTimers();
  });
});
