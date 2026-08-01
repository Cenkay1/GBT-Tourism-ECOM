# Elden/Nakit Satış Kaydı + Çoklu Galeri Görselleri — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin panelde elden nakit satışları (yolcular + koltuklar dahil) kayıt altına alma ve tur galerisini afiş boyutunda çoklu-yüklemeli, yatay kaydırmalı bir şeride dönüştürme.

**Architecture:** Galeri için yeni bir `GalleryUpload` client bileşeni mevcut `/api/admin/upload` ucunu kullanarak çoklu yükleme + sıralama sağlar; değerleri `TourForm`'daki mevcut `images` (newline) sözleşmesiyle uyumlu tek gizli alana yazar. Tur detay sayfası galeriyi `BannerCarousel` desenindeki yatay snap şeridine çevirir. Nakit satış için `Booking.paymentMethod` alanı eklenir; `lib/booking.ts`'teki test edilmiş koltuk-kilitleme/kontenjan/cinsiyet transaction mantığı `createPendingBooking` + `markBookingPaid` üzerinden yeniden kullanılarak yeni `createManualPaidBooking` yazılır; yeni bir admin sayfası + client form bu action'ı çağırır.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Prisma 7 (SQLite yerel), Tailwind CSS.

## Global Constraints

- **Next.js 16 uyarısı (AGENTS.md):** Bu Next.js sürümünde API/konvansiyonlar eğitim verisinden farklı olabilir. Kod yazmadan önce `node_modules/next/dist/docs/` içindeki ilgili rehberi (Server Actions, dynamic route params, form) oku. Deprecation notlarına uy.
- **Params/searchParams her zaman `Promise`** olarak gelir ve `await` edilir (mevcut sayfaların deseni).
- **Test çerçevesi yok.** Projede unit test harness'ı yoktur (`package.json` script'leri: `dev/build/start/lint`). Doğrulama her görevde: `npm run lint` + `npx tsc --noEmit` (tip kontrolü) + `npm run build` ve `npm run dev` ile çalışma-zamanı manuel doğrulama. Yeni test çerçevesi KURULMAZ (kapsam dışı).
- **Dil:** Tüm kullanıcıya görünen metinler Türkçe (mevcut kod deseni).
- **Para birimi/tutar:** Tutarlar tamsayı (`Int`), `formatPrice(amount, currency)` ile gösterilir.
- **Yetki:** Tüm admin server action'ları `requireAdmin()` çağırır (mevcut desen).
- **Görsel yükleme ucu:** `POST /api/admin/upload`, `FormData` alanı `file`, `{ url }` döner.

---

## Task 1: `GalleryUpload` bileşeni

Çoklu görsel yükleme + sıralama + kaldırma; değerleri newline-birleştirilmiş tek gizli input'a yazar.

**Files:**
- Create: `components/admin/GalleryUpload.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/upload` (`FormData.file` → `{ url }`).
- Produces: `default function GalleryUpload({ name: string; defaultValue?: string; label?: string; hint?: string })`. Gizli input `name` ile, değeri görsel URL'lerinin `\n` ile birleştirilmiş hali. `defaultValue` newline-birleştirilmiş string alır (boş satırlar atılır).

- [ ] **Step 1: Bileşeni oluştur**

`components/admin/GalleryUpload.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

export default function GalleryUpload({
  name,
  defaultValue,
  label = "Galeri Görselleri",
  hint,
}: {
  name: string;
  defaultValue?: string;
  label?: string;
  hint?: string;
}) {
  const [urls, setUrls] = useState<string[]>(
    (defaultValue ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList) {
    setBusy(true);
    setError("");
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Yükleme başarısız.");
        uploaded.push(data.url);
      }
      setUrls((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme başarısız.");
    } finally {
      setBusy(false);
    }
  }

  function addLink() {
    const v = linkRef.current?.value.trim();
    if (v) {
      setUrls((prev) => [...prev, v]);
      if (linkRef.current) linkRef.current.value = "";
    }
  }

  function removeAt(i: number) {
    setUrls((prev) => prev.filter((_, idx) => idx !== i));
  }

  function reorder(from: number, to: number) {
    setUrls((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <div>
      <span className="block text-sm font-medium text-slate-600">{label}</span>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <input type="hidden" name={name} value={urls.join("\n")} />

      {urls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {urls.map((url, i) => (
            <div
              key={`${url}-${i}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i);
                setDragIndex(null);
              }}
              className="group relative h-40 w-32 shrink-0 cursor-move overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Görsel ${i + 1}`} className="h-full w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-red-600 opacity-0 transition group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Yükleniyor…" : "Bilgisayardan Seç (çoklu)"}
        </button>
        <input
          ref={linkRef}
          placeholder="veya görsel bağlantısı (URL)"
          className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 outline-none focus:border-brand"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLink();
            }
          }}
        />
        <button
          type="button"
          onClick={addLink}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Ekle
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Sürükleyip bırakarak sıralayın. Görseller tur sayfasında bu sırayla afiş boyutunda gösterilir.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: Yeni dosyadan kaynaklı hata yok.

