# Yönetim Paneli: Ciro Raporu, İptal Akışı, Koltuk Numaralandırma ve Kartlı Elden Satış

**Tarih:** 2026-10-10
**Durum:** Aşama 1 tamamlandı (2026-10-11) · Aşama 2-4 planlanmayı bekliyor

## Amaç

Yedi ayrı talebi dört aşamada karşılamak:

1. Üretimde çoklu seferli turun kaydedilememesi (500)
2. İptal edilen rezervasyonun koltuğunun boşa düşmemesi + iptal bildirimi
3. Otobüs koltuk önizlemesinin sadeleşmesi ve özel koltuk numaralandırma
4. Aylık ciro grafiği ve detaylı tarih filtresi
5. Yönetim panelinde hızlı işlem düğmeleri
6. Elden satışta iyzico ile kart tahsilatı + e-posta eşleşince sadakat puanı
7. Ödeme adımında KVKK ve iptal/iade rızasının alınması ve saklanması

Aşamalar bağımsız teslim edilir. Sıra: önce canlıda zarar veren iki hata, sonra özellikler.

---

## Aşama 1 — Bugfix

### 1a. Çoklu seferde 500 hatası

#### Kök neden (kanıtlanmış)

İlk migration `prisma/migrations/20260718084727_init/migration.sql:86` şu indeksi yaratıyor:

```sql
CREATE UNIQUE INDEX "Seat_tourId_code_key" ON "Seat"("tourId", "code");
```

Şema sonradan `@@unique([departureId, code])`'a geçti (commit `51dd962`). Üretim veritabanı `prisma migrate` ile değil, elle yazılmış `scripts/deploy-migrate.ts` ile güncelleniyor. O script'in indeks bölümü (satır 344-362) **yeni indeksi ekliyor, eskisini düşürmüyor.**

Sonuç: üretimde bir tur `1A` kodlu koltuğu yalnızca bir kez tutabiliyor. İkinci sefer eklenince `generateSeats` (`lib/admin-actions.ts:505`) aynı `tourId` altında `1A, 1B, …` kodlarını tekrar yazmaya çalışıyor:

```
Invalid `prisma.seat.createMany()` invocation at lib/admin-actions.ts:505
Unique constraint failed on the fields: (`tourId`, `code`)
```

Server action bu hatayı yakalamadığı için istek 500 dönüyor.

Reprodüksiyon yöntemi: `dev.db` kopyası üzerinde eski indeks elle yaratıldı, ardından tek seferli bir tura ikinci sefer eklendi. Hata birebir çıktı. Eski indeks olmadan aynı senaryo (ve dört mutasyon senaryosu daha) sorunsuz geçiyor.

#### Yan hasar

`saveDepartures` (`lib/admin-actions.ts:324`) transaction içinde değil. Sefer satırı `create` ediliyor, ardından koltuk üretimi patlıyor. Üretimde **koltuğu olmayan yetim `TourDeparture` kayıtları** kalmış olabilir. Onarım bunları da kapsamalı.

#### Çözüm

Yeni modül `lib/seat-index-repair.ts` — script'ten de testten de çağrılabilsin diye mantık script'ten çıkarılır:

- `repairSeatIndexes(prisma)`: `sqlite_master`'daki `Seat` indekslerini tarar; `(tourId, code)` üzerindeki benzersiz indeksi **düşürür**, `Seat_departureId_code_key` yoksa yaratır. İsim varyasyonlarına karşı indeks adına değil, `sql` metnindeki kolon listesine bakar.
- `repairSeatlessDepartures(prisma)`: `bookingType = "KOLTUK"` olup hiç koltuğu olmayan seferleri bulur, etkin düzeni (`resolveSeatLayout` ile aynı öncelik: seferin otobüsü > turun otobüsü > turdaki elle girilmiş alanlar) çözüp koltukları üretir.

`scripts/deploy-migrate.ts` bu iki fonksiyonu çağırır. Mevcut satır içi indeks bloğu kaldırılır. Sıra önemli: indeks onarımı koltuk üretiminden **önce** gelmeli.

Doğrudan düşürme güvenli: indeks adlı (auto-index değil), SQLite'ta `DROP INDEX` anlık ve veriye dokunmuyor.

#### Test

`lib/__tests__/seat-index-repair.test.ts`:

