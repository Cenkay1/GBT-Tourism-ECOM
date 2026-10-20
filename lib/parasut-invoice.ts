// Fatura iş mantığı — rezervasyonu Paraşüt faturasına çevirir.
//
// Saf HTTP katmanı lib/parasut.ts içinde; burada rezervasyon kavramı,
// idempotency ve boru hattı durumu yönetiliyor.

import { prisma } from "@/lib/db";
import {
  parasutKdvOrani,
  parasutKdvMuafiyetKodu,
  parasutKdvMuafiyetNedeni,
  isParasutConfigured,
  findContactIdByTaxNumber,
  createContact,
  findProductIdByName,
  createProduct,
  createSalesInvoice,
  createEArchive,
  fetchEArchivePdf,
} from "@/lib/parasut";

// Rezervasyon formu müşteri il/ilçe bilgisi TOPLAMIYOR; Paraşüt e-Arşiv'i
// cari'de bu alanlar boşsa reddediyor (staging'de doğrulandı: "Alıcı
// il/ilçe adresi doldurulmalı"). lib/payment.ts'teki iyzico adres
// kullanımıyla AYNI desen: gerçek müşteri adresi yoksa acentenin kendi
// il/ilçesi (bkz. COMPANY.address — Zonguldak/Ereğli) yer tutucu olarak
// gönderilir.
const PARASUT_CONTACT_CITY = "Zonguldak";
const PARASUT_CONTACT_DISTRICT = "Ereğli";

// Paraşüt KDV oranı 0 (muaf) olan bir satır için KDV muafiyet kodu istiyor;
// boş bırakılırsa ya da staging'de denendiği gibi geçersiz bir kod
// gönderilirse e-Arşiv reddediliyor (staging'de doğrulandı: "Vat exemption
// reason code KDV muafiyet kodu kabul edilen bir kelime değil" — hata
// mesajı KABUL EDİLEN KODLARIN LİSTESİNİ vermiyor, bu yüzden hangi kodun
// geçerli olduğu burada UYDURULMADI). Geçerli kod GİB/Paraşüt tarafından
// belirlenen bir İŞ KARARI — mali müşavirden alınıp PARASUT_KDV_MUAFIYET_KODU
// ortam değişkenine yazılmalı (bkz. lib/parasut.ts parasutKdvMuafiyetKodu).
// Tanımlı değilse ve oran 0 ise aşağıda (bkz. eArchiveId bloğu) anlamlı bir
// hata fırlatılır — sessizce geçersiz/uydurma bir kod gönderilmez.

// Paraşüt para birimi kodları ISO'dan ayrışıyor: Türk Lirası "TRY" değil "TRL".
export const PARASUT_CURRENCY: Record<string, string> = { TRY: "TRL" };

// ── Ürün (product) ───────────────────────────────────────────────────────
//
// Staging'e karşı denendi: sales_invoice_details ürün ilişkisi OLMADAN
// HTTP 422 "Ürün/hizmet doldurulmalı" ile reddediliyor. Her rezervasyon için
// yeni ürün açmak yerine, cari yönetimiyle aynı mantıkla sabit adlı TEK bir
// ürün kullanılır: önce ada göre aranır, yoksa oluşturulur.
export const PARASUT_URUN_ADI = "Tur Hizmeti";

// Süreç belleğinde tutulan basit önbellek — aynı çalışma içinde (ör.
// runPendingInvoices'ın işlediği 50 kayıt) ürün tekrar tekrar aranıp
// oluşturulmaya çalışılmasın. Invoice kaydına YAZILMAZ (şemaya dokunulmadı);
// her süreç başlangıcında (deploy/restart) yeniden aranır.
let cachedProductId: string | null = null;

// Yalnız test için — modül içi ürün önbelleğini sıfırlar.
export function __resetParasutProductCacheForTest(): void {
  cachedProductId = null;
}

async function urunIdGetir(): Promise<string> {
  if (cachedProductId) return cachedProductId;
  const id =
    (await findProductIdByName(PARASUT_URUN_ADI)) ??
    (await createProduct({ name: PARASUT_URUN_ADI, vatRate: parasutKdvOrani() }));
  cachedProductId = id;
  return id;
}

// v1 kapsamı dışında kalan ve ELLE işaretlenecek durumlar.
export type InvoiceBlocker = "DOVIZ" | "YABANCI" | null;

export function invoiceBlocker(input: {
  currency: string;
  nationality: string | null;
}): InvoiceBlocker {
  // Döviz faturası e-Arşiv'de TL karşılığı ve kur tarihi istiyor — ayrı iş.
  if (input.currency !== "TRY") return "DOVIZ";
  // e-Arşiv yabancı alıcıda pasaport numarasını farklı alanda bekliyor.
  if (input.nationality === "FOREIGN") return "YABANCI";
  return null;
}