- [ ] **Step 3: Commit**

```bash
git add components/admin/GalleryUpload.tsx
git commit -m "feat: add GalleryUpload multi-image component"
```

---

## Task 2: `TourForm`'da galeri textarea'sını `GalleryUpload` ile değiştir

**Files:**
- Modify: `components/admin/TourForm.tsx`

**Interfaces:**
- Consumes: Task 1 `GalleryUpload` (`name`, `defaultValue` newline string, `label`, `hint`).
- Produces: Form davranışı değişmez — hâlâ `name="images"` alanını newline-birleştirilmiş olarak gönderir; `tourDataFromForm` (`lib/admin-actions.ts`) satır satır parse etmeye devam eder. `TourFormValues.images` tipi `string` (newline) olarak kalır.

- [ ] **Step 1: Import ekle**

`components/admin/TourForm.tsx` üst kısmındaki import'lara ekle (mevcut `ImageUpload` importunun altına):

```tsx
import GalleryUpload from "@/components/admin/GalleryUpload";
```

- [ ] **Step 2: textarea'yı değiştir**

`components/admin/TourForm.tsx` içinde şu bloğu:

```tsx
        <label className={`${label} mt-4`}>
          Galeri Görselleri (her satıra bir URL)
          <textarea name="images" rows={3} defaultValue={initial?.images} className={input} placeholder={"https://...\nhttps://..."} />
        </label>
```

şununla değiştir:

```tsx
        <div className="mt-4">
          <GalleryUpload
            name="images"
            defaultValue={initial?.images}
            label="Galeri Görselleri"
            hint="Birden fazla görsel yükleyebilirsiniz; hepsi afiş boyutunda yan yana gösterilir."
          />
        </div>
```

- [ ] **Step 3: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Hata yok.

- [ ] **Step 4: Çalışma-zamanı doğrulama**

Run: `npm run dev` (arka planda), sonra `/admin/turlar/yeni` ve mevcut bir turun düzenleme sayfasını aç.
Expected: Galeri bölümünde textarea yerine yükleme/URL alanı ve (düzenlemede) mevcut görsellerin önizleme kartları görünür. Görsel ekleyip sürükleyerek sıralanabiliyor. Turu kaydedince görseller korunuyor (DB'deki `images` JSON dizisi güncelleniyor).

- [ ] **Step 5: Commit**

```bash
git add components/admin/TourForm.tsx
git commit -m "feat: use GalleryUpload in TourForm gallery field"
```

---

## Task 3: Tur detay sayfasında yatay kaydırmalı afiş boyutlu galeri

**Files:**
- Modify: `app/turlar/[slug]/page.tsx` (galeri bloğu, ~satır 37–58)

**Interfaces:**
- Consumes: `tour.images: string[]` (mevcut). Tek görsel de birden fazla görsel de aynı boyutta akar.
- Produces: Görsel değişiklik; başka bileşen bu bloğa bağlı değil.

- [ ] **Step 1: Galeri bloğunu değiştir**

`app/turlar/[slug]/page.tsx` içinde `{/* Galeri */}` yorumuyla başlayan şu bloğu:

```tsx
      {/* Galeri */}
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tour.images[0]}
          alt={tour.title}
          className="h-72 w-full rounded-2xl object-cover md:h-96"
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          {tour.images.slice(1, 3).map((im, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={im}
              alt={`${tour.title} ${i + 2}`}
              className="h-[calc(9rem-0.375rem)] w-full rounded-2xl object-cover md:h-[calc(12rem-0.375rem)]"
            />
          ))}
        </div>
      </div>
```

şununla değiştir:

```tsx
      {/* Galeri — afiş boyutunda yatay kaydırmalı şerit */}
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(tour.images.length ? tour.images : [tour.coverImage]).map((im, i) => (
          <div
            key={i}
            className="w-[80%] shrink-0 snap-start sm:w-[55%] md:w-[42%] lg:w-[32%]"
          >
            <div className="aspect-[4/5] w-full overflow-hidden rounded-3xl bg-slate-100 shadow-md ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={im}
                alt={`${tour.title} ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        ))}
      </div>
