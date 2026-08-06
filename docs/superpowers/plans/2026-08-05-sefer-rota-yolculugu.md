# Sefer (Rota Yolculuğu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turlardan ayrı bir "sefer" (sıralı duraklı, nereden→nereye segment fiyatlı, koltuklu) kavramı eklemek; ana sayfaya nereden/nereye aramasıyla yatay sefer listesi getirmek; koltuk seçim akışını hem tur hem sefer için "önce güzergâh, sonra koltuk" adımlı hale getirmek.

**Architecture:** Mevcut `Tour` modeline `type` (TUR|SEFER) ve `segmentPrices` (JSON matris) alanları eklenir; `Booking`'e `dropoffName` eklenir. Koltuk/rezervasyon/durak altyapısı aynen kullanılır. Fiyat sunucuda `lib/booking.ts` içinde yeniden hesaplanır (istemciye güvenilmez). Ana sayfa `SeferSearch` (client) ile canlı filtreler; `SeatMap` iki adımlı sihirbaza dönüşür.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, Prisma 7 + better-sqlite3 (yerel SQLite; enum yok → String alanlar), Tailwind v4.

## Global Constraints

- **Bu Next.js sürümü alışıldık değil.** Herhangi bir Next API'sini kullanmadan önce `node_modules/next/dist/docs/` içindeki ilgili rehberi oku (AGENTS.md kuralı). Deprecation notlarına uy.
- **Test koşucusu YOK.** Doğrulama = `npx tsc --noEmit` (typecheck) + dev sunucuda smoke test (`curl -s -o /dev/null -w "%{http_code}"` ile 200 kontrolü, gerekirse tarayıcı). Yeni test framework'ü **ekleme** (kapsam dışı).
- **Git işlemleri kullanıcıya aittir.** Bu repoda branch/commit/push YAPMA. Her görev sonunda önerilen commit komutu bilgi amaçlıdır; kullanıcı çalıştırır.
- **Yerelde `next build` kırılabilir** (.venv broken symlink sorunu). Derleme doğrulaması için tam `build` yerine `npx tsc --noEmit` kullan; smoke testte `npm run dev` sunucusuna curl at.
- **SQLite enum desteklemez** → yeni durum/tip alanları `String`.
- **Fiyat her zaman sunucuda yeniden hesaplanır** (`lib/booking.ts` ve `app/rezervasyon/page.tsx`); istemciden gelen tutara güvenilmez.
- **Seferler her zaman `bookingType = "KOLTUK"`** (kontenjanlı sefer yok).
- Segment matris indeksleri **sıralı DURAK** (yalnız `type==="DURAK"`, `sortOrder` artan) listesindeki 0-tabanlı konumdur; `from < to`.

---

## File Structure

**Değişecek:**
- `prisma/schema.prisma` — `Tour.type`, `Tour.segmentPrices`, `Booking.dropoffName`
- `lib/shared.ts` — `TourKind`, `SegmentPrice`, `Tour.type/segmentPrices`, `orderedStops()`, `parseSegments()`, `segmentPrice()`
- `lib/tours.ts` — `TourRow`+`toTour` yeni alanlar; `getPublishedTours` SEFER'i hariç tutar; yeni `getSeferler()`; yeni re-export'lar
- `lib/booking.ts` — `CreateBookingInput.dropoffPlaceId`; sefer segment fiyatı + `dropoffName` kaydı
- `lib/checkout-actions.ts` — `dropoffPlaceId` okuma/iletme
- `lib/admin-actions.ts` — `type` + `segmentPrices` kaydı + doğrulama; sefer→KOLTUK zorlaması
- `components/admin/PlacesEditor.tsx` — controlled (lifted state) hale getir
- `components/admin/TourForm.tsx` — tip seçici + koşullu alanlar + segment matris kartı
- `app/admin/(dash)/turlar/[id]/page.tsx` — edit initial values (`type`, `segmentPrices`)
- `app/admin/(dash)/turlar/page.tsx` — tip rozeti
- `app/page.tsx` — tur/sefer ayrımı + `SeferSearch` yerleşimi
- `components/SeatMap.tsx` — 2 adımlı sihirbaz + sefer nereden/nereye
- `components/BookingLauncher.tsx` — etiket + `initialFrom`/`initialTo`
- `app/rezervasyon/page.tsx` — `inis` param + segment fiyatı
- `components/CheckoutForm.tsx` — `dropoffPlaceId`/`dropoffLabel` gizli alan + özet
- `app/admin/(dash)/rezervasyonlar/[id]/page.tsx` — nereden→nereye gösterimi

**Yeni:**
- `components/admin/SegmentPriceEditor.tsx` — sefer segment fiyat matrisi editörü
- `components/SeferSearch.tsx` — ana sayfa iki alanlı arama + canlı filtre
- `components/SeferCard.tsx` — yatay sefer kartı + koltuk rozeti

---

## Task 1: Veri modeli + saf tipler/yardımcılar

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/shared.ts`

**Interfaces:**
- Produces: `TourKind = "TUR" | "SEFER"`; `interface SegmentPrice { from: number; to: number; price: number }`; `Tour.type: TourKind`; `Tour.segmentPrices: SegmentPrice[]`; `Tour.availableSeats?: number`; `orderedStops(places?: TourPlace[]): TourPlace[]`; `parseSegments(raw: string): SegmentPrice[]`; `segmentPrice(segments: SegmentPrice[], fromIdx: number, toIdx: number, basePrice: number): number`.

- [ ] **Step 1: Şemaya alanları ekle**

`prisma/schema.prisma` — `Tour` modeli içine (`createdAt` satırından önce uygun bir yere) ekle:

```prisma
  type          String    @default("TUR") // TUR | SEFER
  segmentPrices String    @default("[]")  // JSON: [{ from, to, price }] — sefer segment fiyat matrisi
```

`Booking` modeli içine (`boardingName` satırının altına) ekle:

```prisma
  dropoffName    String?   // yolcunun inis noktasi (SEFER icin secilen DURAK adi)
```

- [ ] **Step 2: DB'yi güncelle + client'ı yeniden üret**

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync" + client üretildi. (Mevcut satırlar `type="TUR"`, `segmentPrices="[]"` default alır.)

- [ ] **Step 3: `lib/shared.ts` — tipleri ekle**

`export type PlaceType` satırının yakınına ekle:

```ts
export type TourKind = "TUR" | "SEFER";

// Sefer segment fiyatı: from/to = sıralı DURAK indeksleri (from < to).
export interface SegmentPrice {
  from: number;
  to: number;
  price: number;
}
```

`Tour` arayüzüne iki alan ekle (`status: string;` satırının altına):

```ts
  type: TourKind;
  segmentPrices: SegmentPrice[];
  availableSeats?: number; // SEFER kartında boş koltuk rozeti için