export function blockerMessage(blocker: Exclude<InvoiceBlocker, null>): string {
  if (blocker === "DOVIZ") {
    return "Döviz cinsi tur — fatura Paraşüt panelinden elle kesilmeli.";
  }
  return "Fatura alıcısı yabancı uyruklu — fatura Paraşüt panelinden elle kesilmeli.";
}

// Sunucu UTC'de çalışıyor (TZ ortam değişkeni yok); fatura tarihi yasal bir
// alan olduğu için her yerde açıkça Türkiye saat dilimine göre hesaplanmalı.
const TZ = "Europe/Istanbul";

// Paraşüt tarihleri yyyy-mm-dd bekliyor.
// d.toISOString() UTC'ye göre kırpar: TRT 00:00-03:00 arası UTC'de hâlâ önceki
// gündür, bu da fatura tarihini bir gün geriye kaydırır. Bunun yerine tarihi
// açıkça Europe/Istanbul saat dilimine göre biçimlendiriyoruz. "en-CA" locale
// yyyy-mm-dd sırasını üretir (testle doğrulanıyor).
export function isoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function invoiceDescription(tourTitle: string, departureDate: Date): string {
  const tarih = departureDate.toLocaleDateString("tr-TR", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${tourTitle} (${tarih} kalkışlı)`;
}

export interface InvoiceLine {
  quantity: number;
  unitPrice: number;
}

// Fatura kalemi: Paraşüt toplamı unit_price × quantity olarak kendisi
// hesaplıyor, ayrı bir toplam alanı yok. Bölüm tam değilse (örn. çocuk/bebek
// indirimli rezervasyonlarda sık görülür) kişi sayısı kadar kalem × kuruşa
// yuvarlanmış birim fiyat, tahsil edilenden kuruş farkıyla sapabilir. Bu yüzden
// önce geri çarpımla kontrol ediyoruz: birim fiyat × kişi sayısı tam olarak
// totalAmount'a eşitse kişi sayısı kalem olarak kullanılır; eşit değilse
// -mali hata riskini önlemek için- tek kaleme düşülür ve tüm tutar o kalemde
// yazılır. Karşılaştırma kuruş tamsayısı üzerinden yapılır (kayan nokta
// eşitliği güvenilir değildir).
export function invoiceLine(totalAmount: number, passengerCount: number): InvoiceLine {
  if (passengerCount <= 0) {
    return { quantity: 1, unitPrice: totalAmount };
  }

  const birim = Math.round((totalAmount / passengerCount) * 100) / 100;

  const toplamKurus = Math.round(totalAmount * 100);
  const geriCarpimKurus = Math.round(birim * 100) * passengerCount;

  if (geriCarpimKurus === toplamKurus) {
    return { quantity: passengerCount, unitPrice: birim };
  }

  // Bölüm tam değil: kişi sayısı kadar kaleme bölersek toplam, tahsil
  // edilenden kuruş farkıyla sapar. Fatura yasal belge olduğundan tutar
  // doğruluğu kalem sayısından önceliklidir — tek kaleme düşüp tüm tutarı
  // yazıyoruz.
  return { quantity: 1, unitPrice: totalAmount };
}

// ── Boru hattı ──────────────────────────────────────────────────────────────
//
// Altı adım, her birinin sonucu kalıcı yazılır:
//   1. engel kontrolü → ELLE
//   2. cari bul/oluştur → contactId
//   3. sales_invoice   → invoiceId, status=KESILDI
//   4. e_archive       → eArchiveId
//   5. PDF
//   6. mail            → emailSentAt, status=GONDERILDI
//
// Yeniden denemede dolu olan alanların adımı ATLANIR. Bu şart: fatura oluşup
// mail atılırken süreç çökerse sonraki çalışma ikinci bir fatura kesmemeli.
//
// Invoice.status değerleri (SQLite enum tutmadığı için düz metin; şema
// yorumundaki liste bunun kısaltılmışı):
//   BEKLIYOR   — kayıt açıldı, henüz işlenmedi
//   ISLENIYOR  — bir çalışma satırı sahiplendi, boru hattı sürüyor
//   KESILDI    — Paraşüt'te fatura oluştu (invoiceId dolu), mail henüz gitmedi
//   GONDERILDI — e-Arşiv + PDF + mail tamam; nihai başarı durumu
//   BASARISIZ  — fatura OLUŞMADAN hata; yeniden denenebilir
//   ELLE       — v1 kapsamı dışında (döviz/yabancı); otomatik denenmez
//
// ── Mükerrer fatura koruması: neyi KAPSAR, neyi KAPSAMAZ ───────────────────
//
// KAPSAR:
//   • Aynı rezervasyon için ikinci bir Invoice satırı açılmasını
//     (`Invoice.bookingId @unique`) — ama bu YALNIZ satır ilk kez açılırken
//     korur, satır var olduktan sonra hiçbir şey engellemez.
//   • Satır var olduktan sonraki eşzamanlı çalışmaları (cron + panelden
//     "yeniden dene" aynı anda): aşağıdaki atomik `updateMany` talebi
//     (claim) satırı `ISLENIYOR`'a çeker; ikinci çalışma `count === 0`
//     görür ve hiçbir Paraşüt çağrısı yapmadan döner.
//   • Normal (çökmesiz) yeniden denemeleri: dolu alanların adımı atlanır.
//
// KAPSAMAZ — iki çökme penceresi kapatılamaz, çünkü Paraşüt çağrısı ile DB
// yazısı tek işlem (transaction) değil ve Paraşüt idempotency anahtarı
// kabul etmiyor:
//
//   Pencere 1 — `createSalesInvoice` Paraşüt'te faturayı YARATTI ama
//   `invoiceId` DB'ye yazılmadan süreç öldü (deploy, OOM, timeout).
//   Sonuç: sonraki çalışma ikinci bir sales_invoice yaratır. e-Arşiv'lenmemiş
//   olduğu için GİB'e GİTMEZ — yasal sonucu yoktur, muhasebe kirliliğidir.
//   Görevli ne yapmalı: Paraşüt panelinde aynı cari + aynı açıklama/tutarla
//   iki taslak fatura varsa e-Arşiv'lenmemiş olanı SİLMELİ.
//
//   Pencere 2 — `createEArchive` BAŞARILI oldu ama `eArchiveId` DB'ye
//   yazılmadan süreç öldü.
//   Sonuç: sonraki çalışma aynı sales_invoice için ikinci kez e-Arşiv dener.
//   Paraşüt reddederse kayıt kalıcı `BASARISIZ` olur (fatura GİB'de duruyor,
//   müşteri maili almamış); KABUL ederse gerçek mükerrer yasal belge doğar.
//   Görevli ne yapmalı: Paraşüt panelinden e-Arşiv durumunu doğrulamalı;
//   belge GİB'e gitmişse faturayı DB'de elle `GONDERILDI`'ye çekip PDF'i
//   müşteriye manuel iletmeli, mükerrer belge varsa iptal/itiraz sürecini
//   Paraşüt üzerinden yürütmelidir.

export const MAX_ATTEMPTS = 5;

// ISLENIYOR durumunun "bayat" (takılı kalmış) sayılacağı eşik.
//
// issueInvoiceForBooking bir kaydı işe başlarken ISLENIYOR'a çeker; süreç
// normal biterse GONDERILDI / KESILDI / BASARISIZ'a döner — yani ISLENIYOR
// normalde kısa ömürlüdür. Süreç tam bu arada ölürse (deploy, OOM, timeout)
// kayıt ISLENIYOR'da takılı kalır. 10 dakika, bir faturanın en kötü senaryoda
// (Paraşüt hız sınırı + cari/fatura/e-Arşiv/PDF/mail adımlarının tamamı +
// 429 yeniden denemeleri) sürebileceği süreden kat kat fazla — bu yüzden
// gerçekten aktif bir çalışmayı "takılı" sanıp claim'ini ezme riski düşük,
// ama çökmüş bir kaydı da sonsuza kadar kilitli bırakmaz.
//
// BURADA TANIMLI, çünkü hem otomatik tarayıcı (runPendingInvoices + claim)
// hem de panelden elle tetikleme (lib/invoice-actions.ts) aynı eşiği
// kullanmalı: iki yerde kopya sabit tutulursa biri değiştiğinde tarayıcı bir
// kaydı bayat sayarken claim onu taze sayar ve kayıt kalıcı olarak takılır.
// İlgili üst sınır: lib/parasut.ts içindeki MAX_RETRY_AFTER_MS — tek bir
// isteğin kaydı kaç dakika sessiz bırakabileceğini o sınırlar.
export const STALE_ISLENIYOR_MS = 10 * 60 * 1000;

// Bu andan daha eski güncellenmiş ISLENIYOR kayıtları bayat sayılır.
function bayatIsleniyorEsigi(): Date {
  return new Date(Date.now() - STALE_ISLENIYOR_MS);
}

function kisalt(mesaj: string): string {
  return mesaj.slice(0, 500);
}

// Prisma unique ihlali (P2002). Eşzamanlı iki çalışma aynı anda Invoice satırı
// açmaya kalkarsa biri bu hatayı alır; hata dışarı fırlarsa çağıran döngü
// (50 kayıtlık cron çalışması) komple iptal olur — bu yüzden yakalanıp
// satır yeniden okunuyor.
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

export async function issueInvoiceForBooking(
  bookingId: string
): Promise<{ ok: boolean; status: string; error?: string }> {
  if (!isParasutConfigured()) {
    return { ok: false, status: "BEKLIYOR", error: "Paraşüt yapılandırılmamış." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tour: true,
      departure: true,
      // SIRA ZORUNLU: `invoicePassengerIndex` bu diziye indeksle eriştiği için
      // sıra değişirse YANLIŞ kişinin TCKN'si yasal belgeye yazılır. İlişkinin
      // dönüş sırası sorgu planına bağlıdır ve hiçbir motorda garanti değildir
      // (canlıda PostgreSQL'e geçilecek; orada sıra hiç garanti edilmez).
      passengers: { orderBy: { id: "asc" } },
      invoice: true,
    },
  });
  if (!booking) return { ok: false, status: "BASARISIZ", error: "Rezervasyon bulunamadı." };

  // Kayıt yoksa aç. @unique YALNIZ bu ilk oluşturmayı korur: eşzamanlı iki
  // çalışma aynı anda satır açmaya kalkarsa biri P2002 alır — yakalanıp satır
  // yeniden okunur ve akışa devam edilir. Satır VAR OLDUKTAN SONRA eşzamanlılığı
  // @unique değil, aşağıdaki atomik talep (claim) engeller.
  let invoice = booking.invoice;
  if (!invoice) {
    try {
      invoice = await prisma.invoice.create({ data: { bookingId, status: "BEKLIYOR" } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const mevcut = await prisma.invoice.findUnique({ where: { bookingId } });
      if (!mevcut) throw e;
      invoice = mevcut;
    }
  }

  if (invoice.status === "GONDERILDI") return { ok: true, status: "GONDERILDI" };
  if (invoice.status === "ELLE") return { ok: false, status: "ELLE", error: invoice.errorMessage ?? undefined };

  // Deneme sınırı — ucuz savunma. Sonraki görevin sorgusu zaten bu sınırı
  // uygular, ama panelden doğrudan çağrı sorguyu baypas eder; sınırsız
  // yeniden deneme Paraşüt'te mükerrer taslak biriktirebilir. Panelden
  // "yeniden dene" sayacı sıfırladığı için elle kurtarma engellenmez.
  if (invoice.attempts >= MAX_ATTEMPTS) {
    const mesaj = `Deneme sınırına ulaşıldı (${invoice.attempts}/${MAX_ATTEMPTS}) — elle müdahale gerekiyor.`;
    return { ok: false, status: invoice.status, error: mesaj };
  }

  // Atomik talep (claim): satırı işe başlamadan ÖNCE sahiplen. Koşullu
  // updateMany tek SQL ifadesinde çalıştığı için iki eşzamanlı çalışmadan
  // yalnız biri count=1 alır; diğeri hiçbir Paraşüt çağrısı yapmadan döner.
  // Bu olmadan cron ile panelden "yeniden dene" aynı anda çalışıp ikisi de
  // `invoiceId`'yi null görür ve GİB'e İKİ e-Arşiv gider.
  //
  // Takılı kalma riski: boru hattı başarıyla biterse `GONDERILDI`, hata olursa
  // `KESILDI`/`BASARISIZ` yazıldığı için durum normalde `ISLENIYOR`'da kalmaz.
  // ANCAK süreç tam bu arada ölürse (deploy, OOM) kayıt `ISLENIYOR`'da takılır.
  // Bu yüzden claim BAYAT `ISLENIYOR`'u da kabul eder: `updatedAt` eşikten
  // (STALE_ISLENIYOR_MS) eskiyse sahiplenen süreç artık yaşamıyor sayılır ve
  // kayıt devralınır. TAZE `ISLENIYOR` ASLA kabul edilmez — mükerrer fatura
  // koruması tam olarak budur.
  //
  // runPendingInvoices'ın tekrar sorgusu da aynı koşulu kullanıyor; ikisi
  // ayrışırsa sorgu kaydı seçer, claim reddeder ve kayıt hiç ilerlemez.
  const claim = await prisma.invoice.updateMany({
    where: {
      id: invoice.id,
      OR: [
        { status: { in: ["BEKLIYOR", "KESILDI", "BASARISIZ"] } },
        { status: "ISLENIYOR", updatedAt: { lt: bayatIsleniyorEsigi() } },
      ],
    },
    data: { status: "ISLENIYOR" },
  });
  if (claim.count !== 1) {
    return {
      ok: false,
      status: "ISLENIYOR",
      error: "Bu fatura başka bir çalışma tarafından işleniyor.",
    };
  }

  // Fatura alıcısı: formda seçilen yolcu, yoksa ilki.
  const idx = booking.invoicePassengerIndex ?? 0;
  const alici = booking.passengers[idx] ?? booking.passengers[0];
  if (!alici) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "BASARISIZ", errorMessage: "Rezervasyonda yolcu yok.", attempts: { increment: 1 } },
    });
    return { ok: false, status: "BASARISIZ", error: "Rezervasyonda yolcu yok." };
  }

  // 1. Kapsam dışı mı? ELLE yazılır, otomatik denenmez.
  const blocker = invoiceBlocker({
    currency: booking.tour.currency,
    nationality: alici.nationality,
  });
  if (blocker) {
    const mesaj = blockerMessage(blocker);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "ELLE", errorMessage: mesaj },
    });
    return { ok: false, status: "ELLE", error: mesaj };
  }

  if (!alici.idNumber) {
    const mesaj = "Fatura alıcısının kimlik numarası yok.";
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "BASARISIZ", errorMessage: mesaj, attempts: { increment: 1 } },
    });
    return { ok: false, status: "BASARISIZ", error: mesaj };
  }

  const kalkis = booking.departure?.departureDate ?? booking.tour.departureDate;

  // Hata yolunda "fatura kesildi mi?" sorusunu yanıtlamak için try dışında
  // tutuluyor: kesilmişse status BASARISIZ'a DÜŞÜRÜLMEMELİ (bkz. catch).
  let salesInvoiceId = invoice.invoiceId;

  try {
    // 2. Cari — her rezervasyona yeni cari açmamak için önce aranır.
    let contactId = invoice.contactId;
    if (!contactId) {
      contactId =
        (await findContactIdByTaxNumber(alici.idNumber)) ??
        (await createContact({
          name: `${alici.firstName} ${alici.lastName}`.trim(),
          taxNumber: alici.idNumber,
          email: booking.contactEmail,
          phone: booking.contactPhone,
          city: PARASUT_CONTACT_CITY,
          district: PARASUT_CONTACT_DISTRICT,
        }));
      await prisma.invoice.update({ where: { id: invoice.id }, data: { contactId } });
    }

    // 3. Satış faturası — id oluşur oluşmaz yazılır. Bu yazı mükerrer riskini
    // DARALTIR ama bitirmez: Paraşüt çağrısı ile DB yazısı arasındaki pencerede
    // süreç ölürse sonraki çalışma ikinci bir fatura yaratır (Pencere 1,
    // dosya başındaki "neyi KAPSAMAZ" bölümü).
    if (!salesInvoiceId) {
      // Fatura kalemi: tam bölünüyorsa kişi sayısı, bölünmüyorsa tek kalem.
      // Paraşüt toplamı birim × miktar olarak hesapladığı için bu şart —
      // aksi halde fatura toplamı tahsil edilenden sapar.
      const satir = invoiceLine(booking.totalAmount, booking.passengers.length);
      // Ürün ilişkisi olmadan Paraşüt satış faturasını reddediyor (bkz. yukarı).
      const productId = await urunIdGetir();
      const yeniId = await createSalesInvoice({
        contactId,
        productId,
        description: invoiceDescription(booking.tour.title, kalkis),
        issueDate: isoDate(new Date()),
        currency: PARASUT_CURRENCY[booking.tour.currency] ?? booking.tour.currency,
        quantity: satir.quantity,
        unitPrice: satir.unitPrice,
        vatRate: parasutKdvOrani(),
      });
      // DB yazısı başarısız olursa id yalnız bu logda kalır — Pencere 1'de
      // görevlinin Paraşüt'te hangi taslağı sileceğini bulması için loglanıyor.
      console.log("[fatura] sales_invoice oluştu", { bookingId, salesInvoiceId: yeniId });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { invoiceId: yeniId, status: "KESILDI", errorMessage: null },
      });
      // Yalnız DB'ye yazıldıktan sonra atanır: catch bloğu "fatura kesildi mi?"
      // sorusunu bu değişkenden yanıtlıyor ve DB gerçeğiyle uyuşması gerek.
      salesInvoiceId = yeniId;
    }

    // 4. e-Arşiv — GİB'e iletir. Buradaki yazı da pencere bırakıyor: çağrı
    // başarılı olup `eArchiveId` yazılmadan süreç ölürse sonraki çalışma aynı
    // fatura için ikinci kez e-Arşiv dener (Pencere 2).
    //
    // `eArchiveId` burada GERÇEK e-belge id'sidir (createEArchive bunu
    // dönene kadar dahili olarak iş bitimini bekler) — yeniden denemede bu
    // adımın atlanıp atlanmayacağı kararı bu id'nin varlığına bağlı, o
    // yüzden yanlış (iş) id'si yazılması kurtarmayı bozardı.
    let eArchiveId = invoice.eArchiveId;
    if (!eArchiveId) {
      // KDV oranı 0 (muaf) ise Paraşüt bir muafiyet kodu istiyor (bkz. yukarı
      // yorum). Geçerli kod bilinmediği için burada UYDURULMAZ: env'den
      // okunur, tanımlı değilse işlem burada DURUR — sessizce geçersiz bir
      // kod göndermek yerine görevliye ne yapması gerektiğini söyleyen bir
      // hata fırlatılır (bu hata normal akışta BASARISIZ/KESILDI olarak
      // kaydedilir, bkz. dış catch).
      const kdvOrani = parasutKdvOrani();
      let muafiyet:
        | { vatExemptionReasonCode: string; vatExemptionReason?: string }
        | undefined;
      if (kdvOrani === 0) {
        const kod = parasutKdvMuafiyetKodu();
        if (!kod) {
          throw new Error(
            "KDV oranı 0 (muaf) ayarlanmış ama PARASUT_KDV_MUAFIYET_KODU ortam " +
              "değişkeni tanımlı değil. Mali müşavirden Paraşüt'ün kabul ettiği " +
              "geçerli bir KDV muafiyet kodu alınıp bu ortam değişkenine " +
              "yazılmalı — aksi halde e-Arşiv Paraşüt tarafından reddedilir."
          );
        }
        muafiyet = { vatExemptionReasonCode: kod, vatExemptionReason: parasutKdvMuafiyetNedeni() };
      }
      eArchiveId = await createEArchive(salesInvoiceId, muafiyet);
      await prisma.invoice.update({ where: { id: invoice.id }, data: { eArchiveId } });
    }

    // 5-6. PDF ve mail.
    const pdf = await fetchEArchivePdf(eArchiveId);
    const { sendInvoiceEmail } = await import("@/lib/notifications");
    const gonderildi = await sendInvoiceEmail(bookingId, pdf);
    if (!gonderildi) {
      throw new Error(
        "Fatura kesildi ve e-Arşiv GİB'e iletildi, YALNIZ fatura e-postası gönderilemedi. " +
          "Belge eksikliği yok; PDF müşteriye elle iletilebilir."
      );
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "GONDERILDI", emailSentAt: new Date(), errorMessage: null },
    });
    return { ok: true, status: "GONDERILDI" };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("[fatura hatası]", { bookingId, error: e });

    // Fatura KESİLDİYSE (invoiceId dolu) durum BASARISIZ'a düşürülmez:
    // "para alındı, belge yok" (yasal eksik, acil) ile "belge var, mail
    // gitmedi" (iletişim sorunu) panelde ayırt edilebilmeli. Bu yüzden status
    // KESILDI'de bırakılır; yalnız errorMessage ve attempts güncellenir.
    // (Talep anında durum ISLENIYOR'a çekildiği için KESILDI açıkça yazılır —
    // aksi halde kayıt ISLENIYOR'da takılırdı.)
    const kesildi = Boolean(salesInvoiceId);
    const sonDurum = kesildi ? "KESILDI" : "BASARISIZ";
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: sonDurum,
        errorMessage: kisalt(mesaj),
        attempts: { increment: 1 },
      },
    });
    return { ok: false, status: sonDurum, error: mesaj };
  }
}

// ── Aday tarayıcı ───────────────────────────────────────────────────────────
//
// lib/notifications.ts runDepartureReminders'ın aynası; tek fark karşılaştırma
// yönü: orada kalkış yaklaşıyor (gt), burada kalkış OLDU (lte).
//
// Döviz ve yabancı uyruk burada filtrelenmez — filtrelenirse hiç Invoice kaydı
// oluşmaz ve panelde görünmezler. Boru hattı onları ELLE olarak işaretler.

const BATCH = 50; // Paraşüt hız sınırı ~10 istek/10 sn; bir çalışmanın üst sınırı

// Yeniden denemelere ayrılan ASGARİ kota. Önceden: önce yeni adaylar (take
// BATCH), sonra tekrarlar (take BATCH) çekilip `[...adaylar, ...tekrarlar]`
// sırasıyla birleştirilip BATCH'e kırpılıyordu — yeni adaylar BATCH'i
// doldurduğunda tekrarlar O GÜN HİÇ işlenmezdi (ör. mail hatası almış bir
// müşteri yoğun dönemde günlerce faturasını alamazdı). Şimdi tekrarlar ÖNCE
// ve BATCH'in TAMAMINA kadar çekiliyor (bu asgariyi fiilen güvence altına
// alır, gerekirse daha fazlasını da alabilirler); yeni adaylara kalan
// kapasite ayrılır. Tekrarlar bu kotayı doldurmazsa (ör. sadece 2 kayıt
// varsa) artan kapasitenin tamamı yeni adaylara geçer — bkz. `yeniKota`.
const RETRY_QUOTA = 10;
const NEW_CANDIDATE_QUOTA = BATCH - RETRY_QUOTA; // 40 — yeni adaylara ayrılan temel kota

export interface PendingInvoicesResult {
  islenen: number;
  basarili: number;
  // Yalnız GEÇİCİ/çözülebilir hatalar. ELLE kayıtları buraya SAYILMAZ: biri
  // "tekrar denenince düzelebilir", diğeri "insan müdahalesi olmadan asla
  // düzelmez" demek ve ikisi aynı sayıda toplanırsa elle kesilmesi gereken
  // yasal bir belge haftalarca kimsenin dikkatini çekmeden bekleyebilir.
  hatali: number;
  // Kapsam dışı bırakılıp ELLE işaretlenen kayıt sayısı (döviz/yabancı uyruk).
  // Sessiz atlama değil görünür atlama: bu sayı > 0 ise acenteye özet mail
  // gider ve cron yanıtında da görünür.
  elle: number;
  // Bayat ISLENIYOR'dan kurtarılan (çökmüş bir çalışmadan devralınan) kayıt
  // sayısı. Sürekli sıfırdan büyük olması, çalışmanın düzenli olarak yarıda
  // öldüğünü gösterir — bu yüzden ayrı raporlanıyor.
  takili: number;
}

export async function runPendingInvoices(): Promise<PendingInvoicesResult> {
  if (!isParasutConfigured()) {
    return { islenen: 0, basarili: 0, hatali: 0, elle: 0, takili: 0 };
  }

  const now = new Date();
  const bayatEsik = bayatIsleniyorEsigi();

  // Daha önce denenip başarısız olanlar ya da yarıda kalanlar ÖNCE çekilir —
  // bu sıra, aşağıdaki kota hesaplamasının ve mükerrer koruma yorumunun temeli.
  const tekrarlar = await prisma.booking.findMany({
    where: {
      status: "ODENDI",
      paymentMethod: { in: ["ONLINE", "KREDI_KARTI"] },
      OR: [
        { departure: { departureDate: { lte: now } } },
        { departureId: null, tour: { departureDate: { lte: now } } },
      ],
      invoice: {
        is: {
          attempts: { lt: MAX_ATTEMPTS },
          OR: [
            // BEKLIYOR: kayıt açıldı ama hiç işlenmedi. Yeni-aday sorgusu
            // `invoice: null` aradığı için bu satırı GÖRMEZ; burada da
            // alınmazsa kayıt yörüngesiz kalır ve otomatik çalışma onu BİR
            // DAHA ALMAZ (panel ise "tur başladıktan sonra otomatik kesilir"
            // yazar). Böyle bir satır gerçekten oluşuyor: panelden "yeniden
            // dene" durumu BEKLIYOR'a çekip boru hattını çağırıyor, boru
            // hattı Paraşüt yapılandırılmamışsa claim'den ÖNCE dönüyor.
            // BASARISIZ: hata aldı. KESILDI: fatura kesildi ama boru hattı
            // bitmedi (e-Arşiv ya da mail adımı kaldı).
            { status: { in: ["BEKLIYOR", "BASARISIZ", "KESILDI"] } },
            // Bayat ISLENIYOR: sahiplenen süreç ölmüş (deploy, OOM, timeout).
            // TAZE ISLENIYOR kasten DIŞARIDA — onu başka bir çalışma AKTİF
            // olarak işliyor. Eşik ve koşul, issueInvoiceForBooking'deki
            // atomik claim ile birebir aynı olmalı.
            { status: "ISLENIYOR", updatedAt: { lt: bayatEsik } },
          ],
        },
      },
    },
    select: { id: true, invoice: { select: { status: true } } },
    take: BATCH,
  });

  // Tekrarlar RETRY_QUOTA'yı doldurmadıysa (ör. 3 kayıt varsa) artan kapasite
  // yeni adaylara geçer: 50 - 3 = 47. Tekrarlar kotayı aştıysa (ör. 20 kayıt)
  // yeni adaylara en az NEW_CANDIDATE_QUOTA kadar yer ayrılmaya çalışılır ama
  // aşağıdaki son `.slice(BATCH)` toplamı yine BATCH'e kırpar — tekrarlar
  // önceliklidir.
  const yeniKota = Math.max(BATCH - tekrarlar.length, NEW_CANDIDATE_QUOTA);

  // Prisma'da "ilişki yok VEYA ilişki şu durumda" tek where ile yazılamıyor,
  // bu yüzden yeni adaylar ayrı bir sorguyla çekiliyor.
  const adaylar = await prisma.booking.findMany({
    where: {
      status: "ODENDI",
      paymentMethod: { in: ["ONLINE", "KREDI_KARTI"] },
      OR: [
        { departure: { departureDate: { lte: now } } },
        { departureId: null, tour: { departureDate: { lte: now } } },
      ],
      invoice: {
        is: null,
      },
    },
    // `invoice` burada her zaman null; yalnız iki sorgunun sonucu aynı tipte
    // birleşebilsin diye seçiliyor.
    select: { id: true, invoice: { select: { status: true } } },
    take: yeniKota,
  });

  // Tekrarlar ÖNCE: BATCH'i aşan fazlalık varsa (nadir, bkz. yukarı) kırpılan
  // taraf yeni adaylar olur, tekrarlar değil.
  const hepsi = [...tekrarlar, ...adaylar].slice(0, BATCH);

  let basarili = 0;
  let hatali = 0;
  let elle = 0;
  // Bu çalışmanın devraldığı bayat ISLENIYOR kayıtları. Sorgu bunları yalnız
  // eşiği aşmışlarsa getirdiği için, listedeki her ISLENIYOR satırı takılı
  // kalmış bir kaydın kurtarılmasıdır.
  const takili = hepsi.filter((b) => b.invoice?.status === "ISLENIYOR").length;

  for (const b of hepsi) {
    // Kayıt başına koruma: tek bir rezervasyonun beklenmedik hatası (ör. DB
    // çakışması) 50 kayıtlık partinin tamamını iptal etmemeli.
    //
    // Not: rezervasyonlar arasında artık ayrıca bekleme YOK. Hız sınırı artık
    // lib/parasut.ts seviyesinde, her giden Paraşüt isteği arasında uygulanıyor
    // (bkz. PARASUT_MIN_REQUEST_INTERVAL_MS) — tek bir rezervasyonun 4-5 isteği
    // de dahil TÜM istekler arasında. Burada ayrıca sabit bir bekleme eklemek
    // hem gereksiz hem de toplam çalışma süresini ikiye katlardı.
    let res: { ok: boolean; status?: string };
    try {
      res = await issueInvoiceForBooking(b.id);
    } catch (e) {
      console.error("[fatura: beklenmedik hata]", { bookingId: b.id, error: e });
      res = { ok: false };
    }
    if (res.ok) basarili++;
    else if (res.status === "ELLE") elle++;
    else hatali++;
  }

  const sonuc: PendingInvoicesResult = {
    islenen: hepsi.length,
    basarili,
    hatali,
    elle,
    takili,
  };

  // İnsan müdahalesi gerektiren bir şey varsa acenteye tek bir özet mail.
  // Best-effort: mail gönderilemezse çalışma BAŞARISIZ SAYILMAZ (faturalar
  // zaten kesildi; bildirimin düşmesi yüzünden cron'u patlatmak, bir sonraki
  // çalışmayı da riske atardı).
  if (elle > 0 || hatali > 0) {
    try {
      await sendInvoiceRunSummary(sonuc);
    } catch (e) {
      console.error("[fatura: özet maili gönderilemedi]", e);
    }
  }

  return sonuc;
}

// Çalışma özeti maili — ELLE ve hatalı kayıtlar yalnız tek tek rezervasyon
// detay sayfasında görünüyordu; bu, "görünür atlama" vaadini yerine getirmek
// için acenteye tek bir bildirim atar.
async function sendInvoiceRunSummary(r: PendingInvoicesResult): Promise<void> {
  const { adminNotifyEmail } = await import("@/lib/notifications");
  const { sendEmail } = await import("@/lib/notify");

  const satirlar = [
    `İşlenen kayıt: ${r.islenen}`,
    `Başarılı (fatura gönderildi): ${r.basarili}`,
    `Hatalı (otomatik yeniden denenecek): ${r.hatali}`,
    `Elle faturalanacak (döviz/yabancı uyruk): ${r.elle}`,
    `Takılı kalmış çalışmadan devralınan: ${r.takili}`,
  ];

  const html = `<p style="font-size:14px;color:#475569">
      Günlük fatura çalışması tamamlandı. İnsan müdahalesi gerektiren kayıt var.
    </p>
    <ul style="font-size:13px;color:#475569">${satirlar
      .map((s) => `<li>${s}</li>`)
      .join("")}</ul>
    <p style="font-size:13px;color:#64748b">
      ${r.elle > 0 ? "ELLE işaretli faturalar otomatik olarak ASLA kesilmez — Paraşüt panelinden elle kesilmeli. " : ""}
      İlgili rezervasyonları admin panelindeki rezervasyon detay sayfalarından görebilirsiniz.
    </p>`;

  await sendEmail(adminNotifyEmail(), "Fatura çalışması özeti — müdahale gerekiyor", html);
}
