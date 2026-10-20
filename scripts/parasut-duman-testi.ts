// Paraşüt STAGING entegrasyonunu uçtan uca dener.
//
// Kullanım (proje kökünde, .env.local staging anahtarlarıyla dolu olmalı):
//   npx tsx scripts/parasut-duman-testi.ts
//
// Gerçek bir e-Arşiv kaydı oluşturur — YALNIZ STAGING'de çalıştırın.
// Script, üretim adresine işaret eden bir yapılandırmada durur.
//
// Amaç: entegrasyonun dört doğrulanmamış varsayımını sınamak. Script
// sonunda "DOĞRULAMA SONUÇLARI" başlığı altında bu dört sorunun yanıtını
// tek tek basar; bir adım koşulamadıysa ilgili soru "BİLİNMİYOR" kalır.

// Next.js'in kendi env önceliğini (.env.local, .env'i geçersiz kılar) burada
// elle taklit ediyoruz: bu script Next.js dışında, doğrudan tsx ile çalışıyor,
// o yüzden .env.local kendiliğinden okunmaz.
import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local", override: true });

import {
  parasutBaseUrl,
  isParasutConfigured,
  findContactIdByTaxNumber,
  createContact,
  findProductIdByName,
  createProduct,
  createSalesInvoice,
  fetchSalesInvoiceTotals,
  createEArchive,
  fetchEArchivePdf,
  type SalesInvoiceTotals,
} from "../lib/parasut";

// e-Arşiv için zorunlu: cari'de il/ilçe boşsa iş "Alıcı il/ilçe adresi
// doldurulmalı" hatasıyla reddediliyor (bkz. lib/parasut-invoice.ts
// PARASUT_CONTACT_CITY/DISTRICT yorumu — aynı yer tutucu değerler).
const DUMAN_TESTI_CITY = "Zonguldak";
const DUMAN_TESTI_DISTRICT = "Ereğli";

// KDV oranı 0 (muaf) olan bir satırda e-Arşiv bir muafiyet kodu istiyor ve
// geçerli kodun ne olduğu bilinmiyor (bkz. lib/parasut.ts
// parasutKdvMuafiyetKodu yorumu) — bu yüzden bu duman testi e-Arşiv adımını
// vatRate: 0 DEĞİL, vatRate: 20 ile çalıştırır: muafiyet kodu hiç gerekmez
// ve boru hattının e-Arşiv + PDF uçlarının uçtan uca çalıştığı böyle
// kanıtlanır. KDV semantiği (7. adım, ayrı fatura) zaten vatRate: 20
// kullanıyor; burada AYNI oran kullanılır ki iki adım tutarlı olsun.
const DUMAN_TESTI_VAT_RATE = 20;

// KDV semantiği karşılaştırması için pay bırakılan tolerans (kuruş/yuvarlama
// farkları için). 100 veya 120'ye bu kadar yakınsa o yorum kabul edilir.
const KDV_TOLERANS = 0.5;

type Yanit = string; // "EVET", "HAYIR" veya "BİLİNMİYOR: <sebep>"

