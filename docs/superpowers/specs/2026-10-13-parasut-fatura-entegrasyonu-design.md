# Paraşüt e-Arşiv Fatura Entegrasyonu

**Tarih:** 2026-10-13
**Durum:** Tasarım onaylandı · uygulama planı bekleniyor

## Amaç

iyzico üzerinden satılan biletlere, **tur başladıktan sonra** otomatik e-Arşiv faturası
kesmek ve faturayı müşteriye kendi e-postamızla PDF ekli göndermek.

Bugün fatura tamamen elle kesiliyor; projede hiç fatura kodu yok.

## Kararlar

Tasarım öncesi netleşen noktalar:

| Konu | Karar |
|---|---|
| Tetikleyici | Tur **başladıktan** sonra (kalkış tarihi geçince), satın alma anında değil |
| Tutar | Toplam bilet bedeli (`Booking.totalAmount`) |
| Kapsam | Yalnız online satış (`ONLINE`, `KREDI_KARTI`). Elden satış (`NAKIT`, `HAVALE`) kapsam dışı |
| Fatura alıcısı | Yolcular arasından ödeme formunda seçilir |
| Fatura kalemi | Tek kalem: tur adı × kişi sayısı |
| Müşteriye iletim | Kendi SMTP'mizle, PDF ekli |
| Hata görünürlüğü | Admin panelde durum + hata mesajı + otomatik yeniden deneme |
| KDV | `.env`'den okunur. Staging'de serbest; **canlıya geçmeden mali müşavire teyit ettirilecek** |
| Döviz | v1 yalnız TRY. EUR rezervasyonlar görünür şekilde atlanır |

---

## Paraşüt API — araştırma notları

