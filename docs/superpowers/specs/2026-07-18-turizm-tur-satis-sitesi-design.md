# Turizm Tur & Koltuk Satış Sitesi — Tasarım Dokümanı

**Tarih:** 2026-07-18
**Proje:** Şahıs turizm şirketi için tur/koltuk satış web sitesi + admin panel
**Referans:** obilet.com tarzı akış

## Amaç

Yurt içi ve yurt dışı turlar düzenleyen bir turizm şirketi için, genel kullanıcıya hitap eden;
turların gezilip online ödemeyle satın alınabildiği (koltuk veya kontenjan bazlı) bir web sitesi
ve turları/afişleri/satışları yönetmek için basit bir admin panel.

## Netleşen Kararlar

| Konu | Karar |
|------|-------|
| Yığın | Next.js (App Router, TypeScript) + Prisma + PostgreSQL + Tailwind CSS |
| Rezervasyon modeli | Tur bazında: **KOLTUK** (koltuk şemalı) veya **KONTENJAN** (kişi sayısı) |
| Tur & tarih | Her tur **tek tarihli** bir etkinliktir (tekrar için yeni kayıt açılır) |
| Ödeme | Online — **iyzico Checkout Form** (redirect/hosted), sandbox ile geliştirme |
| Müşteri | **Üyeliksiz misafir** satın alma; bilet e-posta ile gönderilir |
| Admin kapsamı | Tur yönetimi, Afiş yönetimi, Rezervasyon & satış yönetimi |
| Dil | Türkçe (tek dil, MVP) |
| Kapsam dışı (şimdilik) | Blog/içerik CMS, müşteri hesapları, çoklu dil, çok tarihli sefer şablonları |

## Mimari

Tek Next.js projesi, üç mantıksal katman:

- **Genel Site (`/`)** — turları gezme, arama/filtre, koltuk/kontenjan seçimi, ödeme, onay
- **Admin Panel (`/admin`)** — şifre korumalı; tur, afiş, rezervasyon yönetimi
- **API / Server Actions** — ödeme başlatma, iyzico callback doğrulama, koltuk kilitleme, e-posta

Bağımlılıklar:
- **PostgreSQL** (Prisma ORM) — birincil veritabanı
- **Görsel depolama** — Cloudflare R2 / S3 uyumlu bucket (tur/afiş görselleri)
- **iyzico** — ödeme sağlayıcı (canlı için üye işyeri/sanal POS onayı gerekir)
- **E-posta** — Resend veya SMTP (onay/bilet gönderimi)

### Ana tasarım kararları

1. **Ödeme yöntemi — iyzico Checkout Form (hosted/redirect).** Kart bilgisi hiçbir zaman kendi
   sunucumuza değmez; PCI kapsamı minimize edilir. Alternatif (kendi kart formu + 3DS API) daha
   fazla iş ve sorumluluk getirdiği için tercih edilmedi.
2. **Koltuk çakışması — geçici kilit (hold).** Müşteri ödemeye geçtiğinde koltuklar 15 dakika
   `KİLİTLİ` olur; ödeme başarılıysa `SATILDI`, süre dolarsa otomatik `BOŞ`'a döner. Aynı koltuğun
   iki kişiye satılması bu şekilde engellenir. Kontenjan turlarında kontenjan aynı mantıkla düşülür.

## Veri Modeli (Prisma)

```
Tour (Tur)
  id, title, slug, description, category (YURT_İÇİ | YURT_DIŞI),
  destination, departureDate, returnDate?, departureLocation,
  price, currency, bookingType (KOLTUK | KONTENJAN),
  capacity (KONTENJAN turları için), coverImage, images[],
  status (TASLAK | YAYINDA), createdAt

Seat (Koltuk)  — sadece KOLTUK tipi turlar için
  id, tourId, code ("12A"), status (BOŞ | KİLİTLİ | SATILDI), gender?

Booking (Rezervasyon/Satış)
  id, tourId, status (BEKLİYOR | ÖDENDİ | İPTAL | SÜRE_DOLDU),
  totalAmount, contactName, contactPhone, contactEmail,
  quantity (KONTENJAN turları), paymentRef, holdExpiresAt, createdAt

Passenger (Yolcu)
  id, bookingId, firstName, lastName, tcOrPassport?, seatId?, gender?

Banner (Afiş)
  id, imageUrl, title?, linkUrl?, sortOrder, active, createdAt

AdminUser
  id, email, passwordHash
```

