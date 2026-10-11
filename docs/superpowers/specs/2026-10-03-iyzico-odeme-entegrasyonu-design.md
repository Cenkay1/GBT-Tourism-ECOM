# iyzico Ödeme Entegrasyonu — Tasarım Dokümanı

Tarih: 2026-10-03
Kapsam: iyzico Checkout Form ile canlı ödeme alma, ödeme kayıt tablosu ve admin
panelinden iade. Ağustos 2026'daki "iyzico onay kriterleri" işinin (yasal
sayfalar + footer logo bandı) devamı; bu iş ödeme API'sinin kendisini bağlar.

## Karar: Checkout Form (barındırılan ödeme sayfası)

Üç seçenek değerlendirildi:

| Yaklaşım | Karar | Gerekçe |
|---|---|---|
| **Checkout Form** (iyzico'nun kendi sayfası) | ✅ Seçildi | Kart verisi sunucumuza hiç girmez → PCI kapsamı SAQ A. 3DS, taksit tablosu, Visa/Master/Troy/Amex, "iyzico ile Öde" cüzdanı hazır gelir. Mevcut `startPayment() → { redirectUrl }` soyutlamasına birebir oturur. |
| Kendi kart formu + 3DS Initialize | ❌ | Kart verisi sunucudan geçer → SAQ A-EP. BIN sorgulama, taksit tablosu, hata kodu eşlemesi elle yazılır. Bu proje için gereksiz yük. |
| 3DS'siz direkt çekim | ❌ | Türkiye'de pratikte kullanılmıyor; chargeback sorumluluğu tamamen işyerinde. |

### İstemci: kendi ince katmanımız

Resmi `iyzipay` npm paketi yerine ~320 satırlık `lib/iyzico.ts` yazıldı.
Gerekçe: paket CommonJS + callback tabanlı, tipleri zayıf ve Next 16 /
Turbopack ile `serverExternalPackages` ayarı isteyebiliyor. Kendi katmanımız
sıfır bağımlılık, tam tip güvenliği ve imza fonksiyonunun birim testini
mümkün kılıyor.

## Mimari

| Dosya | Sorumluluk |
|---|---|
| `lib/iyzico.ts` | Saf HTTP katmanı. IYZWSv2 imzalama, `fetch`, tipler, yanıt imzası doğrulama. Prisma/Next/rezervasyon kavramı bilmez. |
| `lib/payment.ts` | İş mantığı. Rezervasyonu iyzico isteğine çevirir (`startPayment`), callback sonucunu doğrular (`verifyIyzicoCallback`). |
| `app/api/odeme/iyzico/callback/route.ts` | iyzico'nun döndüğü uç. Token'ı çıkarır, doğrulamayı çağırır, müşteriyi yönlendirir. |
| `lib/payment-actions.ts` | Simülasyon action'ları + admin iade (`refundBooking`). |
| `components/admin/RefundButton.tsx` | İade butonu (onay diyaloglu, `useActionState`). |
| `prisma/schema.prisma` → `Payment` | Ödeme denemesi kaydı. |

`lib/checkout-actions.ts` değişmedi — `startPayment()` arayüzü korundu.

### Kimlik doğrulama (IYZWSv2)

```
signature = HMAC-SHA256(secretKey, randomKey + uriPath + JSON(body))   → hex
Authorization: IYZWSv2 base64("apiKey:<key>&randomKey:<rnd>&signature:<hex>")
x-iyzi-rnd: <randomKey>
```

`randomKey` her istekte yeniden üretilir (`Date.now()` + rastgele 6 hane).

### Ödeme akışı

```
submitCheckout()  [mevcut, değişmedi]
  ├─ createPendingBooking()           → BEKLIYOR, 15 dk koltuk hold'u
  └─ startPayment()
       ├─ Payment satırı aç (BASLATILDI)
       ├─ POST /payment/iyzipos/checkoutform/initialize/auth/ecom
       │    basketId = conversationId = bookingId
       │    callbackUrl = {baseUrl}/api/odeme/iyzico/callback
       │    enabledInstallments = [1]            ← taksit kapalı
       ├─ Payment.token = res.token
       └─ redirect(res.paymentPageUrl)

müşteri iyzico'da kartı girer, 3DS'ten geçer
  └─ iyzico tarayıcıyı POST eder → /api/odeme/iyzico/callback  (gövde: token)
       └─ verifyIyzicoCallback(token)
            ├─ POST /payment/iyzipos/checkoutform/auth/ecom/detail
            ├─ imza doğrula
            ├─ basketId → rezervasyon
            ├─ price == Booking.totalAmount
            └─ Payment satırını BASARILI'ya çek
       ├─ markBookingPaid()  → koltuklar SATILDI + SMS/e-posta + sadakat puanı
       └─ 303 → /rezervasyon/basarili?no=<bookingId>
```

## Güvenlik modeli

Callback herkese açık bir URL — isteyen herkes POST atabilir. Gelen gövdenin
**yalnızca `token` alanına** bakılır; geri kalan her şeyi iyzico'ya ayrı bir
sunucu-sunucu isteğiyle biz sorarız.

| Açık | Saldırı | Savunma |
|---|---|---|
| Uydurma başarı | Saldırgan `curl` ile `status=success&basketId=<kendi rezervasyonu>` POST eder, hiç ödeme yapmadan tura biner | Gövdeye güvenilmez. Durumu `retrieveCheckoutForm()` ile iyzico söyler. |
| Token takası | Saldırgan 50 TL'lik gerçek ödemenin token'ını alıp 1500 TL'lik rezervasyonun callback'ine gönderir | Rezervasyon kimliği istekten değil, iyzico'nun döndürdüğü `basketId`'den okunur. |
| Yanıt kurcalama | Yanıt yolda değiştirilir | `signature` gizli anahtarla doğrulanır (`verifyCheckoutFormSignature`), karşılaştırma `timingSafeEqual`. |
| Tutar ayrışması | Fiyat mantığı hatası ya da ikinci ödeme başlatma sessizce farklı tutar tahsil eder | `res.price` ile `Booking.totalAmount` karşılaştırılır. |
| Tekrar gönderim | iyzico cevap alamayınca callback'i tekrar dener → çift SMS, çift sadakat puanı | `markBookingPaid()` zaten `ODENDI` ise sessizce başarı döner (mevcut davranış). |

İki ince nokta:

1. **Karşılaştırma `paidPrice` değil `price` üzerinden yapılır.** Taksit
   açıldığında iyzico komisyonu müşteriye bindirir ve `paidPrice > price` olur;
   `paidPrice` karşılaştırılsa taksitli her ödeme haksız yere reddedilirdi.
   `price` sepet toplamıdır, `totalAmount` ile eşleşmesi gereken odur.

2. **Fiyattaki sondaki sıfırlar.** iyzico imza hesabında fiyatların
   kırpılmasını şart koşuyor (`"10.50"` → `"10.5"`). Uçlar farklı biçim
   döndürdüğü için hem ham hem kırpılmış değer denenir — imza yine gizli
   anahtarla hesaplandığından bu güvenliği zayıflatmaz, yalnızca yanlış ret
   riskini ortadan kaldırır.

### Yönlendirme: 303, 307 değil

Callback'e iyzico **POST** ile gelir. `next/navigation`'ın `redirect()`'i 307
üretir ve 307 metodu korur — tarayıcı başarı sayfasına da POST atar, sayfa 405
verir. Bu yüzden `NextResponse.redirect(url, 303)` kullanılır (See Other →
GET'e çevirir).

## Payment tablosu

Her ödeme başlatma bir satır açar, callback aynı satırı günceller. Amacı
mutabakat ve uyuşmazlık takibi: "bu rezervasyon için iyzico ne dedi?"

Kart verisi **tutulmaz** — yalnızca iyzico'nun döndürdüğü maskeli özet
(`cardFamily`, `cardLastFour`).

Durumlar: `BASLATILDI` → `BASARILI` | `BASARISIZ` → `IADE`

Admin rezervasyon detayında "Ödeme Kayıtları" kartı olarak görünür
(tarih, durum, tutar, kart, iyzico no, iade tarihi).

## Admin iade

`refundBooking()` — ödenmiş rezervasyonun parasını geri verir, rezervasyonu
`IPTAL`'e çeker, koltukları boşaltır.

iyzico'da iki ayrı işlem var; sırayla denenir:

- `POST /payment/cancel` — aynı gün, banka mutabakatından önce. Ekstreye hiç
  düşmez, kısmi olamaz.
- `POST /v2/payment/refund` — sonraki günler (365 güne kadar). Ekstrede iade
  satırı görünür, kısmi iade destekler.

Önce `cancel` denenir; iyzico reddederse `refund`'a düşülür. **İkisi de
başarısızsa hiçbir veritabanı değişikliği yapılmaz** — para geri gitmediyse
rezervasyon ödenmiş kalır.

`cancelBooking()` kullanılmaz: o fonksiyon ödenmiş rezervasyonu reddediyor ve
yalnızca `KILITLI` koltukları açıyor. İadede koltuklar `SATILDI` olduğu için
serbest bırakma burada elle yapılır.

Elden satışta (`paymentMethod = NAKIT`) iyzico `Payment` kaydı olmadığından
buton görünmez; kullanıcıya iadenin iyzico panelinden yapılması gerektiği
söylenir.

## Simülasyon modu korunur

Anahtarlar tanımlı değilse `startPayment()` eskisi gibi `/odeme/<bookingId>`
test sayfasına yönlendirir. Kullanıcı bu maddeyi kapsamda işaretlemedi ancak
kaldırılmadı: anahtarsız yerel geliştirmeyi tamamen kırardı ve mevcut kod
zaten bu dalı barındırıyor.

## Veritabanı dağıtımı

`prisma/migrations` bir noktadan sonra veritabanıyla senkron değil (şema
değişiklikleri `db push` ile yapıldı), bu yüzden `migrate deploy`
kullanılamıyor. Projenin mevcut deseni izlendi:

- Yerel: `npx prisma db push --url "file:./dev.db"`
- Canlı: `scripts/deploy-migrate.ts` içine `Payment` tablosunu oluşturan
  idempotent blok eklendi.

## Ortam değişkenleri

```
IYZICO_API_KEY=...        # iyzico panelinden
IYZICO_SECRET_KEY=...     # iyzico panelinden
IYZICO_BASE_URL=https://api.iyzipay.com          # canlı (varsayılan)
# IYZICO_BASE_URL=https://sandbox-api.iyzipay.com  # sandbox
```

`IYZICO_BASE_URL` yeni. Tanımsızsa canlıya (`api.iyzipay.com`) düşer.
Sandbox'a geçiş tek satır değişikliğidir.

**iyzico panelinde yapılması gereken:** callback adresi için
`https://<alan-adi>/api/odeme/iyzico/callback` tanımlanmalı (iyzico bazı
hesaplarda izinli callback alanı ister).

## Kapsam dışı (YAGNI)

- **Taksit.** `enabledInstallments: [1]` ile kapalı. Açmak için hem bu diziyi
  genişletmek hem iyzico sözleşmesinde taksitin açık olması gerekir. Kod
  taksitli tutarı (`paidPrice`) zaten doğru ele alıyor.
- Kısmi iade (iyzico destekliyor, arayüz tam iade yapıyor).
- Webhook (Checkout Form callback'i yeterli).
- BIN sorgulama / kendi taksit tablosu.

## Doğrulama

Yapılan:

- `npx tsc --noEmit` temiz.
- 54/54 test geçiyor (33 → 54; 21 yeni test imzalama ve imza doğrulamayı
  kurcalama senaryolarıyla birlikte kapsıyor).
- `npx eslint` — yeni/değişen dosyalarda hata yok (kalan 5 hata dokunulmayan
  dosyalarda, önceden mevcut).
- `npm run build` başarılı; `/api/odeme/iyzico/callback` route listesinde.
- **Saldırı testleri** (sahte anahtarlarla çalışan dev sunucusunda, gerçek bir
  rezervasyona karşı): token'sız uydurma "başarılı" gövdesi, uydurma token +
  uydurma gövde, GET ile uydurma token → üçü de 303 ile reddedildi,
  rezervasyon durumu değişmedi, hiç `Payment` satırı oluşmadı.
- iyzico sandbox'ından gelen "api bilgileri bulunamadı" hatası, isteğin
  gerçekten iyzico'ya ulaştığını ve IYZWSv2 başlığının ayrıştırıldığını
  doğruluyor.
- Admin rezervasyon detayı: "Ödeme Kayıtları" kartı ve iade butonu test
  verisiyle render edildi, veri sonra silindi.

Yapılamayan (gerçek anahtar + gerçek kart gerektirir):

- Uçtan uca başarılı ödeme (gerçek `paymentPageUrl` → 3DS → callback).
- Gerçek bir yanıt imzasının doğrulanması (birim testlerde iyzico'nun
  hesabı taklit edilerek kapsandı).
- İadenin iyzico tarafında gerçekleşmesi.

Bunlar için sandbox hesabı önerilir: iyzico'nun ücretsiz sandbox'ında test
kartlarıyla tüm akış gerçek para hareketi olmadan denenebilir.