| | |
|---|---|
| Üretim | `https://api.parasut.com/v4` |
| Staging | `https://api.heroku-staging.parasut.com` (Paraşüt'ün paylaştığı adres) |
| Staging arayüz | `https://uygulama.heroku-staging.parasut.com` |
| Token ucu | `/oauth/token` |
| Yol yapısı | `/v4/{company_id}/{kaynak}` |
| Token ömrü | ~2 saat |
| Hız sınırı | ~10 istek / 10 saniye |

**Kimlik doğrulama:** `grant_type=password` — Paraşüt'ün kendi PHP istemcisinin kullandığı
akış; `redirect_uri` olarak `urn:ietf:wg:oauth:2.0:oob` (sahte değer) gönderilir.

`authorization_code` akışı tercih edilmedi: arka plan işi insan müdahalesi olmadan
çalışmalı. O akışta bir kez tarayıcıdan onay verilip `refresh_token` saklanır ve o token
bir gün sessizce geçersizleşirse faturalar durur. Password grant kendi kendini onarır.
Bu nedenle Paraşüt'ün verdiği **callback URL bu entegrasyonda kullanılmaz**.

`company_id`, `GET /v4/me` ile bir kez öğrenilip `.env`'e yazılır.

**Fatura akışı üç kayıt:**

```
POST /v4/{company_id}/contacts        → cari
POST /v4/{company_id}/sales_invoices  → satış faturası
POST /v4/{company_id}/e_archives      → e-Arşiv (GİB'e iletir)
```

e-Arşiv kaydı faturaya bağ verir:

```json
{ "data": { "type": "e_archives",
  "relationships": { "sales_invoice": { "data": { "id": "<fatura_id>", "type": "sales_invoices" } } } } }
```

PDF: `GET /sales_invoices/{id}?include=active_e_document` ile e-belge id'si alınır,
ardından `GET /e_archives/{id}/pdf`.

---

## Mimari

### Katmanlar

Mevcut iyzico ayrımı birebir izlenir:

| Dosya | Sorumluluk | Örneği |
|---|---|---|
| `lib/parasut.ts` | Saf HTTP: OAuth token, JSON:API istekleri, `ParasutError`. İş kuralı bilmez. | `lib/iyzico.ts` |
| `lib/parasut-invoice.ts` | İş mantığı: rezervasyonu faturaya çevirir, boru hattını yürütür, `Invoice` kaydını günceller. | `lib/payment.ts` |
| `app/api/cron/faturalar/route.ts` | `CRON_SECRET` korumalı tetikleyici. | `app/api/cron/reminders` |

`isParasutConfigured()` — anahtar yoksa iş sessizce boş döner. `isIyzicoConfigured()` ile
aynı mantık; yerel geliştirme ve testler anahtarsız çalışır.

### Ortam değişkenleri

```
PARASUT_BASE_URL      # staging: https://api.heroku-staging.parasut.com
PARASUT_CLIENT_ID
PARASUT_CLIENT_SECRET
PARASUT_USERNAME      # Paraşüt hesabı e-postası
PARASUT_PASSWORD
PARASUT_COMPANY_ID
PARASUT_KDV_ORANI     # varsayılan 0
```

`IYZICO_BASE_URL` deseniyle aynı: staging/canlı ayrımı tek değişkenle, kodda sabit adres yok.

---

## Veri modeli

### Yeni model: `Invoice`

`Payment` modelinin aynadı — ödeme denemesi nasıl `Booking`'e kolon olarak değil kendi
tablosunda tutuluyorsa, fatura da öyle tutulur.

```prisma
model Invoice {
  id           String    @id @default(cuid())
  bookingId    String    @unique
  booking      Booking   @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  provider     String    @default("PARASUT")
  contactId    String?   // Paraşüt cari id
  invoiceId    String?   // sales_invoice id — oluşur oluşmaz yazılır
  eArchiveId   String?   // e_archive id
  status       String    @default("BEKLIYOR") // BEKLIYOR | KESILDI | GONDERILDI | BASARISIZ | ELLE
  attempts     Int       @default(0)
  errorMessage String?
  emailSentAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

`bookingId @unique` mükerrer faturaya veritabanı seviyesinde engel koyar ve eşzamanlı iki
cron çalışmasına karşı korur.

### `Booking`'e tek alan

```prisma
invoicePassengerIndex Int?   // 0 tabanlı; roomIndex konvansiyonuyla aynı
```

Fatura kimin adına kesilecek. Yolcular `createPendingBooking` içinde iç içe oluşturulduğu
için form aşamasında henüz id'leri yok; sıra numarası doğal anahtar. Kodda `roomIndex`
zaten bu konvansiyonu kullanıyor.

`CheckoutForm`'daki yolcu bloklarına "Fatura bu kişiye kesilsin" seçeneği eklenir,
varsayılan 1. yolcu. `idNumber` tüm yolcular için zaten zorunlu (`lib/booking.ts:144`),
dolayısıyla alıcı kimliği garanti.

### Göç

`prisma/schema.prisma` değişikliği `scripts/deploy-migrate.ts`'e de yansıtılmalı:
`Invoice` tablosu için `CREATE TABLE` + `bookingId` benzersiz indeksi, `Booking` için
`invoicePassengerIndex` kolonu. Aksi halde canlıda tablo/kolon bulunamaz ve 500 alınır
(ExcelTemplate'te yaşanan hata).

---

## Akış

Cron günde bir çalışır. Aday sorgusu `runDepartureReminders` kalıbının aynası — tek fark
karşılaştırma yönü (`lte` / kalkış oldu):

```ts
status: "ODENDI",
paymentMethod: { in: ["ONLINE", "KREDI_KARTI"] },
OR: [
  { departure: { departureDate: { lte: now } } },
  { departureId: null, tour: { departureDate: { lte: now } } },
],
// Invoice yok ya da status BASARISIZ (attempts < 5)
```

Döviz ve yabancı uyruk **sorguda filtrelenmez**. Filtrelenirse hiç `Invoice` kaydı oluşmaz
ve panelde görünmezler — oysa görünür olmaları gerekiyor. Bunun yerine boru hattının
başında kontrol edilir ve `status = ELLE` + açıklayıcı mesajla kayıt yazılır; otomatik
yeniden denenmez.


Boru hattı, her adımın sonucu kalıcı yazılarak:

```
1. Token al (bellekte ~2 saat önbellek)
2. Cari bul/oluştur  → contactId yazılır
3. sales_invoice     → invoiceId yazılır, status = KESILDI
4. e_archive (GİB)   → eArchiveId yazılır
5. PDF çek
6. Mail gönder       → emailSentAt yazılır, status = GONDERILDI
```

**Mükerrer koruması:** yeniden denemede `invoiceId` doluysa 3. adım atlanır ve iş kaldığı
yerden devam eder. Bu şart: fatura oluşup mail atılırken süreç çökerse, sonraki çalışma
ikinci bir fatura kesmemelidir.

**Fatura kalemi:** tek satır, `"<Tur adı> (<kalkış tarihi> kalkışlı)"`, miktar = yolcu
sayısı, toplam = `Booking.totalAmount`.

**Cari yönetimi:** her rezervasyon için yeni cari açmak muhasebeyi kirletir. Önce TCKN ile
mevcut cari aranır, bulunamazsa oluşturulur.

**Hız sınırı:** adaylar arası kısa bekleme; her çalışmada üst sınır (50 fatura).

---

## Hata yönetimi

Her adım `try/catch`. Hata `errorMessage`'a yazılır (500 karaktere kırpılır — `Payment`
deseni), `attempts` artar, `status = BASARISIZ`. Sonraki cron yeniden dener.

**Deneme sınırı:** `attempts >= 5` olanlar otomatik denenmez; panelde "elle müdahale
gerekiyor" olarak görünür. Böylece kalıcı bir hata (ör. geçersiz TCKN) sonsuz döngüye ve
Paraşüt'e gereksiz yüke dönüşmez.

Geçici (ağ, 429, 5xx) ile kalıcı (422) hata ayrımı ilk sürümde yapılmaz — deneme sınırı
pratikte aynı işi görüyor. Gerekirse sonra eklenir.

---

## Admin paneli

Rezervasyon detayında, mevcut "Ödeme Kayıtları" bölümünün yanına **"Fatura"** bölümü:

- Durum rozeti: Bekliyor / Kesildi / Gönderildi / Hata / **Elle faturalanacak**
- Paraşüt fatura numarası ve PDF bağlantısı
- Hata varsa mesajı ve deneme sayısı
- **"Yeniden dene"** düğmesi — deneme sınırına takılmış faturayı elle tetikler

Son madde şart: sınır olmadan sonsuz döngü olur; sınır olup elle tetikleme olmazsa takılan
fatura kalıcı olarak ölü kalır.

## Mail eki

`lib/notify.ts:55` `sendEmail(to, subject, html)` ek desteklemiyor. Opsiyonel
`attachments` parametresi eklenir; nodemailer zaten destekliyor, mevcut çağrılar etkilenmez.

---

## Test stratejisi

Mevcut iki katmanlı desen izlenir:

| Dosya | Kapsam |
|---|---|
| `lib/__tests__/parasut.test.ts` | Saf fonksiyonlar, ağ yok: fatura gövdesi kurulumu, kalem/tutar hesabı, tarih biçimi, `ParasutError` ayrıştırma — `iyzico.test.ts` gibi |
| `lib/__tests__/parasut-invoice.test.ts` | Boru hattı, HTTP katmanı mock'lu, gerçek DB ile (`helpers/db.ts`) — `payment-flow.test.ts` gibi |

Kritik testler:

- **Mükerrer engelleme:** aynı rezervasyon iki kez işlenirse ikinci fatura kesilmez
- **Yarıda kalma:** `invoiceId` dolu + `eArchiveId` boş durumunda yeniden çalıştırma fatura adımını atlar
- **Aday sorgusu:** tur başlamamış / elden satış / zaten faturalanmış kayıtlar seçilmez
- **Elle işaretleme:** EUR tur ve yabancı uyruklu alıcı `status = ELLE` alır, fatura kesilmez
- **Deneme sınırı:** `attempts >= 5` olan kayıt otomatik denenmez

---

## Kapsam dışı (bilinçli)

- **Elden satış** (`NAKIT`/`HAVALE`) faturalandırması.
- **İade sonrası fatura iptali** — tur başladıktan sonra iade nadir. Panelde fatura görünür
  olduğu için görevli Paraşüt'ten elle iptal eder.
- **Yabancı uyruklu alıcı** — e-Arşiv pasaport numarasını TCKN'den farklı alanda ister.
  Fatura alıcısı olarak yabancı yolcu seçilirse `status = ELLE` yazılır ve panelde görünür;
  sessizce yanlış fatura kesilmez.
- **Döviz (EUR) turlar** — e-Arşiv döviz faturasında TL karşılığı ve kur tarihi istiyor.
  v1 yalnız TRY; EUR rezervasyonlar `status = ELLE` alır ve panelde "döviz — elle
  faturalanacak" olarak görünür. Sessiz atlama değil, görünür atlama.

## Canlıya geçmeden önce

- **KDV oranı mali müşavire teyit ettirilmeli.** Staging'de gerçek fatura yazılmadığı için
  serbest; canlıda yanlış oranla kesilmiş faturanın düzeltilmesi zahmetli.
- Paraşüt canlı anahtarları sunucudaki `.env`'e; staging anahtarları yerel `.env.local`'e.
- `scripts/deploy-migrate.ts` göçü çalıştırılmalı.
