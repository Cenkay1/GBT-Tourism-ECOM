# Sefer (Rota Yolculuğu) Özelliği — Tasarım

**Tarih:** 2026-08-05
**Durum:** Onaylandı (uygulama planına hazır)

## Amaç

Siteye, mevcut **turlardan ayrı** bir **sefer** kavramı eklemek: sıralı duraklı,
nereden→nereye segmentli, ana sayfadan iki alanlı (nereden/nereye) aramayla
listelenen koltuklu yolculuklar. Turlar eskisi gibi kalır; ayrıca koltuk seçim
akışı hem turlar hem seferler için adımlı (wizard) hale getirilir.

**Örnek:** Zonguldak → Düzce → İstanbul seferi. Yolcu "nereden"e Düzce, "nereye"ye
İstanbul girer; altta eşleşen seferler yatay kartlar olarak listelenir. Fiyat,
(biniş, iniş) çiftine göre bir **segment matrisinden** belirlenir.

## Kararlar (onaylı)

- **Fiyatlandırma:** Nereden→Nereye **matrisi**. Her ileri yönlü (biniş, iniş)
  çifti için ayrı fiyat.
- **Model:** Ayrı varlık değil; mevcut `Tour` modeline `type` alanı eklenir.
- **Ana sayfa:** Mevcut "tur adı/destinasyon" arama çubuğu korunur; hemen altına
  nereden/nereye seçici entegre edilir. Sefer sonuçları aynı sayfada altında,
  başlangıçta tüm seferler, seçimle canlı filtrelenir.
- **Satın Al:** Aramada seçilen nereden/nereye taşınır; sefer açılınca 1. adım
  atlanıp direkt koltuğa geçilir (geri dönülebilir).
- **Seferler her zaman KOLTUK tipidir** (kontenjanlı sefer yok).
- **Turlarda da** akış 2 adımlıdır (önce biniş, sonra koltuk).

## 1. Veri Modeli

### `prisma/schema.prisma`

`Tour` modeline eklenecek:

```prisma
type          String @default("TUR")  // TUR | SEFER
segmentPrices String @default("[]")   // JSON: [{ from: number, to: number, price: number }]
```

- `segmentPrices` içindeki `from`/`to`, o turun **sıralı DURAK** yerlerinin
  (0-tabanlı) indeksleridir. `from < to` (rota yönü). Eksik segment → tur `price`.
- JSON string alanı, mevcut desenle tutarlı (`images`, `highlights`, `features`).

`Booking` modeline eklenecek:

```prisma
dropoffName String?   // iniş noktası (nereye); boardingName zaten var (nereden)
```

### `lib/shared.ts`

- `Tour` arayüzüne: `type: "TUR" | "SEFER"`, `segmentPrices: SegmentPrice[]`.
- Yeni tip: `interface SegmentPrice { from: number; to: number; price: number }`.
- Yeni yardımcı: `segmentPrice(tour, fromIdx, toIdx): number` — matristen fiyat
  bulur, yoksa `tour.price` döner.
- Yeni yardımcı: `orderedStops(places): TourPlace[]` — `type==="DURAK"`,
  `sortOrder`'a göre sıralı.

## 2. Admin Panel

### `components/admin/TourForm.tsx`

- **Genel Bilgiler** kartının en üstüne **Tip seçici** chip'i: `Tur` | `Sefer`
  (`type` gizli input olarak gönderilir). Değeri `useState` ile tutulur.
- `type === "SEFER"` iken:
  - Rezervasyon tipi otomatik `KOLTUK`'a sabitlenir (Kontenjan chip'i gizlenir).
  - Yeni **Segment Fiyat Matrisi** kartı görünür. Sıralı DURAK listesini
    `PlacesEditor` state'inden okuyup her ileri yönlü çift için bir fiyat kutusu
    üretir (örn. 3 durak → 3 satır: Zonguldak→Düzce, Zonguldak→İstanbul,
    Düzce→İstanbul). Değerler `segmentPrices` gizli inputuna JSON olarak yazılır.