```

- [ ] **Step 2: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Hata yok.

- [ ] **Step 3: Çalışma-zamanı doğrulama**

Run: `npm run dev`, bir tur detay sayfasını aç (`/turlar/<slug>`).
Expected: Görseller afiş oranında (4:5) yan yana; masaüstünde ~3, mobilde ~1–2 görünür; sağa kaydırarak diğerleri gezilebiliyor. 2 görselli turda da 5 görselli turda da kartlar aynı boyutta. Görseli olmayan turda kapak görseli tek kart olarak görünür.

- [ ] **Step 4: Commit**

```bash
git add "app/turlar/[slug]/page.tsx"
git commit -m "feat: horizontal poster-sized tour gallery strip"
```

---

## Task 4: `Booking.paymentMethod` alanı + migration

**Files:**
- Modify: `prisma/schema.prisma` (`Booking` modeli)
- Create: `prisma/migrations/<timestamp>_add_payment_method/migration.sql` (prisma üretir)

**Interfaces:**
- Produces: `Booking.paymentMethod: string` (`"ONLINE"` | `"NAKIT"`, varsayılan `"ONLINE"`). Sonraki task'ler bu alanı okur/yazar.

- [ ] **Step 1: Şemaya alanı ekle**

`prisma/schema.prisma` içindeki `Booking` modeline `paymentRef` satırının hemen üstüne ekle:

```prisma
  paymentMethod  String    @default("ONLINE") // ONLINE | NAKIT
```

- [ ] **Step 2: Migration oluştur ve uygula**

Run: `npx prisma migrate dev --name add_payment_method`
Expected: Migration oluşur ve uygulanır; `lib/generated/prisma` istemcisi yeniden üretilir. Mevcut kayıtlar `paymentMethod = "ONLINE"` alır.

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: Prisma istemcisi `paymentMethod` alanını tanır; hata yok.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Booking.paymentMethod field"
```

---

## Task 5: `getTourById` + `createManualPaidBooking` (sunucu mantığı)

**Files:**
- Modify: `lib/tours.ts` (yeni `getTourById`)
- Modify: `lib/booking.ts` (`markBookingPaid` imzasına opsiyon ekle + yeni `createManualPaidBooking`)

**Interfaces:**
- Consumes: mevcut `createPendingBooking(input: CreateBookingInput): Promise<CreateResult>`, `markBookingPaid`, `cancelBooking`, `toTour` (tours.ts iç yardımcı), `getTourBySlug` deseni.
- Produces:
  - `getTourById(id: string): Promise<Tour | null>` — `getTourBySlug` ile aynı şekilde `soldSeats`, `seatGenders`, `sold`, `places` dolu bir `Tour` döner.
  - `markBookingPaid(bookingId: string, paymentRef: string, opts?: { notify?: boolean; paymentMethod?: string }): Promise<{ ok: boolean; error?: string }>` — `notify` varsayılan `true`; `paymentMethod` verilirse booking'e yazılır.
  - `createManualPaidBooking(input: CreateBookingInput & { totalOverride?: number | null }): Promise<CreateResult>` — booking'i doğrudan `ODENDI` + `paymentMethod="NAKIT"` yapar, koltukları `SATILDI` işaretler, bildirim GÖNDERMEZ, `totalOverride` verilirse toplam tutarı ezer.

- [ ] **Step 1: `getTourById` ekle**

`lib/tours.ts` içinde `getTourBySlug` fonksiyonunun hemen ALTINA ekle (aynı seat/gender/sold/places hesabını `where: { id }` ile tekrarlar):

```ts
export async function getTourById(id: string): Promise<Tour | null> {
  // Önce süresi dolan geçici koltuk kilitlerini serbest bırak.
  await releaseExpiredHolds();

  const row = await prisma.tour.findUnique({
    where: { id },
    include: { seats: true, places: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) return null;

  const takenSeatRows = row.seats.filter((s) => s.status !== "BOS");
  const takenSeats = takenSeatRows.map((s) => s.code);
  const seatGenders: Record<string, Gender> = {};
  for (const s of takenSeatRows) {
    if (s.gender === "E" || s.gender === "K") seatGenders[s.code] = s.gender;
  }

  let soldCount: number | undefined;
  if (row.bookingType === "KONTENJAN") {
    const active = await prisma.booking.findMany({
      where: {
        tourId: row.id,
        OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }],
      },
      select: { quantity: true },
    });
    soldCount = active.reduce((sum, b) => sum + b.quantity, 0);
  }

  const places: TourPlace[] = (row.places ?? []).map((p) => ({
    id: p.id,
    type: p.type as PlaceType,
    name: p.name,
    address: p.address ?? undefined,
    mapQuery: p.mapQuery ?? undefined,
    nights: p.nights ?? undefined,
    sortOrder: p.sortOrder,
  }));

  return toTour(row as TourRow, {
    soldSeats: takenSeats,
    seatGenders,
    sold: soldCount,
    places,
  });
}
```

> Not: `Gender`, `TourPlace`, `PlaceType`, `TourRow`, `toTour`, `releaseExpiredHolds`, `prisma` zaten bu dosyada import/tanımlı (getTourBySlug bunları kullanıyor). Ek import gerekmez.