async function main() {
  if (!isParasutConfigured()) {
    console.error("HATA: Paraşüt anahtarları tanımlı değil (.env.local).");
    process.exit(1);
  }

  const base = parasutBaseUrl();
  if (!base.includes("staging") && !base.includes("-dev")) {
    console.error(
      `HATA: Base URL staging değil: ${base}\n` +
        "Bu script gerçek fatura oluşturur. Üretimde çalıştırmayın."
    );
    process.exit(1);
  }
  console.log(`Hedef: ${base}\n`);

  // Önceki koşularda aynı TCKN ile oluşmuş cari kayıtları il/ilçe
  // ALANLARI OLMADAN açılmış olabilir (bu alanlar daha sonra eklendi) — o
  // eski/eksik cari tekrar bulunup kullanılırsa e-Arşiv "Alıcı il/ilçe
  // adresi doldurulmalı" hatasıyla reddedilmeye devam eder. Çalışma anına
  // bağlı bir TCKN kullanılarak HER koşuda temiz (il/ilçesi dolu) bir cari
  // oluşturulması garanti edilir.
  const tckn = `2${Date.now().toString().slice(-10)}`;

  // Her soru için varsayılan yanıt: ilgili adım hiç koşulamazsa bu kalır.
  let cevapCariTCKN: Yanit = "BİLİNMİYOR (cari adımı koşulamadı)";
  // Bu soru artık koşuya bağlı DEĞİL: önceki bir duman testi koşusunda
  // ürün ilişkisi OLMADAN gönderilen sales_invoice_details HTTP 422
  // "Ürün/hizmet doldurulmalı" ile reddedildi — gerçek staging yanıtıyla
  // doğrulanmış bir olgu. createSalesInvoice artık HER ZAMAN
  // relationships.product gönderiyor; bu script de artık ilişkisiz deneme
  // YAPMIYOR (reddedileceği zaten bilindiği için gereksiz bir API çağrısı
  // ve taslak kirliliği olurdu).
  const cevapFaturaUrunIliskisizKabul: Yanit =
    "HAYIR — ürün (product) ilişkisi ZORUNLU. Önceki staging denemesinde " +
    "ilişkisiz sales_invoice_details HTTP 422 \"Ürün/hizmet doldurulmalı\" " +
    "ile reddedildi. createSalesInvoice artık relationships.product " +
    "gönderiyor (bkz. lib/parasut.ts, lib/parasut-invoice.ts urunIdGetir).";
  let cevapPdfYolu: Yanit = "BİLİNMİYOR (PDF adımı koşulamadı)";
  let cevapUnitPriceSemantigi: Yanit = "BİLİNMİYOR (KDV adımı koşulamadı)";

  let genelHataVarMi = false;

  // ── 1-2. Cari arama / oluşturma ───────────────────────────────────────────
  let contactId: string | null = null;
  try {
    console.log("1. Cari aranıyor…");
    contactId = await findContactIdByTaxNumber(tckn);
    console.log(`   ${contactId ?? "bulunamadı"}`);

    if (!contactId) {
      console.log("2. Cari oluşturuluyor…");
      contactId = await createContact({
        name: "Duman Testi Müşteri",
        taxNumber: tckn,
        email: "duman-testi@example.com",
        city: DUMAN_TESTI_CITY,
        district: DUMAN_TESTI_DISTRICT,
      });
      console.log(`   ${contactId}`);
    }

    // Adım hatasız geçti: TCKN'nin tax_number + contact_type:"person" ile
    // kabul edildiği (ya da en azından reddedilmediği) doğrulandı.
    cevapCariTCKN = "EVET (cari adımı hatasız geçti)";
  } catch (e) {
    genelHataVarMi = true;
    cevapCariTCKN = `BİLİNMİYOR (cari adımı hata verdi: ${
      e instanceof Error ? e.message : String(e)
    })`;
    console.error("   HATA:", e);
  }

  // ── 3. Ürün bul/oluştur — sales_invoice_details ürün ilişkisi istiyor ────
  let productId: string | null = null;
  if (contactId) {
    try {
      console.log("3. Ürün aranıyor…");
      productId = await findProductIdByName("Tur Hizmeti");
      console.log(`   ${productId ?? "bulunamadı"}`);

      if (!productId) {
        console.log("   Ürün oluşturuluyor…");
        // vatRate: gerçek boru hattında (lib/parasut-invoice.ts) ürün
        // parasutKdvOrani() ile oluşturuluyor; burada da aynı tutarlılık
        // için bu script'in e-Arşiv adımında kullandığı oranla
        // (DUMAN_TESTI_VAT_RATE) eşleniyor.
        productId = await createProduct({ name: "Tur Hizmeti", vatRate: DUMAN_TESTI_VAT_RATE });
        console.log(`   ${productId}`);
      }
    } catch (e) {
      genelHataVarMi = true;
      console.error("   HATA:", e);
    }
  }

  // ── 4. Normal satış faturası (e-Arşiv adımı için — bkz. DUMAN_TESTI_VAT_RATE
  //      yorumu: vatRate 0 DEĞİL 20 kullanılıyor ki muafiyet kodu hiç
  //      gerekmesin ve 5-6. adımlar uçtan uca denenebilsin) ──────────────────
  let invoiceId: string | null = null;
  if (contactId && productId) {
    try {
      console.log("4. Satış faturası oluşturuluyor…");
      invoiceId = await createSalesInvoice({
        contactId,
        productId,
        description: "Duman Testi Turu (1 Ocak 2026 kalkışlı)",
        issueDate: new Date().toISOString().slice(0, 10),
        currency: "TRL",
        quantity: 2,
        unitPrice: 50,
        vatRate: DUMAN_TESTI_VAT_RATE,
      });
      console.log(`   ${invoiceId}`);
      // Adım hatasız geçti: bu, ürün ilişkisi EKLENMİŞ gövdenin kabul
      // edildiğini doğrular (bkz. cevapFaturaUrunIliskisizKabul — o soru
      // zaten önceki koşuda kesin yanıtlandı, burada yalnız düzeltmenin
      // çalıştığı doğrulanıyor).
    } catch (e) {
      genelHataVarMi = true;
      console.error("   HATA:", e);
    }
  }

  // ── 5-6. e-Arşiv + PDF ─────────────────────────────────────────────────
  if (invoiceId) {
    let eArchiveId: string | null = null;
    try {
      console.log("5. e-Arşiv gönderiliyor…");
      eArchiveId = await createEArchive(invoiceId);
      console.log(`   ${eArchiveId}`);
    } catch (e) {
      genelHataVarMi = true;
      cevapPdfYolu = `BİLİNMİYOR (e-Arşiv adımı hata verdi, PDF denenemedi: ${
        e instanceof Error ? e.message : String(e)
      })`;
      console.error("   HATA:", e);
    }

    if (eArchiveId) {
      try {
        console.log("6. PDF indiriliyor…");
        const pdf = await fetchEArchivePdf(eArchiveId);
        const baslangic = pdf.subarray(0, 5).toString();
        console.log(`   ${pdf.length} byte, başlangıç: ${baslangic}`);

        // Baytların GERÇEKTEN bir PDF olduğu doğrulanmadan adım başarılı
        // SAYILMAZ — indirme adresi geçerli olsa da içerik hata sayfası
        // (ör. HTML) olabilir; bu kontrol o farkı yakalar.
        if (!baslangic.startsWith("%PDF")) {
          throw new Error(
            `İndirilen içerik PDF değil (başlangıç "${baslangic}" — "%PDF" bekleniyordu).`
          );
        }

        // fetchEArchivePdf şu an YALNIZ "JSON'da adres döner, sonra adresten
        // binary indirilir" yolunu uyguluyor. Buraya hatasız ulaşıldıysa bu
        // yol gerçekten işliyor demektir.
        cevapPdfYolu =
          "JSON'da imzalı ADRES döndürüyor, PDF o adresten ikinci istekle " +
          "indiriliyor (fetchEArchivePdf'in varsaydığı iki aşamalı yol doğrulandı); " +
          `indirilen ${pdf.length} bayt "%PDF" ile başlıyor (gerçek bir PDF).`;
      } catch (e) {
        genelHataVarMi = true;
        cevapPdfYolu =
          `BİLİNMİYOR (PDF adımı hata verdi: ${
            e instanceof Error ? e.message : String(e)
          }). fetchEArchivePdf şu an yalnız "JSON'da adres" yolunu deniyor; ` +
          "hata, Paraşüt'ün doğrudan binary döndürdüğünü de gösterebilir — " +
          "ayrıca araştırılmalı.";
        console.error("   HATA:", e);
      }
    }
  }

  // ── 7. KDV semantiği testi — AYRI fatura, e-Arşiv YOK ────────────────────
  // Asıl kritik soru: unit_price KDV HARİÇ net mi, KDV DAHİL brüt mü?
  // Booking.totalAmount müşteriden tahsil edilen BRÜT tutar olduğu için bu
  // yanıt mali doğruluk açısından hayati. Bu faturaya e-Arşiv KESİLMİYOR —
  // GİB'e gereksiz belge gitmesin, yalnız satış faturası + toplamlar okunuyor.
  if (contactId && productId) {
    try {
      console.log("7. KDV semantiği testi: unitPrice=100, vatRate=20 ile fatura kesiliyor…");
      const kdvTestFaturaId = await createSalesInvoice({
        contactId,
        productId,
        description: "Duman Testi — KDV Semantiği Kontrolü (e-Arşiv kesilmedi)",
        issueDate: new Date().toISOString().slice(0, 10),
        currency: "TRL",
        quantity: 1,
        unitPrice: 100,
        vatRate: 20,
      });
      console.log(`   ${kdvTestFaturaId}`);

      console.log("   Toplamlar okunuyor…");
      const totals: SalesInvoiceTotals = await fetchSalesInvoiceTotals(kdvTestFaturaId);
      console.log(
        `   netTotal=${totals.netTotal} grossTotal=${totals.grossTotal} totalVat=${totals.totalVat}`
      );

      cevapUnitPriceSemantigi = yorumlaKdvSemantigi(totals);
    } catch (e) {
      genelHataVarMi = true;
      cevapUnitPriceSemantigi = `BİLİNMİYOR (KDV adımı hata verdi: ${
        e instanceof Error ? e.message : String(e)
      })`;
      console.error("   HATA:", e);
    }
  }

  // ── Özet ──────────────────────────────────────────────────────────────
  console.log("\n=== DOĞRULAMA SONUÇLARI ===\n");
  console.log(
    "1. unit_price KDV HARİÇ net mi, KDV DAHİL brüt mü?\n" +
      `   → ${cevapUnitPriceSemantigi}\n`
  );
  console.log(
    "2. sales_invoice_details, ürün (product) ilişkisi olmadan kabul ediliyor mu?\n" +
      `   → ${cevapFaturaUrunIliskisizKabul}\n`
  );
  console.log(
    "3. /e_archives/{id}/pdf JSON'da adres mi, doğrudan binary mi döndürüyor?\n" +
      `   → ${cevapPdfYolu}\n`
  );
  console.log(
    "4. Bireysel müşteride TCKN tax_number alanına mı yazılıyor, contact_type:\"person\" doğru mu?\n" +
      `   → ${cevapCariTCKN}\n`
  );

  if (genelHataVarMi) {
    console.log("Durum: TAMAMLANDI (bazı adımlarda hata oluştu, yukarıya bakın) ⚠️");
    process.exit(1);
  }

  console.log("Durum: TAMAMLANDI ✅");
}