- `type === "TUR"` iken form eskisi gibi; matris kartı gizli.
- **Not:** Segment matrisi duraklara canlı bağlı olacağı için `PlacesEditor`
  durak listesi `TourForm`'da (veya paylaşılan state'te) tutulmalı ki matris
  editörü aynı listeyi görebilsin. Bu, `PlacesEditor`'ın controlled/lifted-state
  yapılmasını gerektirir (mevcut uncontrolled yapıdan hedeflenmiş iyileştirme).

### `lib/admin-actions.ts`

- Tur oluştur/güncelle action'larında `type` ve `segmentPrices` okunup kaydedilir.
- Doğrulama: `SEFER` ise `bookingType = "KOLTUK"` zorlanır; `segmentPrices`
  JSON parse edilip `from < to` ve indekslerin durak sayısı sınırında olduğu
  kontrol edilir.

### `app/admin/(dash)/turlar/page.tsx`

- Liste satırında **tip rozeti** (`Sefer` / `Tur`).

## 3. Ana Sayfa

### `app/page.tsx` (server component)

- Yayındaki içerikler `type`'a göre ayrılır: `seferler` ve `turlar`.
- Turlar bölümleri (Yurt İçi / Yurt Dışı) yalnız `type === "TUR"` içerir.
- Hero'daki arama kartı yeni `SeferSearch` client bileşenini içerir; ona tüm
  yayınlı seferler ve durak birleşimi prop olarak geçilir.

### Yeni `components/SeferSearch.tsx` (client)

- **Satır 1:** Mevcut tur adı/destinasyon araması (form `action="/turlar"`),
  görsel olarak aynı kart içinde korunur.
- **Satır 2:** **Nereden** ve **Nereye** dropdown'ları. Nereden seçenekleri =
  tüm seferlerdeki durakların birleşimi (isim bazlı, tekilleştirilmiş). Nereye
  seçenekleri = seçilen nereden'den *sonra* gelen duraklar (en az bir seferde
  rota yönünde sonra gelenler).
- **Altında yatay sefer kartları:** başlangıçta tüm seferler; nereden/nereye
  seçilince, o (biniş, iniş) segmentini rota yönünde içeren seferler filtrelenir.
  Filtreleme client-side, sayfa yenilenmeden.

### Yeni `components/SeferCard.tsx`

- Yatay düzen: solda **4:5 Instagram-post** görseli (kapak), sağda:
  rota (nereden→nereye veya rota özeti), tarih, kişi başı fiyat (segment seçiliyse
  o fiyat), **"Satın Al"** butonu.
- **Boş koltuk rozeti:** kalan boş koltuk ≤ 5 ve > 0 ise `Son N koltuk`. >5 ise
  gösterilmez. (Kalan = toplam koltuk − satılan; `sold`/`soldSeats` üzerinden.)
- "Satın Al", `BookingLauncher`'ı seçili nereden/nereye ile açar (aşağı bkz.).

## 4. Satın Alma / Koltuk Akışı

### `components/BookingLauncher.tsx`

- Buton etiketi: **"Koltuk Seç / Satın Al"** (hem tur hem sefer için).
- Modal, adımlı bir sihirbaz barındırır. `initialFrom`/`initialTo` (indeks) prop'u
  eklenir; ana sayfadan seçimle gelindiğinde iletilir.

### `components/SeatMap.tsx` (adımlı hale gelir)

- **Adım 1 — Güzergâh:**
  - **SEFER:** Nereden + Nereye seçimi (sıralı duraklardan; `to > from`). Seçime
    göre segment fiyatı anlık gösterilir. **İleri** ile Adım 2.
  - **TUR:** Yalnız Nereden (biniş) seçimi — mevcut rotadaki duraklardan; iniş yok.
    **İleri** ile Adım 2. Durağı olmayan turda Adım 1 atlanır.
  - `initialFrom`/`initialTo` doluysa (sefer, ana sayfadan) Adım 1 önceden dolu
    gelip **doğrudan Adım 2** açılır; kullanıcı "Geri" ile Adım 1'e dönebilir.