- [ ] **Step 2: `markBookingPaid` imzasına opsiyon ekle**

`lib/booking.ts` içindeki `markBookingPaid` fonksiyonunu güncelle. İmzayı ve booking `update` verisini değiştir, bildirimi opsiyona bağla.

Mevcut imza:

```ts
export async function markBookingPaid(
  bookingId: string,
  paymentRef: string
): Promise<{ ok: boolean; error?: string }> {
```

yerine:

```ts
export async function markBookingPaid(
  bookingId: string,
  paymentRef: string,
  opts?: { notify?: boolean; paymentMethod?: string }
): Promise<{ ok: boolean; error?: string }> {
  const notify = opts?.notify ?? true;
```

Aynı fonksiyonda booking güncelleme satırını:

```ts
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "ODENDI", paymentRef },
    }),
```

şununla değiştir:

```ts
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "ODENDI",
        paymentRef,
        ...(opts?.paymentMethod ? { paymentMethod: opts.paymentMethod } : {}),
      },
    }),
```

Ve bildirim bloğunu koşula al. Mevcut:

```ts
  // Onay bildirimi (SMS + e-posta) — best-effort, ödemeyi bloklamaz.
  try {
    const { sendBookingConfirmation } = await import("@/lib/notifications");
    await sendBookingConfirmation(bookingId);
  } catch (e) {
    console.error("[Onay bildirimi hatası]", e);
  }
  return { ok: true };
```

yerine:

```ts
  // Onay bildirimi (SMS + e-posta) — best-effort, ödemeyi bloklamaz.
  if (notify) {
    try {
      const { sendBookingConfirmation } = await import("@/lib/notifications");
      await sendBookingConfirmation(bookingId);
    } catch (e) {
      console.error("[Onay bildirimi hatası]", e);
    }
  }
  return { ok: true };
```

- [ ] **Step 3: `createManualPaidBooking` ekle**