```

- [ ] **Step 4: `lib/shared.ts` — yardımcıları ekle**

Dosyanın sonuna ekle:

```ts
// Sıralı biniş/iniş durakları (yalnız DURAK, sortOrder artan).
export function orderedStops(places: TourPlace[] = []): TourPlace[] {
  return places
    .filter((p) => p.type === "DURAK")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// JSON segment matrisini güvenle ayrıştır.
export function parseSegments(raw: string): SegmentPrice[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => ({ from: Number(s.from), to: Number(s.to), price: Number(s.price) }))
      .filter(
        (s) =>
          Number.isInteger(s.from) &&
          Number.isInteger(s.to) &&
          s.from >= 0 &&
          s.to > s.from &&
          Number.isFinite(s.price) &&
          s.price >= 0
      );
  } catch {
    return [];
  }
}

// (from,to) segmentinin fiyatı; matriste yoksa tur taban fiyatı.
export function segmentPrice(
  segments: SegmentPrice[],
  fromIdx: number,
  toIdx: number,
  basePrice: number
): number {
  const seg = segments.find((s) => s.from === fromIdx && s.to === toIdx);
  return seg?.price ?? basePrice;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: `lib/shared.ts` kaynaklı hata yok. (Diğer dosyalarda `Tour.type`/`segmentPrices` zorunlu olduğundan `lib/tours.ts` `toTour` çağrısında hata çıkabilir — Task 2'de giderilecek. Bu adımda **yalnız shared.ts hatalarının** olmadığını doğrula; `tours.ts` hatası beklenen.)

- [ ] **Step 6: Commit (kullanıcı çalıştırır)**

```bash
git add prisma/schema.prisma lib/shared.ts
git commit -m "feat: sefer veri modeli ve segment fiyat yardımcıları"
```

---

## Task 2: Veri erişim katmanı (tours.ts)

**Files:**
- Modify: `lib/tours.ts`

**Interfaces:**
- Consumes: `TourKind`, `SegmentPrice`, `parseSegments`, `orderedStops`, `segmentPrice` (Task 1).
- Produces: `getSeferler(): Promise<Tour[]>` (type=SEFER, YAYINDA, places + availableSeats dolu); `getPublishedTours` artık **yalnız TUR** döndürür; `orderedStops`/`segmentPrice`/`parseSegments` re-export.

- [ ] **Step 1: `TourRow` tipine alanları ekle**

`lib/tours.ts` — `type TourRow = { ... }` içine `status: string;` satırının yanına ekle:

```ts
  type: string;
  segmentPrices: string;
```

- [ ] **Step 2: `toTour` `extra` tipine `availableSeats` ekle ve alanları döndür**

`toTour` imzasındaki `extra?: { ... }` nesnesine ekle:

```ts
    availableSeats?: number;
```

`return { ... }` nesnesine (`status: row.status,` satırının altına) ekle:

```ts
    type: (row.type as import("@/lib/shared").TourKind) ?? "TUR",
    segmentPrices: parseSegments(row.segmentPrices),
    availableSeats: extra?.availableSeats,
```

- [ ] **Step 3: Import + re-export güncelle**

`lib/tours.ts` üstünde `import type { ... } from "@/lib/shared";` listesine `TourKind, SegmentPrice` ekle. Değer import'una (`import { releaseExpiredHolds } ...`'ın üstündeki `export { ... } from "@/lib/shared";` bloğu) `orderedStops`, `segmentPrice`, `parseSegments` ekle. Ayrıca `parseSegments`'i dosya içinde de kullanacağımız için değer olarak import et:

```ts
import { parseSegments } from "@/lib/shared";
```

(Aynı fonksiyonu hem re-export edip hem içeride kullanmak için `export { parseSegments, orderedStops, segmentPrice } from "@/lib/shared";` bloğuna ekleyip, ayrıca dosya başında değer olarak `import { parseSegments } from "@/lib/shared";` yeterli.)

- [ ] **Step 4: `getPublishedTours` yalnız TUR döndürsün**

`getPublishedTours` içindeki ilk sorguda `where`'i güncelle:

```ts
  const rows = await prisma.tour.findMany({
    where: { status: "YAYINDA", type: "TUR" },
    orderBy: { departureDate: "asc" },
  });
```

- [ ] **Step 5: `getSeferler()` ekle**

`getTourBySlug` fonksiyonundan sonra ekle:

```ts
// Yayındaki seferler (type=SEFER). Yatay kartlar için places + boş koltuk sayısı dolu.
export async function getSeferler(): Promise<Tour[]> {
  await releaseExpiredHolds();
  const rows = await prisma.tour.findMany({
    where: { status: "YAYINDA", type: "SEFER" },
    orderBy: { departureDate: "asc" },
    include: { seats: true, places: { orderBy: { sortOrder: "asc" } } },
  });
  return rows.map((row) => {
    const availableSeats = row.seats.filter((s) => s.status === "BOS").length;
    const places: TourPlace[] = row.places.map((p) => ({
      id: p.id,
      type: p.type as PlaceType,
      name: p.name,
      address: p.address ?? undefined,
      mapQuery: p.mapQuery ?? undefined,
      nights: p.nights ?? undefined,
      price: p.price ?? undefined,
      sortOrder: p.sortOrder,
    }));
    return toTour(row as TourRow, { places, availableSeats });
  });
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: `lib/tours.ts` ve `lib/shared.ts` kaynaklı hata yok. (Kalan hatalar `lib/booking.ts`/admin — sonraki task'larda.)

- [ ] **Step 7: Commit (kullanıcı çalıştırır)**

```bash
git add lib/tours.ts
git commit -m "feat: tours veri katmanında sefer ayrımı ve getSeferler"
```

---

## Task 3: Admin — kaydetme mantığı (admin-actions.ts)

**Files:**
- Modify: `lib/admin-actions.ts`

**Interfaces:**
- Consumes: `parseSegments` (Task 1).
- Produces: form'dan `type` + `segmentPrices` okuyup kaydeden `tourDataFromForm`; sefer için `bookingType` KOLTUK'a zorlanır.

- [ ] **Step 1: `parseSegments` import et**

`lib/admin-actions.ts` üstündeki `import { VEHICLES, VehicleType } from "@/lib/shared";` satırını güncelle:

```ts
import { VEHICLES, VehicleType, parseSegments } from "@/lib/shared";
```

- [ ] **Step 2: `tourDataFromForm` içinde tip + segment matris**

`tourDataFromForm` fonksiyonunun başında `const bookingType = str(fd, "bookingType");` satırını şununla değiştir:

```ts
  const type = str(fd, "type") === "SEFER" ? "SEFER" : "TUR";
  // Sefer her zaman koltuk seçimlidir.
  const bookingType = type === "SEFER" ? "KOLTUK" : str(fd, "bookingType");
  const segmentPrices =
    type === "SEFER" ? JSON.stringify(parseSegments(str(fd, "segmentPrices"))) : "[]";
```

Aynı fonksiyonun `return { ... }` nesnesine (`status: ...` satırının yanına) ekle:

```ts
    type,
    segmentPrices,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `admin-actions.ts` hatasız (create/update `data`'ya yeni alanlar otomatik akar; Prisma tipleri Task 1 generate ile güncel).

- [ ] **Step 4: Smoke — admin'de sefer oluştur**

Run: `npm run dev` (arka planda) sonra tarayıcıda `/admin/turlar/yeni`. (UI henüz tip seçici içermiyor; bu adımda yalnız `npx tsc --noEmit` yeterli — UI Task 5'te.) Dev sunucu 200 veriyorsa geç.

- [ ] **Step 5: Commit (kullanıcı çalıştırır)**

```bash
git add lib/admin-actions.ts
git commit -m "feat: admin tur kaydında type ve segment fiyat matrisi"
```

---

## Task 4: PlacesEditor'ı controlled hale getir

**Files:**
- Modify: `components/admin/PlacesEditor.tsx`

**Interfaces:**
- Produces: `PlacesEditor` artık controlled — props `value: PlaceRow[]`, `onChange: (v: PlaceRow[]) => void` alır; `name` ile gizli JSON input'u yine render eder. `initial` prop'u kaldırılır (state artık ebeveynde).
- Consumes (sonraki task): `PlaceRow` tipi (mevcut, dışa aktarılmış).

- [ ] **Step 1: PlacesEditor imzasını controlled yap**

`components/admin/PlacesEditor.tsx` — `export default function PlacesEditor({ name, initial }: { name: string; initial?: PlaceRow[]; })` bloğunu ve `const [places, setPlaces] = useState<PlaceRow[]>(initial ?? []);` satırını şununla değiştir:

```tsx
export default function PlacesEditor({
  name,
  value,
  onChange,
}: {
  name: string;
  value: PlaceRow[];
  onChange: (v: PlaceRow[]) => void;
}) {
  const places = value;
  const setPlaces = (updater: PlaceRow[] | ((p: PlaceRow[]) => PlaceRow[])) =>
    onChange(typeof updater === "function" ? updater(places) : updater);
  const [preview, setPreview] = useState<number | null>(null);
```

`useState` import'u `preview` için hâlâ gerekli — dokunma. Fonksiyon gövdesinin geri kalanı (`add`/`update`/`remove`/`move` ve JSX) `setPlaces` çağrılarını olduğu gibi kullanmaya devam eder; değişiklik gerekmez.

- [ ] **Step 2: Typecheck (izole)**

Run: `npx tsc --noEmit`
Expected: `PlacesEditor.tsx` içi hatasız; ancak `TourForm.tsx` şu an `initial` geçtiği için orada hata çıkar — Task 5'te giderilecek. Bu beklenen.

- [ ] **Step 3: Commit (kullanıcı çalıştırır)**

```bash
git add components/admin/PlacesEditor.tsx
git commit -m "refactor: PlacesEditor controlled state (segment matrisi için)"
```

---

## Task 5: SegmentPriceEditor + TourForm tip seçici & matris

**Files:**
- Create: `components/admin/SegmentPriceEditor.tsx`
- Modify: `components/admin/TourForm.tsx`
- Modify: `app/admin/(dash)/turlar/[id]/page.tsx`

**Interfaces:**
- Consumes: `PlaceRow` (PlacesEditor), `SegmentPrice` (shared), controlled `PlacesEditor` (Task 4).
- Produces: `TourFormValues` alanlarına `type?: string` ve `segmentPrices?: SegmentPrice[]`; form `type` ve `segmentPrices` (JSON) gizli inputları gönderir.

- [ ] **Step 1: SegmentPriceEditor bileşenini yaz**

Create `components/admin/SegmentPriceEditor.tsx`:

```tsx
"use client";

import type { PlaceRow } from "@/components/admin/PlacesEditor";
import type { SegmentPrice } from "@/lib/shared";

// Sefer için nereden→nereye fiyat matrisi. from/to = DURAK'ların (dizideki) 0-tabanlı indeksi.
export default function SegmentPriceEditor({
  name,
  places,
  value,
  onChange,
}: {
  name: string;
  places: PlaceRow[];
  value: SegmentPrice[];
  onChange: (v: SegmentPrice[]) => void;
}) {
  // Yalnız DURAK'lar, dizi sırası = sortOrder (kayıtta böyle yazılır).
  const stops = places
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.type === "DURAK");

  function priceFor(from: number, to: number): number | "" {
    const seg = value.find((s) => s.from === from && s.to === to);
    return seg ? seg.price : "";
  }

  function setPrice(from: number, to: number, raw: string) {
    const price = Number(raw);
    const rest = value.filter((s) => !(s.from === from && s.to === to));
    if (raw.trim() === "" || !Number.isFinite(price) || price < 0) {
      onChange(rest);
    } else {
      onChange([...rest, { from, to, price: Math.round(price) }]);
    }
  }

  const input =
    "w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      {stops.length < 2 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-400">
          Segment fiyatı girmek için en az 2 durak ekleyin (yukarıdaki Rota bölümünden).
        </p>
      ) : (
        <div className="space-y-2">
          <p className="mb-2 text-xs text-slate-400">
            Her biniş→iniş çifti için kişi başı fiyat girin. Boş bırakılan segment, tur taban
            fiyatını kullanır.
          </p>
          {stops.map((from, i) =>
            stops.slice(i + 1).map((to) => (
              <div
                key={`${from.idx}-${to.idx}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
              >
                <span className="text-sm font-medium text-slate-700">
                  {from.name || `Durak ${from.idx + 1}`} → {to.name || `Durak ${to.idx + 1}`}
                </span>
                <input
                  type="number"
                  min={0}
                  value={priceFor(from.idx, to.idx)}
                  onChange={(e) => setPrice(from.idx, to.idx, e.target.value)}
                  placeholder="Fiyat ₺"
                  className={input}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TourForm — importlar ve state**

`components/admin/TourForm.tsx` üstüne ekle:

```tsx
import SegmentPriceEditor from "@/components/admin/SegmentPriceEditor";
import type { SegmentPrice } from "@/lib/shared";
```

`TourFormValues` arayüzüne ekle:

```ts
  type?: string;
  segmentPrices?: SegmentPrice[];
```

Bileşen gövdesinde mevcut `const [bookingType, setBookingType] = useState(...)` satırının yanına ekle:

```tsx
  const [type, setType] = useState(initial?.type ?? "TUR");
  const [places, setPlaces] = useState<PlaceRow[]>(initial?.places ?? []);
  const [segments, setSegments] = useState<SegmentPrice[]>(initial?.segmentPrices ?? []);
  const isSefer = type === "SEFER";
```

- [ ] **Step 3: TourForm — tip seçici (Genel Bilgiler kartı üstüne)**

`<Card title="Genel Bilgiler">`'in hemen içine, `<div className="grid gap-4 sm:grid-cols-2">`'den **önce** ekle:

```tsx
        <input type="hidden" name="type" value={type} />
        <div className="mb-4 flex flex-wrap gap-3">
          <TypeChip current={type} value="TUR" label="Tur" onSelect={setType} />
          <TypeChip current={type} value="SEFER" label="Sefer (Rota)" onSelect={setType} />
        </div>
        <p className="mb-4 text-xs text-slate-400">
          {isSefer
            ? "Sefer: sıralı duraklı, nereden→nereye segment fiyatlı, koltuklu yolculuk."
            : "Tur: paket gezi. Yolcu bir duraktan biner; farklı yerde inemez."}
        </p>
```

(`TypeChip` bileşeni dosyada zaten var; yeniden kullanılıyor.)

- [ ] **Step 4: TourForm — Rezervasyon Tipi kartını sefere göre koşullandır**

`<Card title="Rezervasyon Tipi">` içindeki chip satırını ve `bookingType === "KOLTUK" ? (...) : (...)` bloğunu şu mantıkla sar: sefer ise chip'leri gizle, KOLTUK alanlarını her zaman göster. Chip satırını (`<div className="flex flex-wrap gap-3"> ... </div>` ve altındaki `<input type="hidden" name="bookingType" .../>`) şununla değiştir:

```tsx
        {isSefer ? (
          <>
            <input type="hidden" name="bookingType" value="KOLTUK" />
            <p className="text-sm text-slate-500">
              Seferler koltuk seçimlidir. Araç ve sıra bilgisini aşağıdan girin.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <TypeChip current={bookingType} value="KOLTUK" label="Koltuk Seçimli" onSelect={setBookingType} />
              <TypeChip current={bookingType} value="KONTENJAN" label="Kontenjanlı" onSelect={setBookingType} />
            </div>
            <input type="hidden" name="bookingType" value={bookingType} />
          </>
        )}
```

Ardından `{bookingType === "KOLTUK" ? (` koşulunu `{(isSefer || bookingType === "KOLTUK") ? (` yap (KOLTUK alanları sefer için de görünsün).

- [ ] **Step 5: TourForm — PlacesEditor'ı controlled bağla + segment kartı**

`<Card title="Rota & Konaklama (Harita)">` içindeki `<PlacesEditor name="places" initial={initial?.places} />` satırını şununla değiştir:

```tsx
        <PlacesEditor name="places" value={places} onChange={setPlaces} />
```

Bu kartın **hemen altına** yeni bir kart ekle (yalnız sefer için):

```tsx
      {isSefer && (
        <Card title="Segment Fiyatları (Nereden → Nereye)">
          <SegmentPriceEditor name="segmentPrices" places={places} value={segments} onChange={setSegments} />
        </Card>
      )}
```

- [ ] **Step 6: Edit sayfası initial değerleri**

`app/admin/(dash)/turlar/[id]/page.tsx` — `initial` nesnesine ekle (`status: t.status,` yanına):

```ts
    type: t.type,
    segmentPrices: JSON.parse(t.segmentPrices || "[]"),
```

(`t.type`/`t.segmentPrices` Prisma modelinde artık var.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hatasız (Task 4 controlled PlacesEditor + bu task birlikte tamamlanır).

- [ ] **Step 8: Smoke — sefer oluştur/düzenle**

`npm run dev`; `/admin/turlar/yeni` → "Sefer (Rota)" seç → 2+ durak ekle → segment kartında fiyat gir → kaydet. Sonra listede kaydı düzenle: değerler geri yüklenmeli.
Run (dev ayaktayken): `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/turlar/yeni`
Expected: `200` (giriş yapılmışsa) veya `307` (login'e yönlendirme) — 500 OLMAMALI.

- [ ] **Step 9: Commit (kullanıcı çalıştırır)**

```bash
git add components/admin/SegmentPriceEditor.tsx components/admin/TourForm.tsx "app/admin/(dash)/turlar/[id]/page.tsx"
git commit -m "feat: admin sefer tipi seçici ve segment fiyat matrisi UI"
```

---

## Task 6: Admin tur listesinde tip rozeti

**Files:**
- Modify: `app/admin/(dash)/turlar/page.tsx`

- [ ] **Step 1: "Tur" sütununa rozet ekle**

`app/admin/(dash)/turlar/page.tsx` — başlık hücresinde `<p className="font-medium text-slate-800">{t.title}</p>` satırını şununla değiştir:

```tsx
                      <p className="font-medium text-slate-800">
                        {t.title}
                        <span
                          className={`ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            t.type === "SEFER"
                              ? "bg-accent/15 text-accent-dark"
                              : "bg-brand/10 text-brand"
                          }`}
                        >
                          {t.type === "SEFER" ? "SEFER" : "TUR"}
                        </span>
                      </p>
```

(`t.type` `prisma.tour.findMany` sonucunda mevcut.)

- [ ] **Step 2: Typecheck + smoke**

Run: `npx tsc --noEmit`
Expected: Hatasız.
Run (dev ayaktayken): `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/turlar`
Expected: `200`/`307`.

- [ ] **Step 3: Commit (kullanıcı çalıştırır)**

```bash
git add "app/admin/(dash)/turlar/page.tsx"
git commit -m "feat: admin tur listesinde sefer/tur rozeti"
```

---

## Task 7: Booking — dropoff + sefer segment fiyatı (server)

**Files:**
- Modify: `lib/booking.ts`
- Modify: `lib/checkout-actions.ts`

**Interfaces:**
- Consumes: `parseSegments`, `segmentPrice` (Task 1).
- Produces: `CreateBookingInput.dropoffPlaceId?: string`; `createPendingBooking` sefer için segment fiyatı + `dropoffName` yazar. `submitCheckout` `dropoffPlaceId`'yi iletir.

- [ ] **Step 1: booking.ts import + input alanı**

`lib/booking.ts` üstünde `import { isValidId, isValidPhone, seatNeighbor, genderLabel } from "@/lib/shared";` satırını güncelle:

```ts
import { isValidId, isValidPhone, seatNeighbor, genderLabel, parseSegments, segmentPrice } from "@/lib/shared";
```

`CreateBookingInput` arayüzüne ekle (`boardingPlaceId?` satırının altına):

```ts
  dropoffPlaceId?: string; // SEFER: seçilen iniş durağı
```

- [ ] **Step 2: Fiyat + boarding/dropoff çözümleme bloğunu değiştir**

`createPendingBooking` içindeki şu bloğu:

```ts
  let unitPrice = tour.price;
  let boardingName: string | null = null;
  if (input.boardingPlaceId) {
    const place = await prisma.tourPlace.findFirst({
      where: { id: input.boardingPlaceId, tourId: tour.id, type: "DURAK" },
    });
    if (place) {
      boardingName = place.name;
      if (place.price != null) unitPrice = place.price;
    }
  }
```

şununla değiştir:

```ts
  let unitPrice = tour.price;
  let boardingName: string | null = null;
  let dropoffName: string | null = null;
  if (tour.type === "SEFER" && input.boardingPlaceId && input.dropoffPlaceId) {
    // Sefer: sıralı duraklardan (from<to) segment fiyatı uygulanır.
    const stops = await prisma.tourPlace.findMany({
      where: { tourId: tour.id, type: "DURAK" },
      orderBy: { sortOrder: "asc" },
    });
    const fromIdx = stops.findIndex((s) => s.id === input.boardingPlaceId);
    const toIdx = stops.findIndex((s) => s.id === input.dropoffPlaceId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx)
      return { ok: false, error: "Geçersiz güzergâh seçimi (nereden/nereye)." };
    boardingName = stops[fromIdx].name;
    dropoffName = stops[toIdx].name;
    unitPrice = segmentPrice(parseSegments(tour.segmentPrices), fromIdx, toIdx, tour.price);
  } else if (input.boardingPlaceId) {
    // Tur: biniş durağı bazlı fiyat.
    const place = await prisma.tourPlace.findFirst({
      where: { id: input.boardingPlaceId, tourId: tour.id, type: "DURAK" },
    });
    if (place) {
      boardingName = place.name;
      if (place.price != null) unitPrice = place.price;
    }
  }
```

- [ ] **Step 3: booking create'lerine `dropoffName` ekle**

`createPendingBooking` içinde **iki** `tx.booking.create`/`prisma... create` (KOLTUK ve KONTENJAN dalları) `data` nesnelerinde `boardingName,` satırının altına ekle:

```ts
          dropoffName,
```

(KOLTUK dalındaki `booking = await tx.booking.create({ data: { ... boardingName, ... } })` ve KONTENJAN dalındaki `tx.booking.create({ data: { ... boardingName, ... } })` — her ikisine de.)

- [ ] **Step 4: checkout-actions dropoff iletimi**

`lib/checkout-actions.ts` — `const boardingPlaceId = s(fd, "boardingPlaceId") || undefined;` satırının altına ekle:

```ts
  const dropoffPlaceId = s(fd, "dropoffPlaceId") || undefined;
```

`createPendingBooking({ ... boardingPlaceId, })` çağrısına ekle:

```ts
    dropoffPlaceId,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hatasız (`tour.type`/`tour.segmentPrices` Prisma row'unda var).

- [ ] **Step 6: Commit (kullanıcı çalıştırır)**

```bash
git add lib/booking.ts lib/checkout-actions.ts
git commit -m "feat: sefer segment fiyatı ve iniş noktası rezervasyonda"
```

---

## Task 8: Rezervasyon sayfası + CheckoutForm — iniş noktası

**Files:**
- Modify: `app/rezervasyon/page.tsx`
- Modify: `components/CheckoutForm.tsx`

**Interfaces:**
- Consumes: `orderedStops`, `segmentPrice` (re-export edilen, Task 2).
- Produces: rezervasyon `?inis=` param'ını işler; `CheckoutForm` `dropoffPlaceId`/`dropoffLabel` alır, gizli input + özet gösterir.

- [ ] **Step 1: rezervasyon page — param + fiyat**

`app/rezervasyon/page.tsx` — `searchParams` tipine `inis?: string;` ekle ve destructuring'i `const { tur, koltuklar, adet, durak, inis } = await searchParams;` yap.

`import { getTourBySlug, formatPrice, formatDate } from "@/lib/tours";` satırını güncelle:

```ts
import { getTourBySlug, formatPrice, formatDate, orderedStops, segmentPrice } from "@/lib/tours";
```

`boardingStop`/`unitPrice` hesabını (mevcut `const boardingStop = ...; const unitPrice = ...;`) şununla değiştir:

```ts
  const stops = orderedStops(tour.places ?? []);
  const boardingStop = durak ? stops.find((p) => p.id === durak) : undefined;
  const dropoffStop = inis ? stops.find((p) => p.id === inis) : undefined;
  let unitPrice = tour.price;
  if (tour.type === "SEFER" && boardingStop && dropoffStop) {
    const fromIdx = stops.indexOf(boardingStop);
    const toIdx = stops.indexOf(dropoffStop);
    unitPrice = segmentPrice(tour.segmentPrices, fromIdx, toIdx, tour.price);
  } else if (boardingStop) {
    unitPrice = boardingStop.price ?? tour.price;
  }
```

`<CheckoutForm ... boardingPlaceId={boardingStop?.id} boardingLabel={boardingStop?.name}` bloğuna ekle:

```tsx
          dropoffPlaceId={dropoffStop?.id}
          dropoffLabel={dropoffStop?.name}
```

- [ ] **Step 2: CheckoutForm — props + gizli input + özet**

`components/CheckoutForm.tsx` — bileşen props'una ekle (`boardingPlaceId?`/`boardingLabel?` yanına):

```ts
  dropoffPlaceId,
  dropoffLabel,
```

ve tip bloğuna:

```ts
  dropoffPlaceId?: string;
  dropoffLabel?: string;
```

Gizli input'lar arasında (`{boardingPlaceId && <input ... name="boardingPlaceId" ... />}` satırının altına) ekle:

```tsx
      {dropoffPlaceId && <input type="hidden" name="dropoffPlaceId" value={dropoffPlaceId} />}
```

Özet kutusunda `{boardingLabel && (<p ...>Biniş: {boardingLabel}</p>)}` satırının altına ekle:

```tsx
          {dropoffLabel && (
            <p className="text-xs text-slate-500">İniş: {dropoffLabel}</p>
          )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hatasız.

- [ ] **Step 4: Commit (kullanıcı çalıştırır)**

```bash
git add app/rezervasyon/page.tsx components/CheckoutForm.tsx
git commit -m "feat: checkout iniş noktası (nereye) ve segment fiyat özeti"
```

---

## Task 9: SeatMap — iki adımlı güzergâh + koltuk sihirbazı

**Files:**
- Modify: `components/SeatMap.tsx`

**Interfaces:**
- Consumes: `orderedStops`, `segmentPrice` (shared/tours), `BoardingSelector`.
- Produces: `SeatMap` yeni props `initialFrom?: string | null`, `initialTo?: string | null`. Adım 1 (güzergâh) → Adım 2 (koltuk). `goToCheckout` sefer için `inis` param'ı ekler.

- [ ] **Step 1: Importları güncelle**

`components/SeatMap.tsx` — `import { Tour, Gender, buildSeatGrid, formatPrice, vehicleLabel, seatNeighbor, genderLabel } from "@/lib/shared";` satırına `orderedStops, segmentPrice` ekle.

- [ ] **Step 2: Props + state**

`export default function SeatMap({ tour }: { tour: Tour })` imzasını değiştir:

```tsx
export default function SeatMap({
  tour,
  initialFrom = null,
  initialTo = null,
}: {
  tour: Tour;
  initialFrom?: string | null;
  initialTo?: string | null;
}) {
```

Mevcut biniş bloğunu (`const stops = (tour.places ?? []).filter(...); const [boardingId, setBoardingId] = useState(...); const boardingStop = ...; const unitPrice = ...;`) şununla değiştir:

```tsx
  const stops = orderedStops(tour.places ?? []);
  const isSefer = tour.type === "SEFER";
  const [boardingId, setBoardingId] = useState<string | null>(
    initialFrom ?? (stops.length ? stops[0].id : null)
  );
  const [dropoffId, setDropoffId] = useState<string | null>(initialTo ?? null);

  // Sefer: her ikisi de seçiliyse direkt koltuğa; tur: durak yoksa direkt koltuğa.
  const canPreselect = isSefer
    ? Boolean(initialFrom && initialTo)
    : stops.length === 0;
  const [step, setStep] = useState<1 | 2>(canPreselect ? 2 : 1);

  const fromIdx = stops.findIndex((s) => s.id === boardingId);
  const toIdx = stops.findIndex((s) => s.id === dropoffId);
  const boardingStop = stops[fromIdx];
  const dropoffStop = stops[toIdx];

  const unitPrice = isSefer
    ? fromIdx >= 0 && toIdx > fromIdx
      ? segmentPrice(tour.segmentPrices, fromIdx, toIdx, tour.price)
      : tour.price
    : boardingStop?.price ?? tour.price;

  // Sefer'de Adım 1'i geçmek için geçerli from<to şart.
  const routeReady = isSefer ? fromIdx >= 0 && toIdx > fromIdx : true;
```

- [ ] **Step 3: goToCheckout — inis param**

`goToCheckout` içinde `if (boardingId) params.set("durak", boardingId);` satırının altına ekle:

```tsx
    if (isSefer && dropoffId) params.set("inis", dropoffId);
```

- [ ] **Step 4: Adım 1 (güzergâh) render — return'ün başına**

`return (` içindeki en dıştaki `<div className="space-y-6">`'nın hemen içinde, mevcut `{stops.length > 0 && (<BoardingSelector .../>)}` bloğunu **kaldır** ve yerine adım koşulunu koy. Yeni yapı:

```tsx
  return (
    <div className="space-y-6">
      {step === 1 ? (
        <div className="space-y-4">
          {isSefer ? (
            <>
              <StopList
                title="Nereden bineceksiniz?"
                stops={stops.slice(0, Math.max(0, stops.length - 1))}
                value={boardingId}
                onChange={(id) => {
                  setBoardingId(id);
                  // iniş, binişten önceyse sıfırla
                  const fi = stops.findIndex((s) => s.id === id);
                  const ti = stops.findIndex((s) => s.id === dropoffId);
                  if (ti <= fi) setDropoffId(null);
                }}
              />
              <StopList
                title="Nereye ineceksiniz?"
                stops={stops.filter((_, i) => i > fromIdx)}
                value={dropoffId}
                onChange={setDropoffId}
              />
              {routeReady && (
                <div className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">
                      {boardingStop?.name} → {dropoffStop?.name}
                    </span>
                    <span className="font-bold text-accent">
                      {formatPrice(unitPrice, tour.currency)} / kişi
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <BoardingSelector
              places={tour.places ?? []}
              value={boardingId}
              onChange={setBoardingId}
              basePrice={tour.price}
              currency={tour.currency}
            />
          )}
          <button
            type="button"
            disabled={!routeReady}
            onClick={() => setStep(2)}
            className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            İleri — Koltuk Seç
          </button>
          {isSefer && !routeReady && (
            <p className="text-center text-xs text-slate-400">
              Devam etmek için nereden ve nereye seçin.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {(isSefer || stops.length > 0) && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm font-semibold text-brand hover:underline"
            >
              ← Güzergâhı değiştir
              {isSefer && boardingStop && dropoffStop
                ? ` (${boardingStop.name} → ${dropoffStop.name})`
                : boardingStop
                ? ` (${boardingStop.name})`
                : ""}
            </button>
          )}
          <div className="grid gap-6 md:grid-cols-[1fr_260px]">
            {/* ... mevcut araç şeması + özet bloğu buraya taşınır ... */}
          </div>
        </div>
      )}
    </div>
  );
```

**Önemli:** Mevcut `<div className="grid gap-6 md:grid-cols-[1fr_260px]"> ... </div>` bloğunun tamamını (araç şeması + özet aside + cinsiyet seçim penceresi) yukarıdaki `step === 2` dalındaki işaretlenen yere taşı. Cinsiyet seçim penceresi (`{picking && (...)}`) bu grid'in içindeydi; olduğu gibi kalır.

- [ ] **Step 5: StopList yardımcı bileşenini ekle (dosya sonuna)**

`Legend`/`Row` fonksiyonlarının yanına ekle:

```tsx
function StopList({
  title,
  stops,
  value,
  onChange,
}: {
  title: string;
  stops: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h3 className="font-bold text-brand">{title}</h3>
      <div className="mt-3 flex flex-col gap-2">
        {stops.length === 0 ? (
          <p className="text-sm text-slate-400">Önce nereden seçin.</p>
        ) : (
          stops.map((s) => {
            const active = value === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(s.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left transition ${
                  active ? "border-accent bg-accent/10" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active ? "border-accent" : "border-slate-300"
                  }`}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                </span>
                <span className="text-sm font-semibold text-slate-700">{s.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Özet aside'a iniş satırı ekle (opsiyonel görünürlük)**

`step === 2` içindeki özet aside'ında `{boardingStop && <Row label="Biniş" value={boardingStop.name} />}` satırının altına ekle:

```tsx
          {isSefer && dropoffStop && <Row label="İniş" value={dropoffStop.name} />}
```

- [ ] **Step 7: Typecheck + smoke**

Run: `npx tsc --noEmit`
Expected: Hatasız.
`npm run dev`; bir sefer detayında "Koltuk Seç / Satın Al" → Adım 1 nereden/nereye → İleri → koltuk. Bir turda → Adım 1 biniş → İleri → koltuk.

- [ ] **Step 8: Commit (kullanıcı çalıştırır)**

```bash
git add components/SeatMap.tsx
git commit -m "feat: koltuk akışı iki adımlı sihirbaz (güzergâh → koltuk)"
```

---

## Task 10: BookingLauncher — etiket + ön seçim

**Files:**
- Modify: `components/BookingLauncher.tsx`

**Interfaces:**
- Consumes: `SeatMap` `initialFrom`/`initialTo` (Task 9).
- Produces: `BookingLauncher` yeni props `initialFrom?: string | null`, `initialTo?: string | null`; buton etiketi "Koltuk Seç / Satın Al".

- [ ] **Step 1: Props ekle**

`components/BookingLauncher.tsx` — props tipine ekle:

```ts
  initialFrom?: string | null;
  initialTo?: string | null;
```

fonksiyon parametrelerine `initialFrom, initialTo,` ekle.

- [ ] **Step 2: Etiket + SeatMap'e ilet**

`const btnLabel = label ?? (isSeat ? "Koltuk Seç" : "Rezervasyon Yap");` satırını değiştir:

```ts
  const btnLabel = label ?? (isSeat ? "Koltuk Seç / Satın Al" : "Rezervasyon Yap");
```

Modal içinde `{isSeat ? <SeatMap tour={tour} /> : <CapacityBooking tour={tour} />}` satırını değiştir:

```tsx
              {isSeat ? (
                <SeatMap tour={tour} initialFrom={initialFrom} initialTo={initialTo} />
              ) : (
                <CapacityBooking tour={tour} />
              )}
```

- [ ] **Step 3: Typecheck + smoke**

Run: `npx tsc --noEmit`
Expected: Hatasız. Detay sayfasında buton "Koltuk Seç / Satın Al" yazmalı.

- [ ] **Step 4: Commit (kullanıcı çalıştırır)**

```bash
git add components/BookingLauncher.tsx
git commit -m "feat: BookingLauncher etiketi ve güzergâh ön seçimi"
```

---

## Task 11: SeferCard — yatay kart + koltuk rozeti

**Files:**
- Create: `components/SeferCard.tsx`

**Interfaces:**
- Consumes: `Tour`, `formatPrice`, `formatDate` (shared/tours), `BookingLauncher` (Task 10).
- Produces: `SeferCard` — props `sefer: Tour`, `fromId?: string | null`, `toId?: string | null`. Yatay düzen, 4:5 görsel, boş koltuk rozeti, "Satın Al" → BookingLauncher (initialFrom/To).

- [ ] **Step 1: SeferCard bileşenini yaz**

Create `components/SeferCard.tsx`:

```tsx
import Link from "next/link";
import { Tour, formatPrice, formatDate, orderedStops } from "@/lib/shared";
import BookingLauncher from "@/components/BookingLauncher";

export default function SeferCard({
  sefer,
  fromId = null,
  toId = null,
}: {
  sefer: Tour;
  fromId?: string | null;
  toId?: string | null;
}) {
  const stops = orderedStops(sefer.places ?? []);
  const from = fromId ? stops.find((s) => s.id === fromId) : stops[0];
  const to = toId ? stops.find((s) => s.id === toId) : stops[stops.length - 1];
  const routeLabel =
    from && to ? `${from.name} → ${to.name}` : sefer.destination;

  const seats = sefer.availableSeats;
  const showSeatBadge = typeof seats === "number" && seats > 0 && seats <= 5;

  const cover = sefer.coverImage || (sefer.images?.[0] ?? "/logo.png");

  return (
    <div className="flex overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      {/* Görsel — 4:5 Instagram formatı */}
      <Link
        href={`/turlar/${sefer.slug}`}
        className="relative w-28 shrink-0 sm:w-40"
      >
        <div className="aspect-[4/5] h-full w-full overflow-hidden bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt={sefer.title} className="h-full w-full object-cover" />
        </div>
        {showSeatBadge && (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            Son {seats} koltuk
          </span>
        )}
      </Link>

      {/* Bilgi */}
      <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
        <div className="min-w-0">
          <Link href={`/turlar/${sefer.slug}`} className="hover:underline">
            <h3 className="truncate font-bold text-brand">{sefer.title}</h3>
          </Link>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-600">{routeLabel}</p>
          <p className="mt-1 text-xs text-slate-400">
            Kalkış: {formatDate(sefer.departureDate)}
          </p>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <span className="text-[11px] text-slate-400">Kişi başı</span>
            <p className="text-lg font-extrabold text-accent">
              {formatPrice(sefer.price, sefer.currency)}
            </p>
          </div>
          <BookingLauncher
            tour={sefer}
            label="Satın Al"
            initialFrom={fromId}
            initialTo={toId}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark"
          />
        </div>
      </div>
    </div>
  );
}
```

**Not:** Fiyat etiketi taban fiyatı gösterir; from/to seçiliyken segment fiyatını göstermek istenirse `segmentPrice` ile hesaplanabilir — MVP'de taban fiyat yeterli (kesin fiyat sihirbazda/checkout'ta gösterilir).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hatasız.

- [ ] **Step 3: Commit (kullanıcı çalıştırır)**

```bash
git add components/SeferCard.tsx
git commit -m "feat: yatay sefer kartı (koltuk rozeti + Satın Al)"
```

---

## Task 12: SeferSearch + ana sayfa entegrasyonu

**Files:**
- Create: `components/SeferSearch.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `Tour`, `orderedStops` (shared), `SeferCard` (Task 11), `getSeferler` (Task 2), `SearchIcon` (Icons).
- Produces: `SeferSearch` — props `seferler: Tour[]`. Tur adı/destinasyon araması (row1, `/turlar`'a form) + nereden/nereye (row2) + canlı filtreli `SeferCard` listesi.

- [ ] **Step 1: SeferSearch bileşenini yaz**

Create `components/SeferSearch.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Tour, orderedStops } from "@/lib/shared";
import SeferCard from "@/components/SeferCard";
import { SearchIcon } from "@/components/Icons";

export default function SeferSearch({ seferler }: { seferler: Tour[] }) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // Tüm seferlerdeki durak adlarının birleşimi (nereden seçenekleri).
  const fromOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of seferler) {
      const stops = orderedStops(s.places ?? []);
      // Son durak biniş noktası olamaz.
      stops.slice(0, Math.max(0, stops.length - 1)).forEach((st) => set.add(st.name));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [seferler]);

  // Nereye: seçilen nereden'den sonra en az bir seferde gelen duraklar.
  const toOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of seferler) {
      const names = orderedStops(s.places ?? []).map((st) => st.name);
      const i = from ? names.indexOf(from) : 0;
      const startAfter = from ? i + 1 : 1;
      if (from && i < 0) continue;
      names.slice(startAfter).forEach((n) => set.add(n));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [seferler, from]);

  // Filtre: from/to varsa rota yönünde (i<j) içeren seferler.
  const results = useMemo(() => {
    return seferler
      .map((s) => {
        const stops = orderedStops(s.places ?? []);
        const names = stops.map((st) => st.name);
        const i = from ? names.indexOf(from) : -1;
        const j = to ? names.indexOf(to) : -1;
        if (from && to) {
          if (i < 0 || j < 0 || i >= j) return null;
        } else if (from) {
          if (i < 0) return null;
        } else if (to) {
          if (j < 0) return null;
        }
        return {
          sefer: s,
          fromId: i >= 0 ? stops[i].id : null,
          toId: j >= 0 ? stops[j].id : null,
        };
      })
      .filter((x): x is { sefer: Tour; fromId: string | null; toId: string | null } => x !== null);
  }, [seferler, from, to]);

  const select =
    "w-full rounded-xl border border-transparent bg-slate-50 px-4 py-3.5 text-base text-slate-800 outline-none transition focus:border-brand focus:bg-white";

  return (
    <div className="rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5">
      {/* Row 1 — tur adı / destinasyon (turlar) */}
      <form action="/turlar" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <SearchIcon width={20} height={20} />
          </span>
          <input
            name="q"
            placeholder="Tur adı veya destinasyon ara (örn. Kapadokya, Balkan)"
            className="w-full rounded-xl border border-transparent bg-slate-50 py-3.5 pl-12 pr-4 text-base text-slate-800 outline-none transition focus:border-brand focus:bg-white"
          />
        </div>
        <button className="flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-3.5 text-base font-semibold text-white transition hover:bg-accent-dark">
          <SearchIcon width={18} height={18} />
          Tur Ara
        </button>
      </form>

      {/* Row 2 — nereden / nereye (seferler) */}
      {seferler.length > 0 && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <label className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                Nereden
              </span>
              <select
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setTo("");
                }}
                className={`${select} pl-24`}
              >
                <option value="">Tümü</option>
                {fromOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                Nereye
              </span>
              <select
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={`${select} pl-20`}
              >
                <option value="">Tümü</option>
                {toOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {(from || to) && (
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                Temizle
              </button>
            )}
          </div>

          {/* Sonuçlar — yatay sefer kartları */}
          <div className="mt-4 grid gap-3">
            {results.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                Seçtiğiniz güzergâhta sefer bulunamadı.
              </p>
            ) : (
              results.map(({ sefer, fromId, toId }) => (
                <SeferCard key={sefer.id} sefer={sefer} fromId={fromId} toId={toId} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: page.tsx — seferleri çek + hero'yu sadeleştir**

`app/page.tsx` — importlara ekle:

```ts
import SeferSearch from "@/components/SeferSearch";
import { getPublishedTours, getActiveBanners, getActiveReviews, getSeferler } from "@/lib/tours";
```

(Mevcut `getPublishedTours, getActiveBanners, getActiveReviews` import satırını yukarıdakiyle birleştir.)

`Promise.all([...])` dizisine `getSeferler()` ekle ve destructuring'i güncelle:

```ts
  const [tours, banners, manualReviews, google, seferler] = await Promise.all([
    getPublishedTours(),
    getActiveBanners(),
    getActiveReviews(),
    getGoogleBusiness(),
    getSeferler(),
  ]);
```

- [ ] **Step 3: page.tsx — hero form'unu kaldır, SeferSearch'i yerleştir**

Hero içindeki `<form action="/turlar" ...> ... </form>` bloğunu **ve** altındaki `<div className="mt-4 flex flex-wrap ...">Popüler...</div>` bloğunu kaldır (arama artık SeferSearch'te). Hero yalnız `<h1>` + `<p>` kalsın.

İçerik konteynerinin (`<div className="mx-auto max-w-6xl px-4 py-6">`) **ilk çocuğu** olarak, `{banners.length > 0 && (...)}`'dan önce ekle:

```tsx
        {/* Arama: tur adı/destinasyon + nereden/nereye seferler */}
        <section className="-mt-12 md:-mt-16">
          <SeferSearch seferler={seferler} />
        </section>
```

(`-mt` değeri arama kartını hero kenarına taşırır; hero'nun alt boşluğuna göre executor ince ayar yapabilir.)

- [ ] **Step 4: Typecheck + smoke**

Run: `npx tsc --noEmit`
Expected: Hatasız.
`npm run dev`; ana sayfada arama kartı görünmeli; nereden/nereye seçince seferler filtrelenmeli.
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/`
Expected: `200`.

- [ ] **Step 5: Commit (kullanıcı çalıştırır)**

```bash
git add components/SeferSearch.tsx app/page.tsx
git commit -m "feat: ana sayfa nereden/nereye sefer arama ve listesi"
```

---

## Task 13: Admin rezervasyon detayında nereden→nereye

**Files:**
- Modify: `app/admin/(dash)/rezervasyonlar/[id]/page.tsx`

**Interfaces:**
- Consumes: `Booking.dropoffName`, `Booking.boardingName` (Prisma).

- [ ] **Step 1: Mevcut biniş gösterimini bul ve iniş ekle**

`app/admin/(dash)/rezervasyonlar/[id]/page.tsx` dosyasını aç. `boardingName`'in gösterildiği yeri bul (yoksa iletişim/özet bölümüne ekle). Biniş satırının yanına iniş satırı ekle. Örnek (mevcut biçime uyarla):

```tsx
        {booking.boardingName && (
          <p className="text-sm text-slate-600">
            Güzergâh: <span className="font-medium">{booking.boardingName}</span>
            {booking.dropoffName ? ` → ${booking.dropoffName}` : ""}
          </p>
        )}
```

**Not:** Bu dosyanın mevcut yapısına göre alan adları (`booking` vs başka değişken) uyarlanmalı. Eğer `boardingName` hiç gösterilmiyorsa, yolcu/özet kartına yukarıdaki bloğu ekle.

- [ ] **Step 2: Typecheck + smoke**

Run: `npx tsc --noEmit`
Expected: Hatasız.
Run (dev ayaktayken, geçerli bir rezervasyon id'siyle): sayfa 200 dönmeli.

- [ ] **Step 3: Commit (kullanıcı çalıştırır)**

```bash
git add "app/admin/(dash)/rezervasyonlar/[id]/page.tsx"
git commit -m "feat: admin rezervasyon detayında nereden→nereye"
```

---

## Task 14: Uçtan uca doğrulama (sefer akışı)

**Files:** (kod değişikliği yok — doğrulama görevi)

- [ ] **Step 1: `verify` skill'ini çalıştır**

`superpowers:verify` (veya proje `run` skill'i) ile uygulamayı ayağa kaldır ve sefer akışını uçtan uca sür:
1. Admin: bir **sefer** oluştur (3 durak: Zonguldak, Düzce, İstanbul; araç Otobüs, 12 sıra; segment fiyatları: Zonguldak→Düzce, Zonguldak→İstanbul, Düzce→İstanbul).
2. Ana sayfa: Nereden=Düzce, Nereye=İstanbul → sefer kartı görünmeli; fiyat/rota doğru.
3. "Satın Al" → sihirbaz **direkt koltuk adımına** açılmalı (Adım 1 önceden dolu); "Güzergâhı değiştir" ile geri dönülebilmeli.
4. Koltuk seç → checkout → özet **Düzce → İstanbul** ve **segment fiyatı** göstermeli.
5. Bir **tur** detayında: "Koltuk Seç / Satın Al" → Adım 1 yalnız **biniş** (nereye yok) → İleri → koltuk.

- [ ] **Step 2: Fiyat sunucu doğrulaması**

Checkout'ta özetteki toplam ile ödeme öncesi hesaplanan tutarın (server `createPendingBooking`) segment fiyatına eşit olduğunu doğrula (yanlış/eksik segment → tur taban fiyatına düşmeli, hata değil).

- [ ] **Step 3: Typecheck (bütün)**

Run: `npx tsc --noEmit`
Expected: Tüm projede hata yok.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: Yeni dosyalarda hata yok (uyarılar kabul).

---

## Self-Review Notları (yazım sonrası)

- **Spec kapsamı:** Model (T1), veri katmanı (T2), admin kaydetme (T3), admin UI (T4–T6), server fiyat/dropoff (T7–T8), koltuk sihirbazı (T9–T10), ana sayfa arama/kart (T11–T12), admin rezervasyon gösterimi (T13), E2E (T14) — spec'in tüm bölümleri karşılanıyor.
- **Tip tutarlılığı:** `initialFrom`/`initialTo` (BookingLauncher→SeatMap), `fromId`/`toId` (SeferSearch→SeferCard→BookingLauncher), `dropoffPlaceId` (rezervasyon→CheckoutForm→checkout-actions→booking) uçtan uca tutarlı. Segment indeksleri her yerde **sıralı DURAK** tabanlı (`orderedStops`).
- **Placeholder yok:** Her adım gerçek kod/komut içerir.
- **Bilinen uyarlanabilir nokta:** Task 13 (admin rezervasyon detay) mevcut dosya yapısına göre uyarlama ister; adım bunu açıkça belirtir.