// Toplamlar üzerinden unit_price semantiğini yorumlar. Beklenen girdi:
// quantity=1, unitPrice=100, vatRate=20.
//   - grossTotal ≈ 100 → unit_price zaten BRÜT (KDV dahil) kabul edildi.
//   - grossTotal ≈ 120 → unit_price NET (KDV hariç) kabul edildi, KDV üzerine
//     eklendi. Bu durumda lib/parasut-invoice.ts düzeltilmeli: totalAmount
//     (BRÜT tahsilat) Paraşüt'e gönderilmeden önce net'e çevrilmeli.
//   - Alanlar okunamadıysa (ikisi de null) ya da başka bir değere
//     yakınsıyorsa durum açıkça BİLİNMİYOR/belirsiz olarak işaretlenir.
function yorumlaKdvSemantigi(totals: SalesInvoiceTotals): Yanit {
  if (totals.grossTotal === null && totals.netTotal === null) {
    return (
      "BİLİNMİYOR — Paraşüt yanıtında net_total/gross_total alanları " +
      "okunamadı (alan adları farklı olabilir; ham yanıtı incelemek gerekir)."
    );
  }

  if (totals.grossTotal !== null) {
    if (Math.abs(totals.grossTotal - 100) <= KDV_TOLERANS) {
      return (
        `BRÜT semantiği (grossTotal=${totals.grossTotal} ≈ 100): ` +
        "unit_price KDV DAHİL kabul ediliyor. Booking.totalAmount " +
        "doğrudan unit_price olarak gönderilebilir, dönüşüm gerekmez."
      );
    }
    if (Math.abs(totals.grossTotal - 120) <= KDV_TOLERANS) {
      return (
        `NET semantiği (grossTotal=${totals.grossTotal} ≈ 120): ` +
        "unit_price KDV HARİÇ kabul ediliyor, KDV üzerine eklendi. " +
        "lib/parasut-invoice.ts DÜZELTİLMELİ: Booking.totalAmount " +
        "(brüt tahsilat) Paraşüt'e gönderilmeden önce nete çevrilmeli, " +
        "yoksa KDV oranı 0'dan farklı ayarlandığında fatura toplamı " +
        "tahsil edilen tutardan sapar."
      );
    }
  }

  return (
    `BELİRSİZ — netTotal=${totals.netTotal}, grossTotal=${totals.grossTotal}, ` +
    `totalVat=${totals.totalVat} ne 100'e ne 120'ye yeterince yakın. ` +
    "Ham yanıt elle incelenmeli."
  );
}

main().catch((e) => {
  console.error("\nBEKLENMEYEN HATA:", e);
  process.exit(1);
});
