# Tasarım: Elden/Nakit Satış Kaydı + Çoklu Galeri Görselleri

Tarih: 2026-08-01
Proje: Gözdem Burak Turizm (gbt-project)

## Amaç

İki bağımsız admin özelliği:

1. **Elden/Nakit Satış Kaydı** — Admin, yüz yüze (elden) nakit tahsil ettiği
   satışları panelden kayıt altına alabilsin; yolcular ve (koltuklu turlarda)
   koltuklar dahil.
2. **Çoklu Galeri Görselleri** — Tur oluştururken galeri görselleri düz URL
   textarea'sı yerine çoklu yükleme ile eklensin ve tur detay sayfasında afiş
   boyutunda, yatay kaydırmalı bir şeritte gösterilsin.

---

## Özellik 1 — Elden/Nakit Satış Kaydı

### Kullanıcı akışı

- **Giriş noktası:** `Rezervasyonlar` sayfasına (`app/admin/(dash)/rezervasyonlar/page.tsx`)
  başlığın yanına **"+ Elden Satış Ekle"** butonu → `/admin/rezervasyonlar/yeni`.
- **Adımlar (`/admin/rezervasyonlar/yeni`):**
  1. **Tur seç:** Yayındaki (`status = "YAYINDA"`) turların dropdown'ı.
  2. Tur seçilince tür bazlı alan:
     - **KOLTUK turu:** Admin koltuk haritası. Dolu (`SATILDI`) koltuklar
       seçilemez/işaretli; boş koltuklardan seçim yapılır. Her seçilen koltuğa
       cinsiyet atanır. Mevcut yan-yana cinsiyet kuralı uygulanır.
     - **KONTENJAN turu:** Kişi sayısı girişi; kalan kontenjan bilgisi gösterilir.
  3. **İletişim bilgileri:** ad/soyad, telefon (zorunlu), e-posta (opsiyonel).
  4. **Yolcular:** Her yolcu için ad/soyad/TC; koltuklu turda koltuk + cinsiyet.
     Yolcu sayısı, seçilen koltuk sayısı / kişi sayısı ile eşleşir.
  5. **Toplam tutar:** `tur.price × kişi` otomatik hesaplanır; alan elle
     düzeltilebilir (indirim/pazarlık için).
  6. **Kaydet.**

### Kayıt sonucu

- Booking `status = "ODENDI"`, `paymentMethod = "NAKIT"`.
- Koltuklu turda seçilen koltuklar `SATILDI` olur (çift satış engellenir).
- Elden satışta **otomatik SMS/e-posta bildirimi gönderilmez** (admin işi yüz
  yüze tamamlıyor; online akıştaki `sendBookingConfirmation` çağrılmaz).

### Veri modeli değişikliği

`prisma/schema.prisma` → `Booking` modeline:

```prisma
paymentMethod String @default("ONLINE") // ONLINE | NAKIT
```

- Yeni migration eklenir.
- Mevcut ve online satışlar varsayılan `"ONLINE"` değerini alır.

### Sunucu tarafı

`lib/booking.ts` içine yeni fonksiyon `createManualPaidBooking(input)`:

- `createPendingBooking`'teki doğrulama + koltuk kilitleme/kontenjan/cinsiyet
  transaction mantığını yeniden kullanır (kod tekrarını azaltmak için ortak bir
  yardımcıya çıkarılabilir ya da `createPendingBooking`'e opsiyonel bir mod
  parametresi eklenebilir — implementasyonda en temiz olan seçilir).
- Farkları: booking doğrudan `status = "ODENDI"`, `paymentMethod = "NAKIT"`,
  `holdExpiresAt = null`, seçilen koltuklar tek transaction'da `SATILDI`;
  onay bildirimi tetiklenmez.
- E-posta opsiyonel olduğundan doğrulama buna göre gevşetilir (telefon zorunlu
  kalır; yolcu TC doğrulaması online akışla aynı kurallarla korunur).

Yeni bir server action (`lib/admin-actions.ts` içinde, örn. `createManualBooking(fd)`)
formu parse edip `createManualPaidBooking`'i çağırır; başarıda
`/admin/rezervasyonlar`'a redirect eder ve ilgili path'leri `revalidatePath` ile
tazeler.

