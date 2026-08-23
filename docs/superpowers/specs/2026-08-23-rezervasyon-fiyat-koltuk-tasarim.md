# Tasarım: Rezervasyon, Fiyatlandırma, Koltuk ve Panel İyileştirmeleri

**Tarih:** 2026-08-23
**Durum:** Onaylandı (kullanıcı onayı alındı)

Bu doküman, Gözdem Burak Turizm (gbt-project) uygulamasına eklenecek 6 bağımsız
özelliği ve bunların dayandığı ortak veri modeli / fiyatlandırma değişikliklerini
tanımlar. Her özellik ayrı ayrı planlanıp geliştirilebilir (bağımsız iş kalemleri).

---

## Ortak Temel (F1–F3 tarafından kullanılır)

### Prisma şema değişiklikleri

Yerelde SQLite (`prisma db push`) + client yeniden üretimi (`npx prisma generate`,
çıktı: `lib/generated/prisma`). Canlıda PostgreSQL.

- **`Passenger`**
  - `+ birthDate DateTime?` — yolcunun doğum tarihi (opsiyonel)
  - `+ nationality String?` — `TC` | `FOREIGN`
  - `+ country String?` — ülke adı (TC ise `"Türkiye"`)
- **`Booking`**
  - `+ accommodationType String?` — `SINGLE` | `MULTI` | null (konaklamalı olmayan turda null)
- **`Tour`**
  - `+ singleSupplement Int @default(2000)` — tek kişilik konaklama farkı (tur bazında)
  - `+ doorAfterRow Int?` — orta kapı bu sıradan sonra çizilir (null = kapı yok)
  - `+ backRowFull Boolean @default(false)` — son sırada koridorda ekstra koltuk var mı
- **`TourPlace.type`** — mevcut `DURAK` | `OTEL` değerlerine `BINIS` eklenir (String,
  ayrı migration gerekmez).

### Ortak saf fiyatlandırma yardımcısı

