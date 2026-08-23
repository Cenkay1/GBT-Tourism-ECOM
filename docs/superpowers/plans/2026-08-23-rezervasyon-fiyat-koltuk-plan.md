# Rezervasyon / Fiyat / Koltuk / Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** gbt-project'e çocuk indirimi, tek kişilik konaklama farkı, uyruk/ülke verisi, otobüs orta kapı + arka koridor koltuğu, biniş noktası ayrımı ve panel dönem filtresi eklemek.

**Architecture:** Fiyat hesabı tek bir saf fonksiyona (`priceBooking`) toplanır; hem istemci (canlı özet) hem sunucu (otoriter) aynı fonksiyonu kullanır. Yolcu/tur/rezervasyon modeline yeni alanlar eklenir. Koltuk düzeni yardımcıları orta kapı ve arka koridor koltuğunu destekler. Biniş noktaları yeni bir `BINIS` yer tipiyle rota duraklarından ayrılır.

**Tech Stack:** Next.js 16.2.10 (App Router, Server Actions), React 19, Prisma 7 (SQLite yerel / PostgreSQL canlı, client çıktısı `lib/generated/prisma`), Tailwind 4, xlsx, vitest (yeni — saf mantık testleri için).

## Global Constraints

- **AGENTS.md:** Bu Next.js sürümü eğitim verisinden farklı olabilir; kod yazmadan önce `node_modules/next/dist/docs/` içindeki ilgili rehbere bakın.
- **Prisma:** `generate` script'i yok; şema değişince `npx prisma db push` sonra `npx prisma generate` çalıştırın. Client çıktısı `lib/generated/prisma`.
- **Doğrulama:** Yerelde `next build` `.venv` bozuk symlink yüzünden kırılabilir; doğrulamada `npx tsc --noEmit` kullanın, tam build değil.
- **Git:** Commit/branch/push kullanıcı tarafından yapılır. Ajan commit ATMAZ; her görev bir doğrulama checkpoint'i ile biter.
- **Para birimi/format:** Tutarlar `Int` (kuruş değil, tam TL). `formatPrice(value, currency)` mevcut yardımcı kullanılır.
- **Yaş referansı:** Çocuk/yetişkin kararı **tur kalkış tarihine** göre.
- **SQLite enum yok:** Durum/tip alanları `String`; yeni tip değerleri (`BINIS`, `SINGLE`, `MULTI`, `TC`, `FOREIGN`) düz string.

---

## Dosya Yapısı (oluşturulacak / değişecek)

**Oluşturulacak:**
- `vitest.config.ts` — vitest yapılandırması (node ortamı, saf mantık).
- `lib/__tests__/pricing.test.ts` — `priceBooking` / `ageOn` testleri.
- `lib/__tests__/seat.test.ts` — `buildSeatGrid` / `seatNeighbor` / `seatCodes` testleri.
- `lib/countries.ts` — Türkçe isimli ülke listesi.
- `components/admin/BoardingPointsEditor.tsx` — fiyatlı biniş noktaları editörü.
- `scripts/migrate-durak-to-binis.sql` — mevcut DURAK → BINIS göç SQL'i.

**Değişecek:**
- `prisma/schema.prisma` — Passenger/Booking/Tour yeni alanlar.
- `lib/shared.ts` — `priceBooking`, `ageOn`, koltuk yardımcıları, ülke tipi.
- `lib/booking.ts` — otoriter fiyat + yeni alanların kaydı + per-yolcu uyruk doğrulaması.
- `lib/checkout-actions.ts` — yeni form alanlarını toplama.
- `lib/admin-actions.ts` — tur alanları, koltuk üretimi, yer kaydı (BINIS/price).
- `components/CheckoutForm.tsx` — doğum tarihi, uyruk/ülke, konaklama seçimi, canlı özet.
- `components/admin/TourForm.tsx` — tek kişilik farkı, orta kapı, arka koridor, biniş editörü.
- `components/admin/PlacesEditor.tsx` — yalnız DURAK/OTEL (fiyat kalkar).
- `components/BoardingSelector.tsx` — DURAK → BINIS.
- `components/SeatMap.tsx` — BINIS filtresi, orta kapı ayıracı, `M` koltuğu.
- `components/admin/AdminSeatBlocker.tsx` — orta kapı ayıracı, `M` koltuğu.
- `components/TourRouteMap.tsx` — BINIS'i haritada gösterme.
- `app/rezervasyon/page.tsx` — CheckoutForm'a yeni proplar, BINIS.
- `app/admin/(dash)/turlar/[id]/excel/route.ts` — Ülke/Doğum Tarihi/Tip sütunları.
- `app/admin/(dash)/page.tsx` — dönem filtresi.
- `package.json` — vitest devDependency + `test` script.

---

## Task 1: Prisma şema temeli

**Files:**
- Modify: `prisma/schema.prisma` (Passenger ~92-101, Booking ~69-90, Tour ~14-43)

**Interfaces:**
- Produces: `Passenger.birthDate: DateTime?`, `Passenger.nationality: String?`, `Passenger.country: String?`, `Booking.accommodationType: String?`, `Tour.singleSupplement: Int (default 2000)`, `Tour.doorAfterRow: Int?`, `Tour.backRowFull: Boolean (default false)`.

- [ ] **Step 1: `Passenger` modeline alan ekle**

`prisma/schema.prisma` içinde `model Passenger` bloğuna (`gender String?` satırından sonra) ekle:

```prisma
  birthDate   DateTime?
  nationality String?   // TC | FOREIGN
  country     String?   // ülke adı (TC ise "Türkiye")
```

- [ ] **Step 2: `Booking` modeline alan ekle**

`model Booking` içinde `paymentMethod` satırının hemen altına ekle:

```prisma
  accommodationType String? // SINGLE | MULTI | null (konaklamasız turda null)
```

- [ ] **Step 3: `Tour` modeline alan ekle**

`model Tour` içinde `seatRows Int?` satırından sonra ekle:

```prisma
  doorAfterRow     Int?     // orta kapı bu sıradan sonra (null = kapı yok)
  backRowFull      Boolean  @default(false) // son sırada koridorda ekstra koltuk
  singleSupplement Int      @default(2000)  // tek kişilik konaklama farkı
```

- [ ] **Step 4: Şemayı uygula ve client'i yeniden üret**

Run:
```bash
npx prisma db push && npx prisma generate
```
Expected: "Your database is now in sync" + "Generated Prisma Client".

- [ ] **Step 5: Doğrulama checkpoint**