Koltuklu bir tur eklenirken admin bir **koltuk düzeni şablonu** (örn. 2+1 veya 2+2, N sıra) seçer;
koltuk kayıtları otomatik üretilir.

## Genel Site Akışı

- **Ana sayfa:** afiş carousel (admin'den) + arama/filtre (destinasyon, tarih, kategori) + yaklaşan turlar grid'i
- **Tur listesi:** filtreler (kategori, tarih, fiyat aralığı)
- **Tur detay:** galeri, açıklama, güzergah, tarih, fiyat → "Satın Al"
  - **KOLTUK:** koltuk şeması (boş/kilitli/satılı renk kodlu) → koltuk seç → yolcu bilgileri → ödeme
  - **KONTENJAN:** kişi sayısı seç → yolcu/iletişim bilgileri → ödeme
- **Ödeme:** iletişim + yolcu bilgileri → iyzico Checkout → onay sayfası + e-posta ile bilet

## Admin Panel (`/admin`, şifre korumalı)

- **Panel özeti:** yaklaşan turlar, satış/ciro özeti
- **Tur yönetimi:** ekle/düzenle/sil, görsel yükleme, koltuk düzeni seçimi, taslak/yayında durumu
- **Afiş yönetimi:** görsel yükle, link, sıralama, aktif/pasif
- **Rezervasyon & satış:** listeleme + filtre, müşteri/yolcu detayı, ödeme durumu, koltuk doluluk,
  iptal, CSV dışa aktarma

## Ödeme & Koltuk Kilitleme Akışı

1. Müşteri koltuk/kontenjan seçer → `Booking` **BEKLİYOR** oluşturulur, koltuklar 15 dk **KİLİTLİ**
2. iyzico Checkout başlatılır → müşteri öder
3. iyzico callback → sunucuda **doğrulama** → başarılıysa `Booking` **ÖDENDİ**, koltuklar **SATILDI**,
   onay e-postası gönderilir
4. Ödeme başarısız / süre dolarsa → koltuklar otomatik **BOŞ**'a döner (lazy cleanup + arka plan kontrolü)

## Hata Yönetimi

- iyzico callback doğrulanamazsa booking `BEKLİYOR` kalır, koltuklar süre sonunda serbest kalır
- Eşzamanlı koltuk seçiminde DB seviyesinde atomik güncelleme (koşullu update) ile çift satış engellenir
- Görsel yükleme hatası, ödeme başlatma hatası kullanıcıya anlaşılır Türkçe mesajla gösterilir
- Admin işlemleri sunucu tarafı doğrulama (Zod) ile korunur

## Test Stratejisi

- **Vitest (birim):** fiyat hesabı, koltuk kilitleme & süre dolumu, form doğrulama, iyzico imza doğrulama
- **Playwright (E2E):** gez → koltuk/kontenjan seç → sandbox ödeme → onay sayfası; admin CRUD akışları
- Ayrı test veritabanı; iyzico sandbox anahtarları

## Deploy

- **Vercel** (uygulama) + **Neon/Supabase** (managed PostgreSQL)
- Görsel depolama: **Cloudflare R2 / S3**
- Ortam değişkenleri: iyzico anahtarları, DATABASE_URL, e-posta anahtarı, admin kimlik bilgisi, R2/S3 anahtarları

## Uygulama Sırası (öngörülen fazlar)

1. Proje iskeleti (Next.js + Prisma + Tailwind), veri modeli, seed
2. Admin auth + tur yönetimi (CRUD + görsel yükleme + koltuk düzeni üretimi)
3. Afiş yönetimi
4. Genel site: ana sayfa, tur listesi, tur detay
5. Koltuk/kontenjan seçimi + hold mantığı
6. iyzico ödeme entegrasyonu + callback + e-posta
7. Admin rezervasyon/satış ekranı + CSV
8. Test (Vitest + Playwright) + deploy hazırlığı