### Liste görünümü

`app/admin/(dash)/rezervasyonlar/page.tsx` tablosuna **"Ödeme"** rozeti:

- `NAKIT` → "Nakit" (amber ton).
- `ONLINE` → "Online" (mavi ton).

Rezervasyon detay sayfasında da ödeme yöntemi gösterilebilir (opsiyonel, düşük
öncelik).

---

## Özellik 2 — Çoklu Galeri Görselleri

### Admin — `GalleryUpload` bileşeni

Yeni bileşen `components/admin/GalleryUpload.tsx`:

- **Çoklu yükleme:** Bilgisayardan bir veya birden fazla görsel seçilir; her biri
  mevcut `POST /api/admin/upload` ucuyla yüklenir.
- **URL yapıştırma:** Elle görsel bağlantısı da eklenebilir.
- **Önizleme:** Her görsel bir kart olarak listelenir.
- **Sıralama:** Sürükle-bırak ile sıralanır (afiş boyutunda görünürken sıralama
  bu diziye göre).
- **Kaldırma:** Her görsel tek tek kaldırılabilir.
- **Değer aktarımı:** Tüm görsel URL'leri tek bir gizli input alanına
  (`name="images"`) yazılır. Mevcut `tourDataFromForm` `images` alanını satır satır
  parse ediyor; bileşen değerleri `\n` ile ayrılmış olarak yazarak bu sözleşmeyi
  bozmadan uyumlu kalır.

`components/admin/TourForm.tsx` içindeki "Galeri Görselleri (her satıra bir URL)"
textarea'sı bu bileşenle değiştirilir. `initial.images` (dizi) bileşenin
başlangıç değeri olur.

### Tur detay sayfası — yatay kaydırmalı galeri

`app/turlar/[slug]/page.tsx` içindeki mevcut galeri (1 büyük + 2 küçük grid)
kaldırılır; yerine afiş desenindeki yatay kaydırmalı şerit gelir:

- Kap: `flex snap-x snap-mandatory gap-4 overflow-x-auto` (BannerCarousel deseni).
- Her görsel: `aspect-[4/5]`, `object-cover`, yuvarlatılmış köşe; responsive
  genişlik `w-[80%] sm:w-[55%] md:w-[42%] lg:w-[32%]` → masaüstünde ~3, mobilde
  ~1–2 görünür.
- Görsel sayısından bağımsız (2 de olsa 5 de olsa) hepsi aynı boyutta akar.
- Tek görsel varsa da şerit düzgün görünür (tek kart, taşma yok).

Not: Bu galeri statik render edilebilir (client JS zorunlu değil); ok butonları
istenirse eklenir ama MVP için native yatay kaydırma yeterli.

---

## Kapsam dışı (YAGNI)

- Elden satış için ayrı fatura/makbuz üretimi.
- Nakit dışı elden ödeme türleri (POS/havale ayrımı) — şimdilik yalnızca NAKIT.
- Galeri görsellerinde başlık/alt yazı (afişlerdeki gibi) — turlar için gereksiz.

## Etkilenen dosyalar (özet)

- `prisma/schema.prisma` + yeni migration (Booking.paymentMethod).
- `lib/booking.ts` (createManualPaidBooking).
- `lib/admin-actions.ts` (createManualBooking action).
- `app/admin/(dash)/rezervasyonlar/page.tsx` (buton + ödeme rozeti).
- `app/admin/(dash)/rezervasyonlar/yeni/page.tsx` (yeni sayfa).
- Admin koltuk seçici + yolcu formu bileşen(ler)i (yeni).
- `components/admin/GalleryUpload.tsx` (yeni).
- `components/admin/TourForm.tsx` (textarea → GalleryUpload).
- `app/turlar/[slug]/page.tsx` (galeri → yatay şerit).

## Notlar

- AGENTS.md uyarısı: Bu Next.js sürümünde API/konvansiyonlar farklı olabilir;
  kod yazmadan önce `node_modules/next/dist/docs/` içindeki ilgili rehber
  okunmalı (özellikle server actions, form ve route konvansiyonları).