`lib/booking.ts` sonuna ekle (mevcut `createPendingBooking`, `markBookingPaid`, `cancelBooking`'i yeniden kullanır):

```ts
// Admin elden/nakit satış: rezervasyonu oluştur, anında ODENDI + koltukları SATILDI yap.
// Koltuk kilitleme / kontenjan / cinsiyet doğrulaması createPendingBooking'ten gelir.
export async function createManualPaidBooking(
  input: CreateBookingInput & { totalOverride?: number | null }
): Promise<CreateResult> {
  const created = await createPendingBooking(input);
  if (!created.ok) return created;

  const paid = await markBookingPaid(created.bookingId, "NAKIT", {
    notify: false,
    paymentMethod: "NAKIT",
  });
  if (!paid.ok) {
    // Ödeme işaretlenemezse kilitli koltukları serbest bırak.
    await cancelBooking(created.bookingId);
    return { ok: false, error: paid.error ?? "Satış kaydedilemedi." };
  }

  // İsteğe bağlı elle tutar (indirim/pazarlık).
  if (
    input.totalOverride != null &&
    Number.isFinite(input.totalOverride) &&
    input.totalOverride >= 0
  ) {
    await prisma.booking.update({
      where: { id: created.bookingId },
      data: { totalAmount: Math.round(input.totalOverride) },
    });
    return { ok: true, bookingId: created.bookingId, amount: Math.round(input.totalOverride) };
  }

  return created;
}
```

- [ ] **Step 4: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Hata yok. `markBookingPaid`'in mevcut çağrıları (opsiyonsuz) geriye dönük uyumlu kalır.

- [ ] **Step 5: Commit**

```bash
git add lib/tours.ts lib/booking.ts
git commit -m "feat: getTourById + createManualPaidBooking for cash sales"
```

---

## Task 6: `createManualBooking` server action

**Files:**
- Modify: `lib/admin-actions.ts`

**Interfaces:**
- Consumes: `createManualPaidBooking` (Task 5), mevcut `str`/`num`/`optNum`/`requireAdmin`.
- Produces: `createManualBooking(fd: FormData): Promise<void>` — formu parse eder, satış oluşturur, başarıda `/admin/rezervasyonlar`'a redirect eder. Form alanları: `tourId`, `contactName`, `contactPhone`, `contactEmail`, `quantity`, `totalAmount`, `passengers` (JSON), `seatCodes` (JSON). Hata olursa `/admin/rezervasyonlar/yeni?tur=<tourId>&hata=<mesaj>`'a redirect eder.

- [ ] **Step 1: Import ekle**

`lib/admin-actions.ts` üstündeki importlara ekle:

```ts
import { createManualPaidBooking } from "@/lib/booking";
```

- [ ] **Step 2: Action'ı ekle**

`lib/admin-actions.ts` içindeki `// ---- REZERVASYON ----` bölümünün altına, `setBookingStatus`'tan önce ekle:

```ts
interface ManualPassengerInput {
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  seatCode?: string;
  gender?: "E" | "K";
}

export async function createManualBooking(fd: FormData) {
  await requireAdmin();

  const tourId = str(fd, "tourId");
  const tour = await prisma.tour.findUnique({ where: { id: tourId } });
  if (!tour) {
    redirect(`/admin/rezervasyonlar/yeni?hata=${encodeURIComponent("Tur bulunamadı.")}`);
  }

  let rawPassengers: ManualPassengerInput[] = [];
  try {
    const parsed = JSON.parse(str(fd, "passengers") || "[]");
    if (Array.isArray(parsed)) rawPassengers = parsed;
  } catch {
    rawPassengers = [];
  }

  const passengers = rawPassengers
    .filter((p) => p.firstName?.trim() && p.lastName?.trim())
    .map((p) => ({
      firstName: p.firstName!.trim(),
      lastName: p.lastName!.trim(),
      idNumber: p.idNumber?.trim() || undefined,
      seatCode: p.seatCode?.trim() || undefined,
      gender: p.gender === "E" || p.gender === "K" ? p.gender : undefined,
    }));

  let seatCodes: string[] = [];
  try {
    const parsed = JSON.parse(str(fd, "seatCodes") || "[]");
    if (Array.isArray(parsed)) seatCodes = parsed.map((c) => String(c));
  } catch {
    seatCodes = [];
  }

  const totalRaw = fd.get("totalAmount");
  const totalOverride =
    totalRaw != null && totalRaw !== "" ? Number(totalRaw) : null;

  const result = await createManualPaidBooking({
    tourId,
    contactName: str(fd, "contactName"),
    contactPhone: str(fd, "contactPhone"),
    contactEmail: str(fd, "contactEmail"),
    passengers,
    seatCodes: tour!.bookingType === "KOLTUK" ? seatCodes : undefined,
    quantity: tour!.bookingType === "KONTENJAN" ? num(fd, "quantity") : undefined,
    totalOverride,
  });

  if (!result.ok) {
    redirect(
      `/admin/rezervasyonlar/yeni?tur=${tourId}&hata=${encodeURIComponent(result.error)}`
    );
  }

  revalidatePath("/admin/rezervasyonlar");
  revalidatePath("/");
  redirect("/admin/rezervasyonlar");
}
```

> Not: `redirect()` bir istisna fırlatır; `tour!` kullanımının öncesinde `if (!tour) redirect(...)` olduğundan sonrasında `tour` non-null'dır. TS'i memnun etmek için `tour!` kullanılır (mevcut kod deseniyle uyumlu).

- [ ] **Step 3: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Hata yok.

- [ ] **Step 4: Commit**

```bash
git add lib/admin-actions.ts
git commit -m "feat: createManualBooking server action"
```

---

## Task 7: `AdminSaleForm` client bileşeni (koltuk/kontenjan + yolcular + tutar)

**Files:**
- Create: `components/admin/AdminSaleForm.tsx`

**Interfaces:**
- Consumes: `createManualBooking` (Task 6) `action` olarak; `Tour` (shared tipi, serileştirilebilir) prop; `buildSeatGrid`, `formatPrice`, `genderLabel`, `Gender` (`lib/shared`).
- Produces: `default function AdminSaleForm({ tour: Tour; action: (fd: FormData) => void })`. Gizli inputlar: `tourId`, `passengers` (JSON), `seatCodes` (JSON), `quantity`, `totalAmount`. Görünür inputlar: `contactName`, `contactPhone`, `contactEmail`.

- [ ] **Step 1: Bileşeni oluştur**

`components/admin/AdminSaleForm.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  Tour,
  Gender,
  buildSeatGrid,
  formatPrice,
  genderLabel,
} from "@/lib/shared";

interface PassRow {
  seatCode?: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  gender: Gender | "";
}

const emptyRow = (seatCode?: string): PassRow => ({
  seatCode,
  firstName: "",
  lastName: "",
  idNumber: "",
  gender: "",
});

export default function AdminSaleForm({
  tour,
  action,
}: {
  tour: Tour;
  action: (fd: FormData) => void;
}) {
  const isKoltuk = tour.bookingType === "KOLTUK";
  const grid = useMemo(() => (isKoltuk ? buildSeatGrid(tour) : []), [tour, isKoltuk]);

  // KOLTUK: her seçilen koltuk bir yolcu satırı. KONTENJAN: quantity kadar satır.
  const [rows, setRows] = useState<PassRow[]>(isKoltuk ? [] : [emptyRow()]);
  const [quantity, setQuantity] = useState(isKoltuk ? 0 : 1);
  const [totalTouched, setTotalTouched] = useState(false);
  const [total, setTotal] = useState(tour.price);

  const count = isKoltuk ? rows.length : quantity;
  const autoTotal = tour.price * count;
  const shownTotal = totalTouched ? total : autoTotal;

  const capacityLeft =
    tour.bookingType === "KONTENJAN"
      ? Math.max(0, (tour.capacity ?? 0) - (tour.sold ?? 0))
      : undefined;

  function toggleSeat(code: string, status: string) {
    if (status === "SATILDI") return;
    setRows((prev) => {
      const exists = prev.find((r) => r.seatCode === code);
      if (exists) return prev.filter((r) => r.seatCode !== code);
      return [...prev, emptyRow(code)];
    });
  }

  function setQty(q: number) {
    const safe = Math.max(1, Math.min(q, capacityLeft ?? q));
    setQuantity(safe);
    setRows((prev) => {
      const next = [...prev];
      while (next.length < safe) next.push(emptyRow());
      return next.slice(0, safe);
    });
  }

  function updateRow(i: number, patch: Partial<PassRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const seatCodes = isKoltuk ? rows.map((r) => r.seatCode!).filter(Boolean) : [];

  function seatClass(code: string, status: string, gender?: Gender | null) {
    if (status === "SATILDI") return "bg-slate-300 text-slate-500 cursor-not-allowed";
    const picked = rows.find((r) => r.seatCode === code);
    if (picked) return "bg-accent text-white ring-2 ring-accent";
    return "bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
  }

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";
  const label = "block text-xs font-medium text-slate-500";

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tourId" value={tour.id} />
      <input type="hidden" name="passengers" value={JSON.stringify(rows)} />
      <input type="hidden" name="seatCodes" value={JSON.stringify(seatCodes)} />
      <input type="hidden" name="quantity" value={String(count)} />
      <input type="hidden" name="totalAmount" value={String(shownTotal)} />

      {/* Koltuk / kontenjan seçimi */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">
          {isKoltuk ? "Koltuk Seçimi" : "Kişi Sayısı"}
        </h2>

        {isKoltuk ? (
          <div className="space-y-2">
            {grid.map((row, ri) => (
              <div key={ri} className="flex items-center justify-center gap-1.5">
                {row.map((seat, ci) =>
                  seat.code === "aisle" ? (
                    <span key={ci} className="w-4" />
                  ) : (
                    <button
                      key={ci}
                      type="button"
                      disabled={seat.status === "SATILDI"}
                      onClick={() => toggleSeat(seat.code, seat.status)}
                      className={`h-8 w-8 rounded-md text-[10px] font-semibold transition ${seatClass(
                        seat.code,
                        seat.status,
                        seat.gender
                      )}`}
                      title={seat.status === "SATILDI" ? "Dolu" : seat.code}
                    >
                      {seat.code}
                    </button>
                  )
                )}
              </div>
            ))}
            <p className="pt-2 text-center text-xs text-slate-400">
              Yeşil: boş · Turuncu: seçili · Gri: dolu
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={capacityLeft}
              value={quantity}
              onChange={(e) => setQty(Number(e.target.value) || 1)}
              className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <span className="text-sm text-slate-500">
              kişi{capacityLeft != null ? ` (kalan kontenjan: ${capacityLeft})` : ""}
            </span>
          </div>
        )}
      </div>

      {/* İletişim */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">İletişim Bilgileri</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Ad Soyad *
            <input name="contactName" required className={input} />
          </label>
          <label className={label}>
            Telefon *
            <input name="contactPhone" required className={input} placeholder="5xx xxx xx xx" />
          </label>
          <label className={label}>
            E-posta
            <input name="contactEmail" type="email" className={input} />
          </label>
        </div>
      </div>

      {/* Yolcular */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">Yolcular ({count})</h2>
        {count === 0 ? (
          <p className="text-sm text-slate-400">
            {isKoltuk ? "Yukarıdan koltuk seçin." : "Kişi sayısı girin."}
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div
                key={r.seatCode ?? i}
                className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto]"
              >
                <span className="flex items-center text-xs font-semibold text-slate-400">
                  {r.seatCode ? `Koltuk ${r.seatCode}` : `#${i + 1}`}
                </span>
                <input
                  placeholder="Ad"
                  value={r.firstName}
                  onChange={(e) => updateRow(i, { firstName: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  placeholder="Soyad"
                  value={r.lastName}
                  onChange={(e) => updateRow(i, { lastName: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  placeholder={tour.category === "YURT_DISI" ? "TC / Pasaport" : "TC Kimlik No"}
                  value={r.idNumber}
                  onChange={(e) => updateRow(i, { idNumber: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <select
                  value={r.gender}
                  onChange={(e) => updateRow(i, { gender: e.target.value as Gender | "" })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="">Cinsiyet</option>
                  <option value="E">{genderLabel("E")}</option>
                  <option value="K">{genderLabel("K")}</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tutar */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">Toplam Tutar</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            value={shownTotal}
            onChange={(e) => {
              setTotalTouched(true);
              setTotal(Number(e.target.value) || 0);
            }}
            className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <span className="text-sm text-slate-500">
            Otomatik: {formatPrice(autoTotal, tour.currency)} ({count} × {formatPrice(tour.price, tour.currency)})
          </span>
          {totalTouched && (
            <button
              type="button"
              onClick={() => setTotalTouched(false)}
              className="text-xs text-brand hover:underline"
            >
              Otomatiğe dön
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          disabled={count === 0}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-white hover:bg-accent-dark disabled:opacity-50"
        >
          Elden Satışı Kaydet ({formatPrice(shownTotal, tour.currency)})
        </button>
        <a
          href="/admin/rezervasyonlar"
          className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Vazgeç
        </a>
      </div>
    </form>
  );
}
```

> Not: Yan-yana cinsiyet kuralı ve koltuk müsaitliği son kontrolü sunucuda (`createPendingBooking`) yapılır; çakışma olursa action `?hata=` ile geri döner. Bu bileşen istemci tarafında minimum tutulur.

- [ ] **Step 2: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Hata yok. (`seatClass`'ın `gender` parametresi ileride renklendirme için; kullanılmıyorsa lint uyarısı çıkarsa parametreyi kaldır.)

- [ ] **Step 3: Commit**

```bash
git add components/admin/AdminSaleForm.tsx
git commit -m "feat: AdminSaleForm client component for manual sales"
```

---

## Task 8: `/admin/rezervasyonlar/yeni` sayfası (tur seçimi + satış formu)

**Files:**
- Create: `app/admin/(dash)/rezervasyonlar/yeni/page.tsx`

**Interfaces:**
- Consumes: `getPublishedTours` + `getTourById` (`lib/tours.ts`), `createManualBooking` (`lib/admin-actions.ts`), `AdminSaleForm` (Task 7).
- Produces: Sayfa. `?tur` yoksa yayındaki turların seçim listesi; `?tur=<id>` varsa o turun `AdminSaleForm`'u. `?hata=<mesaj>` varsa uyarı gösterir.

- [ ] **Step 1: Sayfayı oluştur**

`app/admin/(dash)/rezervasyonlar/yeni/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedTours, getTourById, formatPrice, formatDate } from "@/lib/tours";
import { createManualBooking } from "@/lib/admin-actions";
import AdminSaleForm from "@/components/admin/AdminSaleForm";

export const dynamic = "force-dynamic";

export default async function NewManualSale({
  searchParams,
}: {
  searchParams: Promise<{ tur?: string; hata?: string }>;
}) {
  const { tur, hata } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/rezervasyonlar" className="text-sm text-slate-500 hover:text-brand">
        ← Rezervasyonlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold text-brand">Elden Satış Ekle</h1>
      <p className="mb-6 text-sm text-slate-500">
        Nakit/elden alınan satışı kayıt altına alın. Kayıt doğrudan “Ödendi” olarak işaretlenir.
      </p>

      {hata && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}

      {!tur ? (
        <TourPicker />
      ) : (
        <SaleFormLoader id={tur} />
      )}
    </div>
  );
}

async function TourPicker() {
  const tours = await getPublishedTours();
  if (tours.length === 0) {
    return <p className="text-sm text-slate-400">Yayında tur yok.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-600">Satış yapılacak turu seçin:</p>
      {tours.map((t) => (
        <Link
          key={t.id}
          href={`/admin/rezervasyonlar/yeni?tur=${t.id}`}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm hover:border-brand hover:bg-slate-50"
        >
          <span>
            <span className="font-semibold text-slate-800">{t.title}</span>
            <span className="ml-2 text-slate-400">
              {formatDate(t.departureDate)} · {t.bookingType === "KOLTUK" ? "Koltuklu" : "Kontenjanlı"}
            </span>
          </span>
          <span className="font-semibold text-accent">{formatPrice(t.price, t.currency)}</span>
        </Link>
      ))}
    </div>
  );
}

async function SaleFormLoader({ id }: { id: string }) {
  const tour = await getTourById(id);
  if (!tour) notFound();
  return (
    <>
      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <p className="font-semibold text-slate-800">{tour.title}</p>
        <p className="text-sm text-slate-400">
          {tour.destination} · {formatDate(tour.departureDate)} ·{" "}
          {formatPrice(tour.price, tour.currency)} / kişi
        </p>
        <Link
          href="/admin/rezervasyonlar/yeni"
          className="mt-1 inline-block text-xs text-brand hover:underline"
        >
          Turu değiştir
        </Link>
      </div>
      <AdminSaleForm tour={tour} action={createManualBooking} />
    </>
  );
}
```

- [ ] **Step 2: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Hata yok.

- [ ] **Step 3: Çalışma-zamanı doğrulama (uçtan uca)**

Run: `npm run dev`, `/admin/rezervasyonlar/yeni` aç.
Expected:
1. Tur seçim listesi görünür. Bir koltuklu tur seç.
2. Koltuk haritası görünür; dolu koltuklar gri/tıklanamaz. 2 boş koltuk seç → 2 yolcu satırı gelir.
3. İletişim + yolcu ad/soyad/TC/cinsiyet doldur. Geçerli TC kullan (örn. 84287922002).
4. Tutar otomatik `2 × fiyat`; elle değiştirip tekrar otomatiğe dönebiliyorsun.
5. Kaydet → `/admin/rezervasyonlar`'a döner; kayıt “Ödendi” + “Nakit”; seçilen koltuklar artık tur detayında dolu.
6. Kontenjanlı bir turda kişi sayısı girip kaydet → kontenjan düşer.
7. Geçersiz TC veya çakışan koltuk cinsiyeti → sayfa `?hata=` mesajıyla döner, kayıt oluşmaz.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(dash)/rezervasyonlar/yeni/page.tsx"
git commit -m "feat: manual cash-sale admin page"
```

---

## Task 9: Rezervasyonlar listesine “Elden Satış Ekle” butonu + ödeme rozeti

**Files:**
- Modify: `app/admin/(dash)/rezervasyonlar/page.tsx`

**Interfaces:**
- Consumes: `booking.paymentMethod` (Task 4).
- Produces: Görsel değişiklik; başlık yanında buton, tabloda “Ödeme” sütunu.

- [ ] **Step 1: Import ekle**

`app/admin/(dash)/rezervasyonlar/page.tsx` üstüne (zaten `Link` import'lu):

```ts
// (Link zaten import edili — ek import gerekmiyor)
```

Dosyanın üstündeki `statusLabel` tanımının altına ödeme etiketleri ekle:

```ts
const payLabel: Record<string, string> = { NAKIT: "Nakit", ONLINE: "Online" };
const payStyle: Record<string, string> = {
  NAKIT: "bg-amber-50 text-amber-700",
  ONLINE: "bg-sky-50 text-sky-700",
};
```

- [ ] **Step 2: Başlık satırına buton ekle**

Şu bloğu:

```tsx
      <h1 className="text-2xl font-bold text-brand">Rezervasyonlar & Satışlar</h1>
      <p className="mt-1 text-sm text-slate-500">
        Gelen tüm rezervasyon ve satış kayıtları.
      </p>
```

şununla değiştir:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Rezervasyonlar & Satışlar</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gelen tüm rezervasyon ve satış kayıtları.
          </p>
        </div>
        <Link
          href="/admin/rezervasyonlar/yeni"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white hover:bg-accent-dark"
        >
          + Elden Satış Ekle
        </Link>
      </div>
```

- [ ] **Step 3: Tabloya “Ödeme” sütunu ekle**

`thead` içindeki başlık satırına, `Durum` `<th>`'inden sonra ekle:

```tsx
                <th className="px-4 py-3">Ödeme</th>
```

`tbody`'de her satırda `Durum` hücresinden (status span'ini içeren `<td>`) sonra ekle:

```tsx
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          payStyle[b.paymentMethod] ?? "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {payLabel[b.paymentMethod] ?? b.paymentMethod}
                      </span>
                    </td>
```

Ayrıca boş-durum satırındaki `colSpan={7}`'i `colSpan={8}` yap.

- [ ] **Step 4: Tip kontrolü + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: Hata yok, build başarılı.

- [ ] **Step 5: Çalışma-zamanı doğrulama**

Run: `npm run dev`, `/admin/rezervasyonlar` aç.
Expected: Başlık yanında “+ Elden Satış Ekle” butonu; tabloda “Ödeme” sütunu; Task 8'de oluşturulan satış “Nakit”, müşteri akışından gelenler “Online” rozetiyle görünür.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(dash)/rezervasyonlar/page.tsx"
git commit -m "feat: add manual-sale button and payment badge to bookings list"
```

---

## Self-Review Notları (kapsam eşleşmesi)

- **Elden satış girişi + tam yolcu + koltuk:** Task 6–8. Koltuk `SATILDI` + çift satış engeli sunucuda (Task 5, `createPendingBooking` transaction) korunur.
- **Otomatik + elle düzeltilebilir tutar:** Task 7 (istemci) + Task 5 (`totalOverride`).
- **Nakit/Online rozeti + paymentMethod:** Task 4 + Task 9.
- **Bildirim gönderilmemesi (elden):** Task 5 (`notify: false`).
- **Çoklu galeri yükleme + sıralama:** Task 1–2.
- **Tur detay yatay afiş şeridi:** Task 3.
- **Test çerçevesi yokluğu:** Global Constraints'te belirtildi; doğrulama lint/tsc/build/manuel.