Run: `npx tsc --noEmit`
Expected: Hata yok (yeni alanlar tiplerde görünür). Kullanıcı bu noktada commit edebilir.

---

## Task 2: Vitest kurulumu + `priceBooking` / `ageOn` saf yardımcıları (F1/F2 çekirdek)

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `vitest.config.ts`
- Modify: `lib/shared.ts` (yeni fonksiyonlar, dosya sonuna)
- Create: `lib/__tests__/pricing.test.ts`

**Interfaces:**
- Produces:
  - `ageOn(birthDate: string, ref: string): number`
  - `priceBooking(input: { unitPrice: number; departureDate: string; passengers: { birthDate?: string | null }[]; accommodationType?: "SINGLE" | "MULTI" | null; singleSupplement?: number }): { total: number; perPassenger: { fare: number; isChild: boolean }[]; childCount: number; adultCount: number; supplement: number }`

- [ ] **Step 1: vitest ekle**

Run:
```bash
npm install -D vitest --legacy-peer-deps
```
Expected: vitest devDependencies'e eklenir. (Not: proje bağımlılıkları `--legacy-peer-deps` ile kurulur.)

- [ ] **Step 2: `package.json` test script'i ekle**

`scripts` bloğuna ekle:
```json
    "test": "vitest run"
```

- [ ] **Step 3: `vitest.config.ts` oluştur**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 4: Başarısız testleri yaz**

`lib/__tests__/pricing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ageOn, priceBooking } from "@/lib/shared";

const DEP = "2026-09-01";

describe("ageOn", () => {
  it("hesaplar: 5 yaşında", () => {
    expect(ageOn("2021-06-01", DEP)).toBe(5);
  });
  it("doğum günü henüz gelmediyse bir eksik", () => {
    expect(ageOn("2020-12-31", "2026-06-01")).toBe(5);
  });
});

describe("priceBooking", () => {
  const base = { unitPrice: 1000, departureDate: DEP, singleSupplement: 2000 };

  it("2 yetişkin + 1 çocuk (5) → çocuk %50", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, {}, { birthDate: "2021-06-01" }],
    });
    expect(r.adultCount).toBe(2);
    expect(r.childCount).toBe(1);
    expect(r.total).toBe(1000 + 1000 + 500);
  });

  it("1 yetişkin + 1 çocuk (5) → indirim yok", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, { birthDate: "2021-06-01" }],
    });
    expect(r.total).toBe(2000);
  });

  it("doğum tarihi yoksa yetişkin sayılır", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}] });
    expect(r.adultCount).toBe(2);
    expect(r.childCount).toBe(0);
    expect(r.total).toBe(2000);
  });

  it("tek kişilik konaklama farkı eklenir", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}],
      accommodationType: "SINGLE",
    });
    expect(r.supplement).toBe(2000);
    expect(r.total).toBe(3000);
  });

  it("birden fazla kişi konaklamada fark yok", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, {}],
      accommodationType: "MULTI",
    });
    expect(r.supplement).toBe(0);
    expect(r.total).toBe(2000);
  });

  it("7 yaş sınırı: tam 7 yaşında indirim yok", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, {}, { birthDate: "2019-06-01" }], // 7 yaşında
    });
    expect(r.childCount).toBe(0);
    expect(r.total).toBe(3000);
  });
});
```

- [ ] **Step 5: Testin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `ageOn`/`priceBooking` export edilmemiş.

- [ ] **Step 6: `lib/shared.ts` sonuna implementasyonu ekle**

```ts
// --- Yaş / fiyatlandırma ---
export function ageOn(birthDate: string, ref: string): number {
  const b = new Date(birthDate);
  const r = new Date(ref);
  let age = r.getFullYear() - b.getFullYear();
  const m = r.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age--;
  return age;
}

export interface PricePassenger {
  birthDate?: string | null;
}

export interface PriceResult {
  total: number;
  perPassenger: { fare: number; isChild: boolean }[];
  childCount: number;
  adultCount: number;
  supplement: number;
}

// Rezervasyon tutarını hesaplar (saf; hem istemci hem sunucu kullanır).
// Çocuk (kalkışta <7): rezervasyonda >=2 tam ücretli yetişkin varsa %50.
export function priceBooking(input: {
  unitPrice: number;
  departureDate: string;
  passengers: PricePassenger[];
  accommodationType?: "SINGLE" | "MULTI" | null;
  singleSupplement?: number;
}): PriceResult {
  const { unitPrice, departureDate, passengers } = input;
  const childFlags = passengers.map(
    (p) => !!p.birthDate && ageOn(p.birthDate, departureDate) < 7
  );
  const adultCount = childFlags.filter((c) => !c).length;
  const discount = adultCount >= 2;
  const childFare = Math.round(unitPrice * 0.5);
  const perPassenger = childFlags.map((isChild) => ({
    isChild,
    fare: isChild && discount ? childFare : unitPrice,
  }));
  const base = perPassenger.reduce((s, p) => s + p.fare, 0);
  const supplement =
    input.accommodationType === "SINGLE" ? input.singleSupplement ?? 0 : 0;
  return {
    total: base + supplement,
    perPassenger,
    childCount: childFlags.filter(Boolean).length,
    adultCount,
    supplement,
  };
}
```

- [ ] **Step 7: Testin geçtiğini doğrula**

Run: `npm test`
Expected: PASS (tüm pricing testleri). Ardından `npx tsc --noEmit` → hata yok.

---

## Task 3: F1 — Doğum tarihi + çocuk indirimi (checkout → sunucu)

**Files:**
- Modify: `lib/booking.ts` (`PassengerInput` ~6-12, `CreateBookingInput` ~14-25, KOLTUK amount ~156, KONTENJAN amount ~214, passenger create ~170-176 & ~228-233)
- Modify: `lib/checkout-actions.ts` (~26-36, ~41-51)
- Modify: `components/CheckoutForm.tsx` (proplar, doğum tarihi alanı, canlı özet)
- Modify: `app/rezervasyon/page.tsx` (yeni proplar)