- **Adım 2 — Koltuk:** mevcut koltuk şeması + cinsiyet seçimi + özet. Kişi başı
  fiyat, sefer için segment fiyatından, tur için biniş durağı fiyatından gelir.
  "Devam Et" → checkout'a `tur`, `koltuklar`, `durak` (biniş), sefer ise ek olarak
  `inis` (iniş) parametreleriyle gider.
- Böylece biniş/iniş seçimi ile koltuk seçimi **artık ayrı adımlardadır**.
- `BoardingSelector` Adım 1 içinde yeniden kullanılır (tur: yalnız biniş; sefer:
  biniş + iniş için iki örnek veya genişletilmiş bir varyant).

### `components/CapacityBooking.tsx`

- Seferler KOLTUK olduğundan seferi etkilemez; turlarda KONTENJAN akışı aynen
  kalır (biniş adımı ekli, iniş yok). Gerekirse ufak uyum.

## 5. Checkout

### `app/rezervasyon/page.tsx` + `components/CheckoutForm.tsx`

- `searchParams`'a `inis` (iniş indeks/id) eklenir; sefer için okunur.
- Özet: nereden → nereye ve segment fiyatı gösterilir (tur: yalnız biniş).
- Gizli alan olarak `inis`/dropoff form gönderimine eklenir.

### `lib/checkout-actions.ts` (ve ilgili booking oluşturma)

- `dropoffName` kaydedilir. Tutar hesabı: sefer → `segmentPrice(...)`,
  tur → mevcut biniş durağı fiyatı. Sunucu tarafında yeniden hesaplanıp
  doğrulanır (istemciye güvenilmez).

### Admin rezervasyon görünümü

- `app/admin/(dash)/rezervasyonlar/[id]` ve liste: nereden → nereye gösterimi
  (`dropoffName` doluysa).

## Etkilenen Dosyalar (özet)

- `prisma/schema.prisma` — `Tour.type`, `Tour.segmentPrices`, `Booking.dropoffName`
- `lib/shared.ts` — tipler + `segmentPrice`, `orderedStops` yardımcıları
- `lib/tours.ts` — sorgu/serileştirmeye `type`, `segmentPrices` eklenmesi
- `lib/admin-actions.ts` — create/update: `type`, `segmentPrices`, doğrulama
- `lib/checkout-actions.ts` — `dropoffName`, segment fiyat hesabı
- `components/admin/TourForm.tsx` — tip seçici + segment matris kartı
- `components/admin/PlacesEditor.tsx` — lifted/controlled state (matris için)
- `app/admin/(dash)/turlar/page.tsx` — tip rozeti
- `app/page.tsx` — tur/sefer ayrımı, `SeferSearch` entegrasyonu
- `components/SeferSearch.tsx` (yeni) — iki alanlı arama + canlı filtre
- `components/SeferCard.tsx` (yeni) — yatay kart + koltuk rozeti
- `components/BookingLauncher.tsx` — etiket + initialFrom/To + adımlı modal
- `components/SeatMap.tsx` — 2 adımlı sihirbaz
- `app/rezervasyon/page.tsx`, `components/CheckoutForm.tsx` — `inis`/dropoff
- `app/admin/(dash)/rezervasyonlar/*` — nereden→nereye gösterimi

## Kapsam Dışı (YAGNI)

- Tarih/kişi sayısı bazlı arama filtreleri.
- Çok bacaklı (2+ segment) tek biletle karma güzergâh; yalnız tek biniş→iniş.
- Sefer için ayrı SEO/paylaşım sayfası (mevcut `/turlar/[slug]` yeniden kullanılır).

## Notlar

- Yerelde SQLite; enum yok, bu yüzden `type` String. Canlıda PostgreSQL.
- Migration/`prisma db push` gerekecek (yeni alanlar).
- Git işlemleri kullanıcı tarafından yürütülür (commit/push yapılmaz).