- Geçici SQLite dosyasına üretim benzeri şema kurulur (eski `Seat_tourId_code_key` dahil)
- `repairSeatIndexes` çalıştırılır → eski indeks gitmiş, yenisi var
- Aynı tura ikinci sefer eklenip koltuk üretilir → başarılı
- `repairSeatlessDepartures` koltuksuz sefere doğru sayıda koltuk üretiyor
- Onarım iki kez çalıştırılınca bozulmuyor (idempotent)

### 1b. Sunucu eylemlerinde hata yutulmaması

`createTour` ve `updateTour` ham hata fırlatıp 500 veriyor. Her ikisi de Prisma hatalarını yakalayıp forma okunur mesajla dönecek:

```
/admin/turlar/<id>?hata=<mesaj>
```

`redirect()` kendi sinyalini `throw` ettiği için `catch` bloğu bu sinyali ayırt edip **yeniden fırlatmalı** (`isRedirectError` kontrolü). Aksi halde başarılı kayıt da hataya düşer.

Düzenleme ve yeni tur sayfaları `?hata=` parametresini okuyup formun üstünde gösterir — `rezervasyonlar/yeni` sayfasındaki mevcut desenin aynısı.

### 1c. İptal → koltuk serbest + iptal maili

#### Kök neden

`lib/admin-actions.ts:904` `setBookingStatus` yalnızca `status` yazıyor, koltuğa hiç dokunmuyor:

```ts
export async function setBookingStatus(id: string, status: string) {
  await requireAdmin();
  await prisma.booking.update({ where: { id }, data: { status } });
  ...
}
```

#### Çözüm

`lib/booking.ts`'e `cancelBookingByAdmin(bookingId, reason, opts?)`:

1. Rezervasyonu yolcularıyla okur; zaten `IPTAL` ise sessizce çıkar (idempotent)
2. Tek transaction içinde:
   - `status = "IPTAL"`
   - o seferin ilgili koltukları → `status = "BOS"`, `gender = null` (durum filtresi **yok**: `SATILDI` koltuklar da serbest kalmalı — bugün `cancelBooking` yalnızca `KILITLI` olanları açıyor)
   - puan geri alımı (aşağıda)
3. Transaction dışında, best-effort: iptal e-postası

`setBookingStatus` yalnızca iptal dışı geçişler için kalır; `IPTAL` hedefi verilirse `cancelBookingByAdmin`'e yönlendirir. `ODENDI`'ye geri dönüşte koltuklar yeniden `SATILDI` yapılır; koltuk bu arada başkasına satılmışsa işlem reddedilip görevliye okunur hata gösterilir.

`lib/payment-actions.ts`'teki `refundBooking` kendi satır içi koltuk boşaltma bloğunu bırakıp aynı fonksiyonu kullanır — iki yerde iki ayrı kopya kalmasın.

#### Sadakat puanı geri alımı

Ödenmiş ve puanı yazılmış (`loyaltyAwardedAt != null`) bir rezervasyon iptal edilince puan geri alınır. `lib/loyalty.ts`'e `revokeLoyaltyForBooking(bookingId, tx)`:

- `User.points` ve `User.lifetimePoints` kazanılan kadar azaltılır (taban 0'ın altına inmez)
- `tier` yeni `lifetimePoints`'e göre yeniden hesaplanır
- `PointsLedger`'a `delta = -kazanım`, `reason = "IPTAL"` satırı
- `Booking.loyaltyAwardedAt = null` — tekrar ödenirse puan yeniden yazılabilsin
- İdempotent: `loyaltyAwardedAt` zaten `null` ise hiçbir şey yapmaz

Kazanılan puan, ledger'daki o rezervasyona ait `KAZANIM` satırlarının toplamından okunur — `totalAmount` sonradan değişmiş olabilir.

#### İptal e-postası

`lib/notifications.ts`'e `sendBookingCancellation(bookingId, reason, opts?: { refundAmount?: number })`.

- Gönderen: `SMTP_FROM` (`info@gozdemburakturizm.com` olarak yapılandırılacak — `lib/notify.ts:73` zaten `SMTP_FROM ?? SMTP_USER` kullanıyor, kod değişikliği gerekmiyor, yalnızca env)
- Alıcı: `booking.contactEmail`
- Konu: `Gözdem Burak Turizm — Rezervasyon İptali (<REZ-NO>)`
- Gövde: rezervasyon no, tur adı, sefer tarihi, yolcu listesi, **görevlinin yazdığı iptal nedeni**, varsa iade tutarı ve "3-7 iş günü içinde kartınıza yansır" notu, iletişim bilgileri
- HTML kabuğu `lib/customer-notifications.ts`'teki `shell()` ile aynı görünümde. `shell()` ve `button()` ortak bir yere (`lib/email-layout.ts`) taşınıp iki modül de oradan kullanır.
- Best-effort: e-posta patlarsa iptal geri alınmaz, konsola loglanır (mevcut desen)

SMS gönderilmez — kullanıcı yalnızca e-posta istedi.

#### UI

`app/admin/(dash)/rezervasyonlar/[id]/page.tsx` içindeki `StatusButton`'ın `IPTAL` örneği yerine yeni istemci bileşeni `components/admin/CancelBookingButton.tsx`:

- "İptal Et" düğmesi → açılan panelde zorunlu "İptal nedeni" textarea'sı (müşteriye gidecek metin olduğu uyarısıyla) → "İptal Et ve Müşteriye Bildir"
- `useActionState` ile sonuç mesajı gösterilir (`RefundButton.tsx` ile aynı desen)
- Neden alanı boşsa sunucu tarafında reddedilir

---

## Aşama 2 — Otobüs koltuk düzeni

### 2a. Önizleme kozmetiği

`components/admin/BusForm.tsx` önizleme bloğu:

- `Şoför 🚌` → emoji kalkar, metin `ŞOFÖR` olur ve **sola** hizalanır (`justify-end` → `justify-start`)
- `🚪 Kapı` → emoji kalkar, yalnız `Kapı` yazısı ile ayraç çizgisi kalır
- Koltuk kutularında `1A` yerine **görünen etiket** yazar (aşağıdaki numaralandırma)

### 2b. Özel koltuk numaralandırma

#### Tasarım kararı

`Seat.code` (`1A`, `1B`, `12M`) **iç kimlik olarak değişmeden kalır.** Buna bağlı olanlar:

- `@@unique([departureId, code])`
- `seatNeighbor(code, layout)` — yan yana cinsiyet kuralı, `^(\d+)([A-Z])$` kalıbını ayrıştırıyor (`lib/shared.ts:251`)
- `Passenger.seatCode`, `Booking` ile ilişkili tüm geçmiş kayıtlar
- `toggleSeatBlock`, `buildSeatGrid`, Excel çıktısı

Kodu değiştirmek mevcut satışları kırar. Bunun yerine **görünen etiket katmanı** eklenir.

#### Veri modeli

```prisma
model Bus {
  ...
  seatLabels String @default("{}") // { "1A": "5", "1B": "6", ... }
}

model Seat {
  ...
  label String? // görünen numara; null ise code gösterilir
}
```

- `Bus.seatLabels` kaynak harita; admin burada düzenler
- `Seat.label` sefer bazlı kopyadır — `generateSeats` sırasında araçtan yazılır. Araç düzeni sonradan değişse bile satılmış seferin etiketleri sabit kalır.

#### Varsayılan etiketleme

Harita boşsa etiket ızgara sırasına göre `1, 2, 3, …` üretilir: `1A→1, 1B→2, 1C→3, 1D→4, 2A→5, …`. Son sıra koridor koltuğu (`12M`) kendi sırasının sonunda numaralanır.

Bu tek başına A/B/C/D'yi her yüzeyden kaldırır. Saf fonksiyon: `defaultSeatLabels(vehicleType, rows, backRowFull): Record<string, string>` — `lib/shared.ts`.

#### Admin düzenleme

`BusForm` önizlemesinde koltuğa tıklanınca satır içi giriş açılır. Doğrulama:

- Boş olamaz
- En çok 4 karakter
- Araç içinde tekrar edemez (çakışan koltuk kırmızı çerçeveyle işaretlenir, kaydet kilitlenir)

Yanında "Varsayılana dön" düğmesi. Harita gizli alanda JSON olarak gönderilir; `busDataFromForm` ayrıştırıp doğrular (sunucu tarafı doğrulama şart — istemci atlanabilir).

#### Yansıyacak yüzeyler

| Yüzey | Dosya |
|---|---|
| Site koltuk seçimi | `components/SeatMap.tsx` |
| Admin elden satış | `components/admin/AdminSaleForm.tsx` |
| Admin koltuk yönetimi | `app/admin/(dash)/turlar/[id]/koltuklar/page.tsx` |
| Rezervasyon detayı | `app/admin/(dash)/rezervasyonlar/[id]/page.tsx` |
| Excel çıktısı | `app/admin/(dash)/turlar/[id]/excel/route.ts` |
| Onay / hatırlatma bildirimleri | `lib/notifications.ts:66` |

`buildSeatGrid`'in `SeatState`'ine `seatLabels?: Record<string, string>` eklenir; dönen `Seat` nesnesi `label` taşır. Çağıran sayfalar seferin koltuk etiketlerini sorgudan geçirir.

Etiket çözümü tek yerde: `seatDisplay(code, label?)` → `label ?? code`.

#### Göç

`deploy-migrate.ts`: `Bus.seatLabels` ve `Seat.label` kolonları eklenir; mevcut koltuklar seferin etkin düzenine göre varsayılan sıralı numarayla doldurulur.

---

## Aşama 3 — Yönetim paneli

### 3a. Ciro grafiği

#### Veri kuralı

- Ciro = `Booking.status === "ODENDI"` kayıtların `totalAmount` toplamı
- Tarih ekseni = `Booking.createdAt` (rezervasyon tarihi — kullanıcı kararı; şema değişikliği gerektirmez)
- Saat dilimi: `Europe/Istanbul`. Ay/gün sınırları bu dilime göre hesaplanır.

#### Kova mantığı

`lib/revenue.ts`, saf ve test edilebilir:

```ts
export type Bucket = { key: string; label: string; start: Date; end: Date; total: number; count: number };

export function bucketRevenue(
  bookings: { createdAt: Date; totalAmount: number }[],
  range: { from: Date; to: Date }
): { buckets: Bucket[]; granularity: "gun" | "ay" }
```

- Aralık ≤ 62 gün → **günlük** kova, aksi halde **aylık**
- Veri olmayan aralar 0 değerli kova olarak **doldurulur** — grafikte boşluk atlanmaz
- Birim testleri: ay sınırı, yıl sınırı, boş aralık, tek gün, DST geçişi, 62/63 gün eşiği

#### UI

`app/admin/(dash)/page.tsx` sunucu bileşeni olarak kalır.

- Filtre çubuğu: hazır aralıklar (Bu ay · Son 3 ay · Son 6 ay · Son 1 yıl · Son 3 yıl · Tümü) + serbest tarih aralığı (`?baslangic=&bitis=`). Hepsi URL querystring'inde, sunucuda render.
- Grafik: satır içi SVG sütun grafiği. Harici kütüphane eklenmez — proje bağımlılık-hafif, bu korunur.
  - Her kova bir sütun; üstünde tutar, altında ay/gün etiketi
  - `<title>` ile erişilebilir tooltip
  - Kova sayısı çoksa etiketler seyreltilir (her n'inci)
  - Yatay taşma `overflow-x: auto` ile kendi kabında
- Özet satırı: toplam ciro · rezervasyon sayısı · ortalama sepet
- Mevcut `Stat` kartları korunur, "Ciro (dönem)" seçili aralığı yansıtır

### 3b. Hızlı işlemler

Sayfanın dibindeki iki düğme kaldırılıp **Yaklaşan Turlar'ın yanına** taşınır: `lg` ve üstünde iki sütun (`lg:grid-cols-[1fr_320px]`), darda alt alta.

Kart içinde ikonlu kılavuz düğmeler:

| Düğme | Hedef | İkon |
|---|---|---|
| Yeni Tur | `/admin/turlar/yeni` | `BusIcon` |
| Elden Satış | `/admin/rezervasyonlar/yeni` | `TicketIcon` |
| Yeni Afiş | `/admin/afisler` | `ImageIcon` |
| Otobüs Ekle | `/admin/otobusler/yeni` | `BusIcon` |
| Rezervasyonlar | `/admin/rezervasyonlar` | `CalendarIcon` |
| Üyeler | `/admin/uyeler` | `UsersIcon` |
| Yorumlar | `/admin/yorumlar` | `StarIcon` |
| Özellikler | `/admin/ozellikler` | `CheckCircleIcon` |

İkonların tamamı `components/Icons.tsx`'te mevcut. Düğmeler 2 sütunlu ızgara, ikon + etiket, dokunmatik için ≥44px yükseklik.

---

## Aşama 4 — Ödeme ve onaylar

### 4a. Elden satışta kartla tahsilat

#### Yaklaşım

iyzico **Checkout Form'un gömülü (embedded) biçimi**. `initializeCheckoutForm` yanıtındaki `checkoutFormContent` admin sayfasına gömülür; kart alanları iyzico'nun kendi iframe'inde açılır, 3D Secure akar. Kart verisi hiçbir anda bizim sunucumuza girmez — PCI-DSS yükü ve iyzico'dan ayrı izin gerekmez.

#### Akış

1. `AdminSaleForm`'a ödeme yöntemi seçimi: **Nakit** (bugünkü davranış) / **Kart**
2. Kart seçilirse `createManualBooking`:
   - `createPendingBooking({ allowBlocked: true, allowPast: true })` → `BEKLIYOR`, koltuklar `KILITLI`
   - `paymentMethod = "KART_ELDEN"` (şemadaki `ONLINE | NAKIT` yorumu `ONLINE | NAKIT | KART_ELDEN` olarak güncellenir — `prisma/schema.prisma:144`)
   - `/admin/rezervasyonlar/<id>/odeme` sayfasına yönlendirir
3. O sayfa `startPayment(..., { embedded: true })` çağırıp `checkoutFormContent`'i render eder
4. iyzico `/api/odeme/iyzico/callback`'e döner; mevcut doğrulama zinciri (imza → basketId → tutar) değişmeden çalışır
5. Callback `paymentMethod === "KART_ELDEN"` ise `/admin/rezervasyonlar/<id>?odeme=basarili`, değilse bugünkü müşteri sayfasına yönlendirir

#### Dokunulacak yerler

- `lib/payment.ts`: `StartPaymentInput`'a `embedded?: boolean`; dönüş tipi `{ mode: "redirect"; redirectUrl } | { mode: "embedded"; content }`. `initializeCheckoutForm` `checkoutFormContent`'i zaten döndürüyor.
- iyzico yapılandırılmamışsa (yerel geliştirme) kart seçeneği devre dışı gösterilir ve nedeni yazılır — sessizce simülasyona düşmek elden satışta yanıltıcı olur.
- Tutma süresi `HOLD_MINUTES = 15` masa başı için yeterli, değişmiyor.

### 4b. E-posta eşleşince sadakat puanı

`createManualBooking`, girilen e-postayı normalize edip `User` tablosunda arar; bulursa `createManualPaidBooking`'e `userId` geçer. Gerisini mevcut zincir yapıyor: `markBookingPaid → awardLoyaltyForBooking` (`lib/booking.ts:398`). Nakit satışta da çalışır.

Form geri bildirimi: e-posta alanından çıkınca `/api/admin/uye-ara?eposta=` sorgulanır ve satır gösterilir:

> Kayıtlı üye: **Ahmet Y.** · Altın · 32.400 puan — bu satış ≈ 18.000 puan kazandıracak

Uç nokta `requireAdmin` ile korunur ve yalnız ad baş harfi, kademe, puan döndürür — admin paneli dışında kişisel veri sızdırmaz. Eşleşme yoksa "Bu e-posta kayıtlı değil — puan yazılmayacak" yazar.

### 4c. KVKK ve iptal/iade rızası

#### Onay kutuları

Hem site `components/CheckoutForm.tsx`'inde hem admin kart satışında, ödeme düğmesinin hemen üstünde iki **zorunlu** kutu:

1. `Mesafeli Satış Sözleşmesi`'ni ve `İptal / İade Koşulları`'nı okudum, onaylıyorum. → `/mesafeli-satis`, `/teslimat-iade` (yeni sekmede)
2. `Gizlilik Politikası ve KVKK Aydınlatma Metni`'ni okudum, kişisel verilerimin işlenmesini kabul ediyorum. → `/gizlilik`

Admin kart satışında metin görevli diliyle: "Müşteri … okudu ve onayladı."

Yanında açılır kapanır **"İptal ve İade Koşulları" özeti** — `/teslimat-iade` içeriğinin kısa hâli, müşteri sayfadan ayrılmadan okusun.

#### Sunucu tarafı zorunluluk

`lib/checkout-actions.ts` `submitCheckout` ve admin satış eylemi, iki onay da gelmediyse isteği reddeder ve forma okunur hata döndürür. İstemci kutusu tek başına kanıt değil.

#### Rıza kaydı

```prisma
model Booking {
  ...
  consentAcceptedAt DateTime? // rızanın alındığı an
  consentVersion    String?   // örn. "2026-10-10" — metinlerin o günkü sürümü
  consentIp         String?   // rızayı veren istemcinin IP'si
}
```

Rızayı alıp saklamazsak uyuşmazlıkta ispatlayamayız; maddenin asıl amacı bu. IP `x-forwarded-for` başlığından okunur. `consentVersion` sabit bir metin sürümü olarak `lib/company.ts`'te tutulur; sözleşme metinleri güncellenince elle yükseltilir.

Rezervasyon detay sayfasında küçük bir satır: "Rıza alındı — 10.10.2026 14:32 · sürüm 2026-10-10 · 85.x.x.x".

`deploy-migrate.ts` üç kolonu ekler. Geçmiş rezervasyonlarda `null` kalır (geriye dönük rıza uydurulmaz).

---

## Test stratejisi

| Alan | Test |
|---|---|
| Seat indeks onarımı | Üretim benzeri DB üzerinde birim test; ikinci sefer eklenebiliyor, idempotent |
| İptal akışı | `cancelBookingByAdmin` koltuğu boşaltıyor, puanı geri alıyor, idempotent; e-posta çağrılıyor |
| Puan geri alımı | Kazanım → iptal → bakiye ve kademe doğru; iki kez çağrılınca bozulmuyor |
| Koltuk etiketi | `defaultSeatLabels` tüm araç tiplerinde ve `backRowFull` ile doğru; tekrar eden etiket reddediliyor |
| Ciro kovaları | Ay/yıl sınırı, boş aralık, tek gün, 62/63 gün eşiği, boş kova doldurma |
| Rıza zorunluluğu | Onaysız `submitCheckout` reddediliyor; rıza alanları yazılıyor |
| iyzico gömülü akış | `startPayment` embedded modda `checkoutFormContent` döndürüyor; callback `KART_ELDEN`'i admin'e yönlendiriyor |

Her aşama sonunda: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.

> `.venv` bozuk sembolik bağı yerel `next build`'i kırabiliyor — build adımında bu bilinen tuzak kontrol edilir.

---

## Şema değişikliklerinin iki yolu

Bu projede yerel ve üretim şeması ayrı yollardan güncelleniyor; her yeni kolon **ikisine birden** yazılmalı:

| Ortam | Yol |
|---|---|
| Yerel | `prisma/schema.prisma` + `npx prisma migrate dev` (yeni migration klasörü) |
| Üretim | `scripts/deploy-migrate.ts` içine elle `add(...)` satırı |

Biri atlanırsa ortamlar sessizce ayrışır — Aşama 1'deki 500 hatasının kaynağı tam olarak budur. Bu aşamalarda eklenen kolonlar: `Bus.seatLabels`, `Seat.label`, `Booking.consentAcceptedAt`, `Booking.consentVersion`, `Booking.consentIp`.

Yerelde `DATABASE_URL="file:./dev.db"` ile çalıştırılmalı — `.env`'deki değer üretim dosyasını işaret ediyor.

---

## Dağıtım notu

Aşama 1, 2 ve 4'ün veritabanı değişiklikleri `scripts/deploy-migrate.ts` ile uygulanır. Dağıtımdan sonra üretimde bir kez çalıştırılması **zorunlu**:

```
DATABASE_URL="file:/var/www/gbt/data/prod.db" npx tsx scripts/deploy-migrate.ts
```

Aşama 1 bu adım atılmadan etkili olmaz — eski indeks yerinde kaldığı sürece 500 sürer.

Ayrıca `.env`'de şunlar ayarlı olmalı:

- `SMTP_FROM=info@gozdemburakturizm.com` — iptal maillerinin göndereni
- `IYZICO_API_KEY`, `IYZICO_SECRET_KEY` — elden kart satışı için (yoksa kart seçeneği kapalı görünür)

---

## Kapsam dışı

- Taksitli ödeme (`enabledInstallments: [1]` olarak kalıyor)
- Kısmi iade
- İptalde SMS (yalnız e-posta istendi)
- Ciro raporunun dışa aktarımı (Excel/PDF)
- Koltuk etiketlerinin tur bazında (araçtan bağımsız) düzenlenmesi