**Interfaces:**
- Consumes: `priceBooking`, `ageOn` (Task 2).
- Produces: `PassengerInput` artık `birthDate?: string` taşır; `CreateBookingInput` artık `accommodationType?` taşır (F2'de kullanılacak, burada opsiyonel eklenir).

- [ ] **Step 1: `PassengerInput` ve `CreateBookingInput`'a alan ekle**

`lib/booking.ts` — `PassengerInput` içine ekle:
```ts
  birthDate?: string; // yyyy-mm-dd
```
`CreateBookingInput` içine ekle:
```ts
  accommodationType?: "SINGLE" | "MULTI"; // konaklamalı turda tek/çok kişi
```

- [ ] **Step 2: KOLTUK tutarını `priceBooking` ile hesapla**

`lib/booking.ts` içinde import satırını güncelle:
```ts
import { isValidId, isValidPhone, seatNeighbor, genderLabel, priceBooking } from "@/lib/shared";
```
KOLTUK bloğundaki `const amount = unitPrice * codes.length;` satırını değiştir:
```ts
      const amount = priceBooking({
        unitPrice,
        departureDate: tour.departureDate.toISOString(),
        passengers: input.passengers,
        accommodationType: input.accommodationType,
        singleSupplement: tour.singleSupplement,
      }).total;
```

- [ ] **Step 3: KONTENJAN tutarını `priceBooking` ile hesapla**

KONTENJAN bloğundaki `const amount = unitPrice * qty;` satırını değiştir:
```ts
    const amount = priceBooking({
      unitPrice,
      departureDate: tour.departureDate.toISOString(),
      passengers: input.passengers,
      accommodationType: input.accommodationType,
      singleSupplement: tour.singleSupplement,
    }).total;
```

- [ ] **Step 4: Yolcu kayıtlarına `birthDate` yaz**

`lib/booking.ts` — KOLTUK `passengers.create` map'ine ekle (her iki create bloğunda):
```ts
              birthDate: p.birthDate ? new Date(p.birthDate) : null,
```
KONTENJAN `passengers.create` map'ine de aynı satırı ekle.

- [ ] **Step 5: `checkout-actions.ts` doğum tarihini topla + accommodationType**

`lib/checkout-actions.ts` — yolcu döngüsünde `passengers.push({...})` içine ekle:
```ts
      birthDate: s(fd, `p_${i}_birth`) || undefined,
```
`createPendingBooking({...})` çağrısına ekle:
```ts
    accommodationType:
      s(fd, "accommodationType") === "SINGLE" ? "SINGLE" : s(fd, "accommodationType") === "MULTI" ? "MULTI" : undefined,
```

- [ ] **Step 6: `CheckoutForm` — proplar + doğum tarihi alanı + canlı özet**

`components/CheckoutForm.tsx`:
- Import satırına `priceBooking` ekle: `import { Gender, genderLabel, isValidId, isValidPhone, priceBooking } from "@/lib/shared";`
- Bileşen proplarına ekle (arayüz):
```ts
  unitPrice: number;
  departureDate: string;       // ISO
  singleSupplement: number;
  hasAccommodation: boolean;
  currency: string;
```
- State ekle (genders state'inin yanına):
```ts
  const [births, setBirths] = useState<string[]>(
    Array.from({ length: count }, () => "")
  );
  const [accommodationType, setAccommodationType] = useState<"MULTI" | "SINGLE">("MULTI");
```
- Canlı toplam hesabı (render'dan önce):
```ts
  const priced = priceBooking({
    unitPrice,
    departureDate,
    passengers: births.map((b) => ({ birthDate: b || undefined })),
    accommodationType: hasAccommodation ? accommodationType : undefined,
    singleSupplement,
  });
```
- Gizli input ekle (form başındaki hidden inputların yanına):
```tsx
      <input type="hidden" name="accommodationType" value={hasAccommodation ? accommodationType : ""} />
      {births.map((b, i) => (
        <input key={`b${i}`} type="hidden" name={`p_${i}_birth`} value={b} />
      ))}
```
- Her yolcu kartındaki ad/soyad/kimlik grid'inin altına doğum tarihi alanı ekle:
```tsx
                <div className="mt-3">
                  <label className={label}>
                    Doğum Tarihi <span className="text-slate-400">(7 yaş altı %50 indirim için)</span>
                    <input
                      type="date"
                      value={births[i]}
                      onChange={(e) =>
                        setBirths((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                      }
                      className={input}
                    />
                  </label>
                  {priced.perPassenger[i]?.isChild && (
                    <p className="mt-1 text-xs font-medium text-accent">
                      {priced.adultCount >= 2 ? "%50 çocuk indirimi uygulandı." : "İndirim için rezervasyonda en az 2 yetişkin gerekir."}
                    </p>
                  )}
                </div>
```
- Özetteki toplam satırını canlı değere bağla (`summary.totalLabel` yerine):
```tsx
          <span className="text-accent">{formatPrice(priced.total, currency)}</span>
```
`formatPrice`'ı import et: `import { ... , formatPrice } from "@/lib/shared";` (zaten priceBooking ile aynı import satırına eklenebilir).

- [ ] **Step 7: `app/rezervasyon/page.tsx` yeni proplar**

`CheckoutForm`'a geçir:
```tsx
          unitPrice={unitPrice}
          departureDate={tour.departureDate}
          singleSupplement={tour.singleSupplement}
          hasAccommodation={(tour.places ?? []).some((p) => p.type === "OTEL")}
          currency={tour.currency}
```
Not: `tour.departureDate` `lib/shared.ts` Tour tipinde `string` (ISO). `singleSupplement` alanını Tour tipine eklemek Task 4'te yapılır; burada `tour.singleSupplement ?? 2000` kullan güvenli olması için: `singleSupplement={tour.singleSupplement ?? 2000}`.

- [ ] **Step 8: Doğrulama checkpoint**

Run: `npm test && npx tsc --noEmit`
Expected: testler PASS, tsc hatasız.
Manuel: `npm run dev`, konaklamasız bir turda 2 yetişkin + 1 çocuk (doğum tarihi <7) seçip özet toplamında %50 indirimin göründüğünü doğrula.

---

## Task 4: F2 — Tek kişilik konaklama farkı

**Files:**
- Modify: `lib/shared.ts` (Tour arayüzü — `singleSupplement`, `doorAfterRow`, `backRowFull`)
- Modify: `lib/tours.ts` (Tour maplemesi — yeni alanları taşı)
- Modify: `lib/admin-actions.ts` (`buildTourData` ~83-105 — singleSupplement)
- Modify: `components/admin/TourForm.tsx` (TourFormValues + alan)
- Modify: `components/CheckoutForm.tsx` (konaklama seçimi UI — hasAccommodation true iken)

**Interfaces:**
- Consumes: `priceBooking` (F2 kısmı Task 3'te bağlandı — sunucu zaten `accommodationType` + `singleSupplement` kullanıyor).
- Produces: `Tour.singleSupplement: number` (shared tipinde), TourForm `singleSupplement` alanı.

- [ ] **Step 1: `lib/shared.ts` Tour arayüzüne alanlar ekle**

`interface Tour` içine (`seatRows?: number;` yanına):
```ts
  doorAfterRow?: number;
  backRowFull?: boolean;
  singleSupplement?: number;
```

- [ ] **Step 2: `lib/tours.ts` maplemesine yeni alanları taşı**

`lib/tours.ts` içinde Tour nesnesi kurulan yeri bul (Prisma `tour` → `Tour` dönüşümü) ve ekle:
```ts
    doorAfterRow: t.doorAfterRow ?? undefined,
    backRowFull: t.backRowFull ?? false,
    singleSupplement: t.singleSupplement ?? 2000,
```
(Grep: `grep -n "seatRows" lib/tours.ts` ile dönüşüm satırını bul; aynı nesneye ekle.)

- [ ] **Step 3: `admin-actions.ts` `buildTourData`'ya singleSupplement ekle**

`return {...}` nesnesine ekle:
```ts
    singleSupplement: optNum(fd, "singleSupplement") ?? 2000,
```
(Not: `doorAfterRow`/`backRowFull` Task 6'da eklenecek — burada yalnız singleSupplement.)

- [ ] **Step 4: `TourForm` — TourFormValues + alan**

`TourFormValues` arayüzüne ekle:
```ts
  singleSupplement?: number;
```
"Fiyat" Card'ının içine (para birimi seçiminin altına) ekle:
```tsx
          <label className={label}>
            Tek Kişilik Konaklama Farkı (₺)
            <input name="singleSupplement" type="number" min={0} defaultValue={initial?.singleSupplement ?? 2000} className={input} />
            <span className="mt-1 block text-xs text-slate-400">Otelli turlarda tek kişilik konaklama seçen müşteriye eklenir.</span>
          </label>
```

- [ ] **Step 5: `CheckoutForm` — konaklama tipi seçimi**

`components/CheckoutForm.tsx` — "İletişim Bilgileri" section'ından ÖNCE, konaklamalı turda göster:
```tsx
        {hasAccommodation && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-1 font-bold text-brand">Konaklama</h2>
            <p className="mb-4 text-xs text-slate-400">
              Tek kişilik konaklama seçilirse {formatPrice(singleSupplement, currency)} fark eklenir.
            </p>
            <div className="flex flex-wrap gap-3">
              {([
                ["MULTI", "Birden fazla kişi"],
                ["SINGLE", "Tek kişilik"],
              ] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAccommodationType(val)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                    accommodationType === val ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </section>
        )}
```

- [ ] **Step 6: Doğrulama checkpoint**

Run: `npm test && npx tsc --noEmit`
Expected: hatasız.
Manuel: Otel yeri olan bir turda checkout'ta "Tek kişilik" seçince özet toplamına farkın eklendiğini; sunucu tarafında (rezervasyon kaydı) `totalAmount`'ın farkı içerdiğini doğrula.

---

## Task 5: F3 — Uyruk + ülke + Excel

**Files:**
- Create: `lib/countries.ts`
- Modify: `lib/booking.ts` (`PassengerInput` + per-yolcu doğrulama ~74-84, create map)
- Modify: `lib/checkout-actions.ts` (nationality/country topla)
- Modify: `components/CheckoutForm.tsx` (uyruk toggle + ülke dropdown + per-yolcu id doğrulaması)
- Modify: `app/admin/(dash)/turlar/[id]/excel/route.ts` (Ülke/Doğum Tarihi/Tip sütunları)

**Interfaces:**
- Consumes: `isValidId` (mevcut).
- Produces: `COUNTRIES: string[]` (Türkçe ülke adları); `PassengerInput` artık `nationality?: "TC" | "FOREIGN"`, `country?: string` taşır.

- [ ] **Step 1: `lib/countries.ts` oluştur**

```ts
// Rezervasyonda yabancı uyruklu yolcu için ülke listesi (Türkçe adlar).
export const COUNTRIES: string[] = [
  "Almanya", "Amerika Birleşik Devletleri", "Avusturya", "Azerbaycan", "Belçika",
  "Birleşik Krallık", "Bulgaristan", "Çin", "Danimarka", "Fransa", "Gürcistan",
  "Hollanda", "İran", "İspanya", "İsveç", "İsviçre", "İtalya", "Japonya",
  "Kazakistan", "Katar", "Kuveyt", "Lübnan", "Mısır", "Norveç", "Özbekistan",
  "Polonya", "Romanya", "Rusya", "Suudi Arabistan", "Ukrayna", "Ürdün",
  "Yunanistan", "Diğer",
];
```

- [ ] **Step 2: `PassengerInput`'a uyruk/ülke ekle**

`lib/booking.ts` `PassengerInput` içine:
```ts
  nationality?: "TC" | "FOREIGN";
  country?: string;
```

- [ ] **Step 3: Sunucu doğrulamasını per-yolcu uyruğa bağla**

`lib/booking.ts` `createPendingBooking` içinde, tur-kategorisi tabanlı doğrulama döngüsünü değiştir. Mevcut:
```ts
  const allowPassport = tour.category === "YURT_DISI";
  ...
    if (!p.idNumber || !isValidId(p.idNumber, allowPassport))
```
Yerine:
```ts
  for (const p of input.passengers) {
    if (!p.firstName || !p.lastName)
      return { ok: false, error: "Tüm yolcuların ad ve soyadı zorunludur." };
    const foreign = p.nationality === "FOREIGN";
    if (!p.idNumber || !isValidId(p.idNumber, foreign))
      return {
        ok: false,
        error: foreign
          ? "Yabancı yolcular için geçerli bir pasaport no girin."
          : "Geçerli bir TC Kimlik No girin (11 hane).",
      };
    if (foreign && !p.country)
      return { ok: false, error: "Yabancı uyruklu yolcu için ülke seçin." };
  }
```
(Not: `allowPassport` değişkenini kaldır; artık kullanılmıyor.)

- [ ] **Step 4: Yolcu kayıtlarına nationality/country yaz**

`lib/booking.ts` her iki `passengers.create` map'ine ekle:
```ts
              nationality: p.nationality === "FOREIGN" ? "FOREIGN" : "TC",
              country: p.nationality === "FOREIGN" ? p.country || null : "Türkiye",
```

- [ ] **Step 5: `checkout-actions.ts` nationality/country topla**

`passengers.push({...})` içine ekle:
```ts
      nationality: s(fd, `p_${i}_nat`) === "FOREIGN" ? "FOREIGN" : "TC",
      country: s(fd, `p_${i}_country`) || undefined,
```

- [ ] **Step 6: `CheckoutForm` — uyruk toggle + ülke + per-yolcu id doğrulaması**

`components/CheckoutForm.tsx`:
- Import: `import { COUNTRIES } from "@/lib/countries";`
- `allowPassport` (tour.category tabanlı) yerine per-yolcu uyruk state'i:
```ts
  const [nats, setNats] = useState<("TC" | "FOREIGN")[]>(
    Array.from({ length: count }, () => "TC")
  );
  const [countries, setCountries] = useState<string[]>(
    Array.from({ length: count }, () => "")
  );
```
- Gizli inputlar (hidden alanların yanına):
```tsx
      {nats.map((n, i) => (
        <input key={`n${i}`} type="hidden" name={`p_${i}_nat`} value={n} />
      ))}
      {countries.map((c, i) => (
        <input key={`c${i}`} type="hidden" name={`p_${i}_country`} value={nats[i] === "FOREIGN" ? c : "Türkiye"} />
      ))}
```
- Her yolcu kartında, ad/soyad/kimlik grid'inin ÜSTÜne uyruk seçimi:
```tsx
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Uyruk:</span>
                  {([["TC", "T.C. Vatandaşı"], ["FOREIGN", "Yabancı Uyruklu"]] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setNats((prev) => prev.map((x, idx) => (idx === i ? val : x)))}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                        nats[i] === val ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                  {nats[i] === "FOREIGN" && (
                    <select
                      value={countries[i]}
                      onChange={(e) => setCountries((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand"
                    >
                      <option value="">Ülke seçin</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>
```
- Kimlik alanı etiketini per-yolcu uyruğa bağla — mevcut `allowPassport ? ... : ...` ifadelerini `nats[i] === "FOREIGN"` ile değiştir (Field `labelText`, `maxLength`).
- `validate` fonksiyonunda `allowPassport` yerine `const foreign = nats[i] === "FOREIGN";` kullan; ülke boşsa hata: `if (foreign && !countries[i]) errs[\`p_${i}_country\`] = "Ülke seçin.";`

- [ ] **Step 7: Excel'e Ülke / Doğum Tarihi / Tip sütunları**

`app/admin/(dash)/turlar/[id]/excel/route.ts` — `bookings` sorgusuna `include: { passengers: true }` zaten var. Satır nesnesini güncelle (Cinsiyet'ten sonra Ülke; sonuna Doğum Tarihi + Tip):
```ts
      rows.push({
        "Sıra": sira++,
        "Ad": p.firstName,
        "Soyad": p.lastName,
        "TC / Pasaport": p.idNumber ?? "",
        "Ülke": p.country ?? "",
        "Cinsiyet": genderLabel[p.gender ?? ""] ?? "",
        "Doğum Tarihi": p.birthDate ? p.birthDate.toLocaleDateString("tr-TR") : "",
        "Koltuk": p.seatCode ?? "",
        "İletişim (Ad Soyad)": b.contactName,
        "Telefon": b.contactPhone,
        "E-posta": b.contactEmail,
        "Durum": statusLabel[b.status] ?? b.status,
        "Konaklama": b.accommodationType === "SINGLE" ? "Tek kişilik" : b.accommodationType === "MULTI" ? "Birden fazla" : "",
        "Tutar": b.totalAmount,
        "Para Birimi": tour.currency,
        "Rezervasyon No": b.id.slice(-8).toUpperCase(),
        "Tarih": b.createdAt.toLocaleDateString("tr-TR"),
      });
```
Boş kayıt satırındaki ("Kayıt yok") anahtar kümesini de aynı anahtarlarla güncelle (Ülke/Doğum Tarihi/Konaklama ekle) ve `ws["!cols"]` genişlik dizisine 3 yeni giriş ekle (`{ wch: 14 }` Ülke, `{ wch: 12 }` Doğum Tarihi, `{ wch: 12 }` Konaklama).

- [ ] **Step 8: Doğrulama checkpoint**

Run: `npx tsc --noEmit`
Expected: hatasız (özellikle `allowPassport` kaldırıldığı için kalan referans olmamalı — `grep -n allowPassport components/CheckoutForm.tsx lib/booking.ts` boş dönmeli).
Manuel: Yabancı uyruk seçip ülke + pasaport ile rezervasyon; Excel'i indirip Ülke sütununu doğrula.

---

## Task 6: F4 — Otobüs orta kapı + arka sıra koridor koltuğu

**Files:**
- Modify: `lib/shared.ts` (`buildSeatGrid` ~169-196, `seatCodes` ~199-206; `seatNeighbor` zaten `M` için null döner çünkü regex eşleşir — testle doğrula)
- Create: `lib/__tests__/seat.test.ts`
- Modify: `lib/admin-actions.ts` (`generateSeats` ~143-153, `buildTourData` doorAfterRow/backRowFull, regen guard ~183-190)
- Modify: `components/admin/TourForm.tsx` (KOLTUK alanları)
- Modify: `components/SeatMap.tsx` (kapı ayıracı)
- Modify: `components/admin/AdminSeatBlocker.tsx` (kapı ayıracı)

**Interfaces:**
- Consumes: `VEHICLES`, `Tour` (shared).
- Produces: `buildSeatGrid` son sırada `M` koltuğu üretir (backRowFull); `seatCodes(vt, rows, backRowFull?)`.

- [ ] **Step 1: Başarısız seat testlerini yaz**

`lib/__tests__/seat.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSeatGrid, seatCodes, seatNeighbor } from "@/lib/shared";
import type { Tour } from "@/lib/shared";

function tour(partial: Partial<Tour>): Tour {
  return {
    id: "t", slug: "s", title: "", destination: "", category: "YURT_ICI",
    bookingType: "KOLTUK", departureDate: "2026-09-01", departureLocation: "",
    durationDays: 1, price: 1000, currency: "TRY", coverImage: "", images: [],
    description: "", highlights: [], status: "YAYINDA", features: [],
    excludedFeatures: [], vehicleType: "OTOBUS", seatRows: 3, ...partial,
  } as Tour;
}

describe("backRowFull", () => {
  it("son sırada M koltuğu ekler", () => {
    const rows = buildSeatGrid(tour({ seatRows: 3, backRowFull: true }));
    const last = rows[2].map((s) => s.code);
    expect(last).toContain("3M");
    // önceki sıralarda M yok
    expect(rows[0].map((s) => s.code)).not.toContain("1M");
  });
  it("backRowFull kapalıyken M yok", () => {
    const rows = buildSeatGrid(tour({ seatRows: 3, backRowFull: false }));
    expect(rows[2].map((s) => s.code)).not.toContain("3M");
  });
  it("seatCodes M kodunu üretir", () => {
    expect(seatCodes("OTOBUS", 3, true)).toContain("3M");
    expect(seatCodes("OTOBUS", 3, false)).not.toContain("3M");
  });
  it("M koltuğunun yan komşusu yok", () => {
    expect(seatNeighbor("3M", "2+2")).toBeNull();
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `buildSeatGrid` `M` üretmiyor / `seatCodes` 3. argümanı yok.

- [ ] **Step 3: `buildSeatGrid` ve `seatCodes`'u güncelle**

`lib/shared.ts` `buildSeatGrid` içindeki satır döngüsünde, `aisle` yerleşimini backRowFull'a göre koltuğa çevir. `for (const c of [...left, "aisle", ...right])` bloğundaki `if (c === "aisle")` dalını değiştir:
```ts
      if (c === "aisle") {
        const isLast = r === tour.seatRows;
        if (tour.backRowFull && isLast) {
          const code = `${r}M`;
          const isTaken = taken.has(code);
          const isBlocked = !isTaken && blocked.has(code);
          rowSeats.push({
            code,
            status: isTaken ? "SATILDI" : isBlocked ? "BLOKE" : "BOS",
            gender: isTaken ? genders[code] ?? null : null,
          });
        } else {
          rowSeats.push({ code: "aisle", status: "BOS" });
        }
        continue;
      }
```
`seatCodes` imzasını genişlet:
```ts
export function seatCodes(vt: VehicleType, rows: number, backRowFull = false): string[] {
  const { left, right } = VEHICLES[vt];
  const codes: string[] = [];
  for (let r = 1; r <= rows; r++) {
    for (const c of [...left, ...right]) codes.push(`${r}${c}`);
    if (backRowFull && r === rows) codes.push(`${r}M`);
  }
  return codes;
}
```
(`seatNeighbor` değişmez: `3M` regex `^(\d+)([A-Z])$` ile eşleşir, `M` hiçbir pairs haritasında yok → `null`. Test bunu doğrular.)

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: `generateSeats` + `buildTourData` + regen guard**

`lib/admin-actions.ts`:
- `generateSeats` imzası ve gövdesi:
```ts
async function generateSeats(tourId: string, vehicleType: string, rows: number, backRowFull: boolean) {
  const v = VEHICLES[vehicleType as VehicleType] ?? VEHICLES.OTOBUS;
  const cols = [...v.left, ...v.right];
  const data = [];
  for (let r = 1; r <= rows; r++) {
    for (const c of cols) data.push({ tourId, code: `${r}${c}`, status: "BOS" });
    if (backRowFull && r === rows) data.push({ tourId, code: `${r}M`, status: "BOS" });
  }
  if (data.length) await prisma.seat.createMany({ data });
}
```
- `buildTourData` `return {...}` nesnesine ekle:
```ts
    doorAfterRow: bookingType === "KOLTUK" ? optNum(fd, "doorAfterRow") : null,
    backRowFull: bookingType === "KOLTUK" ? str(fd, "backRowFull") === "on" : false,
```
- Oluşturma yolundaki `generateSeats(tour.id, data.vehicleType ?? "OTOBUS", data.seatRows)` çağrısını:
```ts
      await generateSeats(tour.id, data.vehicleType ?? "OTOBUS", data.seatRows, data.backRowFull);
```
- Güncelleme yolundaki `layoutChanged` kontrolüne backRowFull ekle ve çağrıyı güncelle:
```ts
    const layoutChanged =
      existing?.vehicleType !== data.vehicleType ||
      existing?.seatRows !== data.seatRows ||
      existing?.backRowFull !== data.backRowFull;
    if (layoutChanged) {
      await prisma.seat.deleteMany({ where: { tourId: id } });
      await generateSeats(id, data.vehicleType ?? "OTOBUS", data.seatRows, data.backRowFull);
    }
```
(Not: satış varsa düzen değişimi mevcut mantıkta engelleniyorsa o kontrolü koru; yalnız `backRowFull`'u karşılaştırmaya dahil et.)

- [ ] **Step 6: `TourForm` — orta kapı + arka koridor alanları**

`components/admin/TourForm.tsx` `TourFormValues`'a ekle:
```ts
  doorAfterRow?: number;
  backRowFull?: boolean;
```
KOLTUK dalındaki grid'e (Sıra Sayısı'nın yanına) ekle:
```tsx
            <label className={label}>
              Orta Kapı Sırası
              <input name="doorAfterRow" type="number" min={1} max={20} defaultValue={initial?.doorAfterRow ?? ""} placeholder="Örn. 14" className={input} />
              <span className="mt-1 block text-xs text-slate-400">Kapı bu sıradan sonra çizilir. Boş = kapı yok.</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 sm:col-span-2">
              <input name="backRowFull" type="checkbox" defaultChecked={initial?.backRowFull} className="h-4 w-4" />
              Son sırada koridorda da koltuk olsun (tam sıra)
            </label>
```

- [ ] **Step 7: `SeatMap` ve `AdminSeatBlocker` — kapı ayıracı**

`components/SeatMap.tsx` — `rows.map((row, r) => (...))` içinde, her sıra `<div>`'inden SONRA, `doorAfterRow` eşleşirse ayıracı ekle. Satır render'ını şu şekilde sar:
```tsx
            {rows.map((row, r) => (
              <div key={r}>
                <div className="flex items-center gap-2">
                  <span className="w-4 text-right text-[10px] text-slate-400">{r + 1}</span>
                  {row.map((seat, c) =>
                    seat.code === "aisle" ? (
                      <div key={c} className="w-4" />
                    ) : (
                      /* mevcut buton bloğu */
                    )
                  )}
                </div>
                {tour.doorAfterRow === r + 1 && (
                  <div className="my-2 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />🚪 Kapı<span className="h-px flex-1 bg-slate-200" />
                  </div>
                )}
              </div>
            ))}
```
`components/admin/AdminSeatBlocker.tsx` — `AdminSeatBlocker`'a `doorAfterRow?: number` prop'u ekle ve aynı ayıraç mantığını uygula. `koltuklar/page.tsx` ve `SeatMap` `tour.doorAfterRow`'u geçirmeli; `AdminSeatBlocker` çağrısına `doorAfterRow={tour.doorAfterRow}` ekle (`app/admin/(dash)/turlar/[id]/koltuklar/page.tsx`).

- [ ] **Step 8: Doğrulama checkpoint**

Run: `npm test && npx tsc --noEmit`
Expected: PASS + hatasız.
Manuel: KOLTUK turu düzenle, orta kapı = 14, arka koridor açık kaydet → koltuk yönetiminde 14. sıradan sonra kapı ayıracı ve son sırada `M` koltuğu görünür; müşteri seat map'inde de aynı.

---

## Task 7: F5 — Biniş noktaları (BINIS) ayrımı

**Files:**
- Create: `scripts/migrate-durak-to-binis.sql`
- Modify: `lib/admin-actions.ts` (`savePlaces` ~117-141 — BINIS tipi + price yalnız BINIS)
- Create: `components/admin/BoardingPointsEditor.tsx`
- Modify: `components/admin/PlacesEditor.tsx` (DURAK fiyat alanını kaldır)
- Modify: `components/admin/TourForm.tsx` (iki editör: rota + biniş)
- Modify: `components/BoardingSelector.tsx` (DURAK→BINIS)
- Modify: `components/SeatMap.tsx` (stops filtresi DURAK→BINIS)
- Modify: `lib/booking.ts` (boardingPlaceId sorgusu DURAK→BINIS ~91-98)
- Modify: `app/rezervasyon/page.tsx` (boardingStop DURAK→BINIS)
- Modify: `components/TourRouteMap.tsx` (BINIS'i göster)

**Interfaces:**
- Consumes: `TourPlace` (type artık `DURAK | OTEL | BINIS`).
- Produces: `savePlaces` `BINIS` kaydeder (price ile); tüm biniş tüketicileri `BINIS` okur.

- [ ] **Step 1: Göç SQL'i oluştur ve çalıştır**

`scripts/migrate-durak-to-binis.sql`:
```sql
UPDATE TourPlace SET type = 'BINIS' WHERE type = 'DURAK';
```
Run (yerel SQLite):
```bash
npx prisma db execute --file scripts/migrate-durak-to-binis.sql --schema prisma/schema.prisma
```
Expected: hata yok. (Canlıda aynı SQL PostgreSQL'de çalıştırılır; tablo adı Prisma modeliyle aynı: `TourPlace`.)

- [ ] **Step 2: `PlaceType`'ı genişlet ve editör tiplerini ayır**

`lib/shared.ts` `PlaceType`:
```ts
export type PlaceType = "DURAK" | "OTEL" | "BINIS";
```

- [ ] **Step 3: `savePlaces`'i üç tipi işleyecek şekilde güncelle**

`lib/admin-actions.ts` `savePlaces` — `createMany` map'ini değiştir:
```ts
    data: valid.map((p, i) => ({
      tourId,
      type: p.type === "OTEL" ? "OTEL" : p.type === "BINIS" ? "BINIS" : "DURAK",
      name: p.name.trim(),
      address: p.address?.trim() || null,
      mapQuery: (p.mapQuery?.trim() || p.address?.trim() || p.name.trim()) || null,
      nights: p.type === "OTEL" && p.nights ? Number(p.nights) : null,
      price: p.type === "BINIS" && p.price ? Math.round(Number(p.price)) : null,
      sortOrder: i,
    })),
```
Not: `savePlaces` tek bir `places` alanı okuyor. İki editörü birleştirmek için TourForm iki gizli input yerine tek `places` JSON'ı üretecek (Step 5). `deleteMany` tüm tipleri silip yeniden yazdığı için sorun yok.

- [ ] **Step 4: `BoardingPointsEditor` oluştur**

`components/admin/BoardingPointsEditor.tsx` — `PlacesEditor` ile aynı desende ama yalnız BINIS satırları, her satırda **fiyat** alanı zorunlu-değil. (PlaceAutocomplete + fiyat input.) Kod iskeleti `PlacesEditor`'dan uyarlanır; `add` yalnız `"BINIS"` ekler, fiyat inputu her satırda gösterilir, `nights` yok.

```tsx
"use client";
import { useState } from "react";
import PlaceAutocomplete from "@/components/admin/PlaceAutocomplete";
import type { PlaceRow } from "@/components/admin/PlacesEditor";

export default function BoardingPointsEditor({
  value, onChange,
}: { value: PlaceRow[]; onChange: (rows: PlaceRow[]) => void }) {
  const [preview, setPreview] = useState<number | null>(null);
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";
  const rows = value;
  const update = (i: number, patch: Partial<PlaceRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { type: "BINIS", name: "" }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-400">
          Henüz biniş noktası eklenmedi. Müşteri "Nereden bineceksiniz?" listesinde bunları görür.
        </p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="rounded-xl border border-slate-100 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-md bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">Biniş {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Sil</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <PlaceAutocomplete
              value={row.name}
              onTextChange={(t) => update(i, { name: t })}
              onSelect={(sel) => update(i, { name: sel.name, address: sel.address, mapQuery: sel.mapQuery })}
              placeholder="Biniş noktası — örn. Dudullu Terminal"
              className="min-w-0 flex-1"
              inputClassName={input}
            />
            <input
              type="number" min={0} value={row.price ?? ""}
              onChange={(e) => update(i, { price: Number(e.target.value) || undefined })}
              placeholder="Fiyat ₺" title="Bu biniş noktası için kişi başı fiyat (boş = tur fiyatı)"
              className={`${input} w-28`}
            />
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">+ Biniş Noktası Ekle</button>
    </div>
  );
}
```

- [ ] **Step 5: `TourForm` — iki editörü birleştir**

`components/admin/TourForm.tsx`:
- `PlacesEditor`'ı controlled hale getirmek yerine, TourForm'da iki state tut ve tek `places` JSON'ı üret. State:
```ts
  const initialPlaces = initial?.places ?? [];
  const [routePlaces, setRoutePlaces] = useState<PlaceRow[]>(initialPlaces.filter((p) => p.type !== "BINIS"));
  const [boardingPlaces, setBoardingPlaces] = useState<PlaceRow[]>(initialPlaces.filter((p) => p.type === "BINIS"));
```
- Tek gizli input:
```tsx
        <input type="hidden" name="places" value={JSON.stringify([...boardingPlaces, ...routePlaces])} />
```
- "Rota & Konaklama" Card'ında `PlacesEditor`'ı controlled kullan (aşağıda uncontrolled→controlled değişimi). Ayrıca yeni Card:
```tsx
      <Card title="Biniş Noktaları">
        <p className="mb-3 text-xs text-slate-400">
          Müşterinin "Nereden bineceksiniz?" adımında seçeceği noktalar. Her birine kişi başı fiyat girebilirsiniz.
        </p>
        <BoardingPointsEditor value={boardingPlaces} onChange={setBoardingPlaces} />
      </Card>
```
Import: `import BoardingPointsEditor from "@/components/admin/BoardingPointsEditor";`

- [ ] **Step 6: `PlacesEditor`'ı controlled yap + DURAK fiyatını kaldır**

`components/admin/PlacesEditor.tsx`:
- Proplar `{ value, onChange }` olacak (kendi `name`/hidden input'unu KALDIR — artık TourForm tek input üretiyor):
```ts
export default function PlacesEditor({ value, onChange }: { value: PlaceRow[]; onChange: (rows: PlaceRow[]) => void }) {
  const places = value;
  const setPlaces = (updater: PlaceRow[] | ((p: PlaceRow[]) => PlaceRow[])) =>
    onChange(typeof updater === "function" ? (updater as (p: PlaceRow[]) => PlaceRow[])(places) : updater);
```
- `<input type="hidden" name={name} .../>` satırını SİL.
- DURAK fiyat input bloğunu (`row.type === "DURAK" && (<input ... price ...>)`) SİL (fiyat artık yalnız biniş noktalarında).
- TourForm'da `<PlacesEditor value={routePlaces} onChange={setRoutePlaces} />` olarak çağır.

- [ ] **Step 7: Biniş tüketicilerini BINIS'e çevir**

- `components/BoardingSelector.tsx`: `.filter((p) => p.type === "DURAK")` → `=== "BINIS"`.
- `components/SeatMap.tsx`: `const stops = (tour.places ?? []).filter((p) => p.type === "DURAK");` → `=== "BINIS"`.
- `lib/booking.ts`: `prisma.tourPlace.findFirst({ where: { id: input.boardingPlaceId, tourId: tour.id, type: "DURAK" } })` → `type: "BINIS"`.
- `app/rezervasyon/page.tsx`: `(p) => p.id === durak && p.type === "DURAK"` → `=== "BINIS"`.

- [ ] **Step 8: `TourRouteMap` — BINIS'i göster**

`components/TourRouteMap.tsx` — mevcut yer filtrelerini incele (`grep -n "DURAK\|OTEL\|type" components/TourRouteMap.tsx`). Biniş noktalarını da haritada işaretçi olarak dahil et: rota/marker üretiminde `BINIS` tipini "Biniş" etiketiyle listeye ekle (DURAK ve OTEL ile birlikte). Etiket eşlemesi ekle: `BINIS → "Biniş Noktası"`.

- [ ] **Step 9: Doğrulama checkpoint**

Run: `npx tsc --noEmit`
Expected: hatasız. `grep -rn '"DURAK"' components lib app` → yalnız rota editörü/haritada kalır; biniş tüketicilerinde DURAK kalmamalı.
Manuel: Admin'de biri biniş (fiyatlı) biri rota durağı iki yer ekle; müşteri seat map'inde "Nereden bineceksiniz?" yalnız biniş noktasını göstersin; seçilince fiyat uygulansın. Mevcut (göç edilmiş) turların biniş seçiminin bozulmadığını doğrula.

---

## Task 8: F6 — Yönetim paneli dönem filtresi

**Files:**
- Modify: `app/admin/(dash)/page.tsx`

**Interfaces:**
- Consumes: `prisma.booking`, `formatPrice`.
- Produces: `?donem=1ay|1yil|3yil|tumu` destekli dashboard.

- [ ] **Step 1: `page.tsx` — searchParams + dönem hesabı**

`app/admin/(dash)/page.tsx` bileşen imzasını güncelle ve dönem eşiğini hesapla:
```tsx
export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string }>;
}) {
  const { donem = "1ay" } = await searchParams;
  const now = new Date();
  const since =
    donem === "1yil" ? new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    : donem === "3yil" ? new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
    : donem === "tumu" ? null
    : new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const createdFilter = since ? { createdAt: { gte: since } } : {};

  const [tourCount, bannerCount, bookingCount, paidBookings, upcoming] =
    await Promise.all([
      prisma.tour.count(),
      prisma.banner.count(),
      prisma.booking.count({ where: createdFilter }),
      prisma.booking.findMany({ where: { status: "ODENDI", ...createdFilter } }),
      prisma.tour.findMany({ where: { status: "YAYINDA" }, orderBy: { departureDate: "asc" }, take: 5 }),
    ]);
  const revenue = paidBookings.reduce((sum, b) => sum + b.totalAmount, 0);
```

- [ ] **Step 2: Dönem seçici butonları ekle**

Başlık `<p>`'sinin altına ekle:
```tsx
      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ["1ay", "Son 1 Ay"],
          ["1yil", "Son 1 Yıl"],
          ["3yil", "Son 3 Yıl"],
          ["tumu", "Tümü"],
        ] as const).map(([val, lbl]) => (
          <Link
            key={val}
            href={`/admin?donem=${val}`}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              donem === val ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {lbl}
          </Link>
        ))}
      </div>
```

- [ ] **Step 3: Stat etiketlerini dönemi yansıtacak şekilde güncelle**

`Rezervasyon` ve `Ciro` Stat'larının label'ını dönemli yap (opsiyonel ama netlik için):
```tsx
        <Stat label="Rezervasyon (dönem)" value={bookingCount} icon={<TicketIcon width={22} height={22} />} />
        <Stat label="Ciro (dönem, ödenen)" value={formatPrice(revenue, "TRY")} icon={<WalletIcon width={22} height={22} />} />
```

- [ ] **Step 4: Doğrulama checkpoint**

Run: `npx tsc --noEmit`
Expected: hatasız.
Manuel: `/admin?donem=1yil` ve `/admin?donem=tumu` arasında ciro/rezervasyon sayısının değiştiğini doğrula.

---

## Self-Review Notları

- **Spec kapsamı:** F1→Task 2-3, F2→Task 4, F3→Task 5, F4→Task 6, F5→Task 7, F6→Task 8, ortak temel→Task 1-2. Tümü karşılanıyor.
- **Placeholder:** Yok — tüm kod blokları somut.
- **Tip tutarlılığı:** `priceBooking`/`ageOn` imzaları Task 2'de tanımlanıp 3-4'te aynı isimlerle tüketiliyor; `seatCodes(vt, rows, backRowFull)` Task 6'da tanımlanıp aynı imzayla kullanılıyor; `PlaceRow`/`BINIS` Task 7'de tutarlı.
- **Bağımlılık sırası:** Task 1 (şema) → 2 (helpers) tüm fiyat görevlerinden önce; Task 4 Tour tipini genişletir, Task 3 Step 7 `singleSupplement ?? 2000` ile güvenli. Task 7 göçü diğer görevlerden bağımsız çalıştırılabilir.