`lib/shared.ts` içine **saf** (DB'ye bağımlı olmayan) bir fonksiyon:

```ts
priceBooking(input: {
  unitPrice: number;
  departureDate: string; // yaş referansı
  passengers: { birthDate?: string }[];
  accommodationType?: "SINGLE" | "MULTI" | null;
  singleSupplement: number;
}): {
  total: number;
  perPassenger: { fare: number; isChild: boolean }[];
  childCount: number;
  adultCount: number;
  supplement: number;
}
```

- Kural: yolcu, doğum tarihi verilmişse ve **tur kalkış tarihinde** yaşı `< 7` ise
  **indirimli çocuktur**. Diğer herkes tam ücretli ("yetişkin") sayılır.
- Rezervasyondaki **tam ücretli yetişkin sayısı ≥ 2** ise, her indirimli çocuk
  birim fiyatın **%50'sini** öder; aksi halde çocuklar tam ücret öder.
- `accommodationType === "SINGLE"` ise toplama bir kez **+`singleSupplement`** eklenir.
- Çocuk ücreti yuvarlama: `Math.round(unitPrice * 0.5)`.

Bu fonksiyon hem istemcide (canlı özet/tahmin) hem de sunucuda
(`lib/booking.ts` içinde **yetkili/otoriter** hesap) kullanılır. İstemciden gelen
tutarlar asla güvenilir kabul edilmez; sunucu birim fiyatı ve tutarı yeniden hesaplar.

---

## F1 — Doğum tarihi + 7 yaş altı %50 çocuk indirimi

**Amaç:** 7 yaşından küçük çocuklara otomatik %50 indirim; ancak rezervasyonda en az
2 tam ücretli yetişkin olmalı.

**Değişiklikler:**
- `CheckoutForm` — her yolcuya opsiyonel **Doğum Tarihi** (`date`) alanı.
- `checkout-actions.ts` — `p_${i}_birth` alanlarını toplayıp `PassengerInput`'a ekler.
- `lib/booking.ts` `createPendingBooking` — tutarı `priceBooking` ile yeniden hesaplar;
  KOLTUK ve KONTENJAN yollarının ikisinde de `unitPrice * count` yerine bu kullanılır.
  Yaş referansı `tour.departureDate`.
- Özet paneli, indirim uygulandığında çocuk/yetişkin kırılımını gösterir.
- `AdminSaleForm` (elden satış) — tutarlılık ve Excel verisi için doğum tarihi alanı
  eklenir (opsiyonel; `totalOverride` yine mevcut).

**Kabul kriterleri:**
- 2 yetişkin + 1 çocuk (5 yaş) → çocuk %50, toplam doğru.
- 1 yetişkin + 1 çocuk (5 yaş) → çocuk tam ücret (indirim yok).
- Doğum tarihi girilmeyen yolcu tam ücret sayılır ve yetişkin olarak kabul edilir.

---

## F2 — Tek kişilik konaklama farkı (+2000₺)

**Amaç:** Konaklamalı turlarda ödeme adımında tek/çoklu konaklama seçimi; tek kişilik
seçilirse +2000₺ (tur bazında ayarlanabilir).

**Değişiklikler:**
- "Konaklamalı tur" tanımı: turun en az bir `OTEL` tipi yeri varsa.
- `TourForm` — konaklamalı turlarda **Tek Kişilik Konaklama Farkı (₺)** alanı
  (varsayılan 2000). `Tour.singleSupplement` olarak kaydedilir.
- `CheckoutForm` — yalnızca konaklamalı turlarda radio: **Tek kişilik / Birden fazla
  kişi**. `MULTI` varsayılan. Seçim `accommodationType` olarak gönderilir.
- `priceBooking` `SINGLE` seçildiğinde toplama bir kez `singleSupplement` ekler.
- Rezervasyon detayında (admin) ve Excel'de konaklama tipi görünür.

**Kabul kriterleri:**
- Konaklamalı tur + "Tek kişilik" → toplam = birim + 2000.
- Konaklamalı tur + "Birden fazla" → fark yok.
- Konaklamasız tur → seçim hiç görünmez, fark uygulanmaz.

---

## F3 — Uyruk + ülke (Excel'e ülke sütunu)

**Amaç:** Rezervasyonda "T.C. Vatandaşı / Yabancı Uyruklu" seçimi; yabancı seçilince
ülke seçimi. Excel'de ülke, ad, soyad, TC, cinsiyet mutlaka olmalı.

**Değişiklikler:**
- Yeni `lib/countries.ts` — Türkçe isimli ülke listesi.
- `CheckoutForm` — her yolcuda **Uyruk** toggle (`TC` / `FOREIGN`):
  - `TC` → kimlik alanı "TC Kimlik No", TC algoritmasıyla doğrulanır, `country = "Türkiye"`.
  - `FOREIGN` → **Ülke** dropdown + kimlik alanı "Pasaport No" (pasaport doğrulaması).
- Kimlik doğrulaması artık **tur kategorisine değil, yolcu uyruğuna** göre:
  `isValidId(id, nationality === "FOREIGN")`.
- `checkout-actions.ts` + `lib/booking.ts` — `nationality` ve `country` alanlarını
  toplar, kaydeder, sunucuda yeniden doğrular.
- Excel route (`turlar/[id]/excel/route.ts`) — **Ülke** sütunu eklenir; ayrıca
  **Doğum Tarihi** ve **Tip** (Yetişkin/Çocuk) sütunları eklenir.

**Kabul kriterleri:**
- TC seçili → geçersiz TC reddedilir, ülke otomatik "Türkiye".
- Yabancı seçili → ülke zorunlu, pasaport kabul edilir.
- Excel çıktısında Ülke sütunu dolu gelir.

---

## F4 — Otobüs orta kapı + arka sıra koridor koltuğu

**Amaç:** Koltuk düzeninde orta kapı konumu seçilebilsin (örn. 14 sıra ön, kapı, 8 sıra
arka) ve en son sırada koridorda da koltuk olabilsin.

**Değişiklikler:**
- `TourForm` (KOLTUK) — **Orta Kapı Sırası** (number, opsiyonel) ve **Son sırada
  koridor koltuğu** (checkbox) alanları. `Tour.doorAfterRow`, `Tour.backRowFull`.
- `lib/shared.ts`:
  - `buildSeatGrid` — `backRowFull` ise son sırada koridor konumuna gerçek koltuk
    `{lastRow}M` yerleştirir.
  - `seatNeighbor` — `M` kolonu için `null` döner (yan komşu yok).
  - `seatCodes` — `backRowFull` ise `{rows}M` kodunu da üretir.
- `lib/admin-actions.ts` `generateSeats` — `backRowFull` desteği; düzen değişikliği
  kontrolüne (`vehicleType`/`seatRows` yanına) `backRowFull` eklenir. Koltuklar yalnızca
  satış yoksa yeniden üretilir.
- `SeatMap` ve `AdminSeatBlocker` — `doorAfterRow`'dan sonra "🚪 Kapı" ayıracı çizer;
  `M` koltuğu koridor konumunda normal seçilebilir buton olarak render edilir.

**Kabul kriterleri:**
- 22 sıra + orta kapı 14 → 14. sıradan sonra kapı ayıracı görünür.
- `backRowFull` açık → son sırada 5 koltuk (koridorda `M`) satılabilir.
- Orta kapı değişimi satış sonrası güvenli (koltukları etkilemez).

---

## F5 — Biniş noktaları, rota/konaklamadan ayrı

**Amaç:** "Nereden bineceksiniz" biniş noktalarını, rota/konaklama alanlarından ayrı
yönetmek. Admin panelde biniş noktaları ayrı belirtilmeli.

**Değişiklikler:**
- Yeni yer tipi **`BINIS`** — ad + harita + **fiyat** taşır. `DURAK`/`OTEL` yalnızca
  rota/harita amaçlı olur (DURAK'tan fiyat alanı kalkar).
- Admin — ayrı **"Biniş Noktaları"** editörü (fiyatlı); "Rota & Konaklama" editörü yalnız
  `DURAK` + `OTEL`. `savePlaces` üç tipi de işler (fiyat yalnız `BINIS`).
- **Veri göçü:** mevcut tüm `DURAK` kayıtları `BINIS`'e çevrilir (fiyat + harita korunur),
  böylece mevcut "Nereden bineceksiniz?" seçimleri çalışmaya devam eder.
- Biniş aramaları `DURAK` → `BINIS` olarak güncellenir:
  `BoardingSelector`, `SeatMap`, `lib/booking.ts` (`boardingPlaceId` sorgusu),
  `app/rezervasyon/page.tsx` (`boardingStop`).
- `TourRouteMap` — biniş noktalarını (BINIS) harita üzerinde işaretçi olarak da gösterebilir.

**Kabul kriterleri:**
- Admin'de biniş noktaları ile rota durakları ayrı bölümlerde yönetilir.
- Müşteri "Nereden bineceksiniz?" listesinde yalnızca `BINIS` yerlerini görür.
- Göç sonrası mevcut turların biniş seçimi ve fiyatı bozulmaz.

---

## F6 — Yönetim paneli dönem filtresi

**Amaç:** Ana ekranda rezervasyon/ciro için 1 ay / 1 yıl / 3 yıl / tümü dönem seçimi.

**Değişiklikler:**
- `app/admin/(dash)/page.tsx` — `?donem=1ay|1yil|3yil|tumu` okur (varsayılan `1ay`).
  Seçime göre `createdAt` eşiği hesaplanır; **Rezervasyon** sayısı ve **Ciro**
  (ODENDI toplam) bu pencere için yeniden hesaplanır. Toplam Tur / Aktif Afiş all-time kalır.
- Dönem seçici butonları param ile link verir.

**Kabul kriterleri:**
- Dönem değiştirince ciro ve rezervasyon sayısı ilgili aralığa göre güncellenir.
- "Tümü" seçildiğinde tüm zamanların toplamı görünür.

---

## Kapsam dışı / varsayılan kararlar

- Yaş sınırı referansı: **tur kalkış tarihi**.
- Tek kişilik fark tutarı: **tur bazında, varsayılan 2000₺** (sabit kodlanmaz).
- Mevcut `DURAK` yerleri `BINIS`'e göç ettirilir (mevcut rezervasyonlar için en güvenli yol).
- Git işlemleri kullanıcı tarafından yapılır; bu doküman commit edilmez.
