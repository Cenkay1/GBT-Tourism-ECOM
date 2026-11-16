# Faz 1 — Karşı Cins Koltuk Uyarısı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yan yana cinsiyet kuralını müşteriye koltuğu seçmeden ÖNCE göstermek; kısıtlı koltuk artık "boş" görünmesin.

**Architecture:** Kural tek bir saf fonksiyona (`allowedGendersFor`) taşınır ve mesaj metni tek bir yerden (`genderBlockMessage`) üretilir. `SeatMap` bu fonksiyonu her boş koltuk için çağırıp koltuğu görsel olarak kısıtlar ve cinsiyet penceresinde yasaklı butonu pasifleştirir. Faz 2 (sepet) ve Faz 3 (devir) aynı iki fonksiyonu sunucu tarafında çağıracak, böylece müşteri her yerde birebir aynı mesajı görür.

**Tech Stack:** Next.js (App Router), React 19 client component, TypeScript, Vitest, Tailwind.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-14-devir-cinsiyet-sepet-design.md` bölüm 2.
- Kural ve veri modeli DEĞİŞMEZ — bu faz tamamen görünürlük işi. `Seat`, `Booking`, `Passenger` şemasına dokunulmaz.
- Mevcut davranış korunur: "aynı rezervasyonda seçilen koltuklar birbirini bağlamaz" (`exclude` parametresi bunun içindir).
- Mesaj dili Türkçe, mevcut `genderLabel()` çıktısıyla ("Erkek" / "Kadın") tutarlı.
- Vitest yalnız `lib/**/*.test.ts` dosyalarını görür (`vitest.config.ts`). Bileşen değişiklikleri `npm run lint` + `npm run build` ile doğrulanır.
- Yerelde komut çalıştırırken `DATABASE_URL="file:./dev.db"` öneki gerekir (`.env` canlı yolu gösteriyor).
- Commit YAPILMAZ — git'i kullanıcı yönetiyor. "Commit" adımları yerine değişiklikleri doğrulayıp durun.

---

### Task 1: `allowedGendersFor` + `genderBlockMessage`

Yan yana kuralını saf fonksiyona çıkar. `SeatMap` içindeki `conflictReason()` bugün aynı işi yapıyor ama hem bileşene gömülü hem de "hangi cinsiyetler mümkün" sorusunu cevaplayamıyor — sadece seçilmiş bir cinsiyeti onaylıyor/reddediyor. Yeni fonksiyon soruyu tersine çevirir: "bu koltuğa hangi cinsiyet oturabilir?"

**Files:**
- Modify: `lib/shared.ts` (`seatNeighbors` tanımının hemen altına, satır ~413)
- Test: `lib/__tests__/seat-gender.test.ts` (yeni)

**Interfaces:**
- Consumes: `seatNeighbors(code, { seatMap, layout })`, `genderLabel(g)`, `Gender`, `SeatMapRows` — hepsi `lib/shared.ts` içinde mevcut.
- Produces:
  - `export interface SeatGenderRule { E: boolean; K: boolean; blockedBy: { E: string[]; K: string[] } }`
  - `export function allowedGendersFor(code: string, src: { seatMap?: SeatMapRows | null; layout?: string | null }, takenGenders: Record<string, Gender>, exclude?: Set<string>): SeatGenderRule`
  - `export function genderBlockMessage(code: string, gender: Gender, rule: SeatGenderRule): string | null`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/seat-gender.test.ts` dosyasını oluştur:

```ts
import { describe, it, expect } from "vitest";
import { allowedGendersFor, genderBlockMessage } from "@/lib/shared";
import type { Gender, SeatMapRows } from "@/lib/shared";

describe("allowedGendersFor — harfli düzen (2+2)", () => {
  const src = { layout: "2+2" };

  it("komşu boşsa iki cinsiyet de mümkün", () => {
    const r = allowedGendersFor("3A", src, {});
    expect(r.E).toBe(true);
    expect(r.K).toBe(true);
    expect(r.blockedBy).toEqual({ E: [], K: [] });
  });

  it("komşuda kadın varsa erkek seçilemez", () => {
    const r = allowedGendersFor("3A", src, { "3B": "K" });
    expect(r.E).toBe(false);
    expect(r.K).toBe(true);
    expect(r.blockedBy.E).toEqual(["3B"]);
  });

  it("komşuda erkek varsa kadın seçilemez", () => {
    const r = allowedGendersFor("3A", src, { "3B": "E" });
    expect(r.K).toBe(false);
    expect(r.E).toBe(true);
    expect(r.blockedBy.K).toEqual(["3B"]);
  });

  it("koridorun karşısı komşu değildir", () => {
    // 2+2 düzeninde B ile C arasında koridor var.
    const r = allowedGendersFor("3B", src, { "3C": "K" });
    expect(r.E).toBe(true);
    expect(r.K).toBe(true);
  });

  it("2+1 düzeninde C koltuğu tek başınadır, kural bağlamaz", () => {
    const r = allowedGendersFor("3C", { layout: "2+1" }, { "3B": "K" });
    expect(r.E).toBe(true);
    expect(r.K).toBe(true);
  });

  it("1+1 düzeninde komşu yoktur", () => {
    const r = allowedGendersFor("3A", { layout: "1+1" }, { "3B": "K" });
    expect(r.E).toBe(true);
    expect(r.K).toBe(true);
  });

  it("exclude edilen komşu kuralı bağlamaz (kendi sepetindeki koltuk)", () => {
    const r = allowedGendersFor("3A", src, { "3B": "K" }, new Set(["3B"]));
    expect(r.E).toBe(true);
    expect(r.blockedBy.E).toEqual([]);
  });
});

describe("allowedGendersFor — serbest plan", () => {
  // 1 ve 2 yan yana, "" koridor, 3 ve 4 yan yana. (parseSeatMap JSON bekliyor;
  // testte plan doğrudan literal olarak kuruluyor.)
  const seatMap: SeatMapRows = [
    ["1", "2", "", "3", "4"],
    ["5", "6", "", "7", "8"],
  ];

  it("plandaki bitişik koltuk komşudur", () => {
    const r = allowedGendersFor("1", { seatMap }, { "2": "K" });
    expect(r.E).toBe(false);
    expect(r.blockedBy.E).toEqual(["2"]);
  });

  it("koridorun iki yanı komşu değildir", () => {
    const r = allowedGendersFor("2", { seatMap }, { "3": "K" });
    expect(r.E).toBe(true);
  });

  it("ortadaki koltuğun iki komşusu da sayılır", () => {
    const r = allowedGendersFor("3", { seatMap }, { "4": "E" });
    expect(r.K).toBe(false);
    expect(r.blockedBy.K).toEqual(["4"]);
  });

  it("iki yanında farklı cinsiyetler varsa hiçbir cinsiyet mümkün değildir", () => {
    const wide: SeatMapRows = [["1", "2", "3"]];
    const r = allowedGendersFor("2", { seatMap: wide }, { "1": "E", "3": "K" });
    expect(r.E).toBe(false);
    expect(r.K).toBe(false);
    expect(r.blockedBy.E).toEqual(["3"]);
    expect(r.blockedBy.K).toEqual(["1"]);
  });

  it("planda olmayan koltuk için kural yoktur", () => {
    const r = allowedGendersFor("99", { seatMap }, { "2": "K" });
    expect(r.E).toBe(true);
    expect(r.K).toBe(true);
  });
});

describe("genderBlockMessage", () => {
  it("engel yoksa null döner", () => {
    const rule = allowedGendersFor("3A", { layout: "2+2" }, {});
    expect(genderBlockMessage("3A", "E", rule)).toBeNull();
  });

  it("engelleyen koltuğu ve karşı cinsi yazar", () => {
    const rule = allowedGendersFor("3A", { layout: "2+2" }, { "3B": "K" });
    const msg = genderBlockMessage("3A", "E", rule)!;
    expect(msg).toContain("3B");
    expect(msg).toContain("Kadın");
    expect(msg).toContain("3A");
    expect(msg).toContain("Erkek");
  });

  it("birden fazla engelleyen koltuğu virgülle listeler", () => {
    const seatMap: SeatMapRows = [["1", "2", "3"]];
    const rule = allowedGendersFor("2", { seatMap }, { "1": "K", "3": "K" });
    const msg = genderBlockMessage("2", "E", rule)!;
    expect(msg).toContain("1, 3");
  });

  it("her iki cinsiyet için de mesaj üretir", () => {
    const rule = allowedGendersFor("3A", { layout: "2+2" }, { "3B": "E" });
    const g: Gender = "K";
    expect(genderBlockMessage("3A", g, rule)).toContain("Erkek");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL="file:./dev.db" npx vitest run lib/__tests__/seat-gender.test.ts`
Expected: FAIL — `allowedGendersFor is not a function` / `No "allowedGendersFor" export is defined on the "@/lib/shared" mock` benzeri bir içe aktarma hatası.

- [ ] **Step 3: Write minimal implementation**

`lib/shared.ts` içinde, `seatNeighbors` fonksiyonunun kapanış süslü parantezinden (satır ~413) hemen sonra ekle:

```ts
// Bir koltuğa hangi cinsiyetin oturabileceği. seatNeighbors ile bulunan BİTİŞİK
// koltuklardaki YABANCI yolcuların cinsiyetine bakılır: yanında kadın oturan bir
// koltuğa erkek, yanında erkek oturan bir koltuğa kadın oturamaz.
//
// Neden "hangi cinsiyet mümkün" diye soruyoruz: müşteri koltuğa basmadan önce
// kısıtlamayı görmeli. Seçimden sonra reddetmek koltuğu boş gösterip müşteriyi
// tekrar denemeye itiyordu.
//
// exclude: kuralı bağlamayacak komşular — müşterinin KENDİ sepetindeki/seçtiği
// koltuklar. Aynı rezervasyonda seyahat edenler yan yana karışık oturabilir.
export interface SeatGenderRule {
  E: boolean;
  K: boolean;
  // Hangi komşu koltuk hangi cinsiyeti engelliyor (mesaj bundan kurulur).
  blockedBy: { E: string[]; K: string[] };
}

export function allowedGendersFor(
  code: string,
  src: { seatMap?: SeatMapRows | null; layout?: string | null },
  takenGenders: Record<string, Gender>,
  exclude?: Set<string>
): SeatGenderRule {
  const blockedBy: { E: string[]; K: string[] } = { E: [], K: [] };
  for (const neighbor of seatNeighbors(code, src)) {
    if (exclude?.has(neighbor)) continue;
    const g = takenGenders[neighbor];
    if (g !== "E" && g !== "K") continue;
    // Komşuda kadın varsa ERKEK engellenir, erkek varsa KADIN engellenir.
    if (g === "K") blockedBy.E.push(neighbor);
    else blockedBy.K.push(neighbor);
  }
  return {
    E: blockedBy.E.length === 0,
    K: blockedBy.K.length === 0,
    blockedBy,
  };
}

// Engelin müşteriye gösterilecek gerekçesi. İstemci (koltuk şeması) ve sunucu
// (sepete ekleme, devir) aynı metni üretsin diye tek yerde duruyor.
export function genderBlockMessage(
  code: string,
  gender: Gender,
  rule: SeatGenderRule
): string | null {
  const blockers = rule.blockedBy[gender];
  if (blockers.length === 0) return null;
  const neighborGender: Gender = gender === "E" ? "K" : "E";
  return `${blockers.join(", ")} koltuğunda ${genderLabel(neighborGender)} bir yolcu var. Yan yana farklı cinsiyet oturamayacağı için ${code} koltuğunu ${genderLabel(gender)} olarak seçemezsiniz.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL="file:./dev.db" npx vitest run lib/__tests__/seat-gender.test.ts`
Expected: PASS — 16 test.

- [ ] **Step 5: Tüm test paketini çalıştır (regresyon kontrolü)**

Run: `DATABASE_URL="file:./dev.db" npm test`
Expected: Mevcut testlerin hepsi geçmeye devam eder. `lib/shared.ts`'e yalnız ekleme yapıldı, mevcut hiçbir imza değişmedi.

- [ ] **Step 6: Değişikliği doğrula, commit etme**

Run: `git status --short`
Expected: `M lib/shared.ts` ve `?? lib/__tests__/seat-gender.test.ts`. Commit kullanıcıya bırakılır.

---

### Task 2: `SeatMap` — kısıtlı koltuğu görsel olarak işaretle

Boş ama cinsiyet kısıtlı koltuk artık düz yeşil görünmez. Hiçbir cinsiyetin mümkün olmadığı koltuk tıklanamaz hale gelir.

**Files:**
- Modify: `components/SeatMap.tsx` (import bloğu satır 4-14; `conflictReason` satır 92-102; `seatClasses` satır 124-140; koltuk `<button>` satır 176-193; `Legend` şeridi satır 198-204)

**Interfaces:**
- Consumes: Task 1'den `allowedGendersFor`, `genderBlockMessage`, `SeatGenderRule`.
- Produces: `SeatMap` içinde `ruleFor(code: string): SeatGenderRule` yardımcısı ve `seatTitle(code, status, gender)` — Task 3 `ruleFor`'u cinsiyet penceresinde kullanır.

> **Yürütme düzeltmesi (2026-11-14):** `chooseGender`'ın `conflictReason` yerine
> `genderBlockMessage` kullanmaya geçmesi bu task'a alındı. Aslen Task 3'teydi,
> ama `conflictReason` burada silindiği için Task 3'e bırakılsaydı Task 2
> derlenmezdi. Task 3 artık yalnız cinsiyet penceresinin arayüzünü değiştiriyor.

- [ ] **Step 1: İçe aktarmaları güncelle**

`components/SeatMap.tsx` satır 4-14'teki import bloğunda `seatNeighbors` yerine yeni fonksiyonları al. Yeni blok:

```tsx
import {
  Tour,
  TourDeparture,
  Gender,
  SeatGenderRule,
  buildSeatGrid,
  formatPrice,
  vehicleLabel,
  allowedGendersFor,
  genderBlockMessage,
  genderLabel,
} from "@/lib/shared";
```

- [ ] **Step 2: Kural haritasını kur, `conflictReason`'ı değiştir**

`conflictReason` fonksiyonunu (satır 92-102) tamamen sil ve yerine şunu koy. `selectedCodes` kendi seçimlerini kuraldan düşer — "aynı rezervasyonda seçilenler serbest" kuralı budur.

```tsx
  // Kendi seçtiğim koltuklar kuralı bağlamaz: aynı rezervasyonda seyahat
  // edenler yan yana karışık oturabilir.
  const selectedCodes = useMemo(
    () => new Set(selected.map((s) => s.code)),
    [selected]
  );

  function ruleFor(code: string): SeatGenderRule {
    return allowedGendersFor(code, { seatMap, layout }, takenGenders, selectedCodes);
  }
```

- [ ] **Step 3: Tamamen kapalı koltuğu tıklanamaz yap**

`onSeatClick` (satır 77-90) içinde, `MAX_SEATS` kontrolünden sonra, `setPicking(code)` çağrısından hemen önce şunu ekle:

```tsx
    const rule = ruleFor(code);
    if (!rule.E && !rule.K) {
      setWarning(
        `${code} koltuğunun iki yanında farklı cinsiyette yolcular var; bu koltuk seçilemiyor.`
      );
      return;
    }
```

- [ ] **Step 4: Koltuk görünümünü kısıtlamaya göre boya**

`seatClasses` fonksiyonunu (satır 124-140) şununla değiştir. Boş koltuk hâlâ yeşil, ama kısıtlıysa kenarlık rengi hangi cinsiyetin oturabileceğini söylüyor; hiçbiri mümkün değilse koltuk kapalı görünüyor.

```tsx
  function seatClasses(code: string, status: string, gender?: Gender | null) {
    if (isSelected(code)) {
      const g = selected.find((s) => s.code === code)!.gender;
      return g === "K" ? "bg-pink-600 text-white" : "bg-blue-600 text-white";
    }
    if (status === "BLOKE") {
      return "cursor-not-allowed bg-slate-200 text-slate-400 line-through";
    }
    if (status === "SATILDI") {
      if (gender === "K") return "cursor-not-allowed bg-pink-200 text-pink-700";
      if (gender === "E") return "cursor-not-allowed bg-blue-200 text-blue-800";
      return "cursor-not-allowed bg-slate-300 text-slate-500";
    }
    // Boş koltuk: yan yana kuralı hangi cinsiyete izin veriyor?
    const rule = ruleFor(code);
    if (!rule.E && !rule.K) {
      return "cursor-not-allowed bg-slate-200 text-slate-400";
    }
    if (!rule.E) {
      return "bg-emerald-100 text-emerald-800 ring-2 ring-inset ring-pink-400 hover:bg-emerald-200";
    }
    if (!rule.K) {
      return "bg-emerald-100 text-emerald-800 ring-2 ring-inset ring-blue-400 hover:bg-emerald-200";
    }
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
  }
```

- [ ] **Step 5: `title` ve `disabled` değerlerini kısıtlamaya bağla**

Koltuk `<button>`'unu (satır 176-193) şununla değiştir:

```tsx
                      <button
                        key={c}
                        onClick={() => onSeatClick(seat.code, seat.status)}
                        disabled={
                          seat.status === "SATILDI" ||
                          seat.status === "BLOKE" ||
                          (seat.status === "BOS" &&
                            !ruleFor(seat.code).E &&
                            !ruleFor(seat.code).K)
                        }
                        title={seatTitle(seat.code, seat.status, seat.gender)}
                        className={`h-8 w-8 rounded-md text-[10px] font-semibold transition ${seatClasses(seat.code, seat.status, seat.gender)}`}
                      >
                        {seat.code}
                      </button>
```

Ve `seatClasses`'ın hemen üstüne `seatTitle` yardımcısını ekle:

```tsx
  function seatTitle(code: string, status: string, gender?: Gender | null) {
    if (status === "BLOKE") return `${code} — satışa kapalı`;
    if (status === "SATILDI")
      return `${code} — dolu${gender ? " (" + genderLabel(gender) + ")" : ""}`;
    const rule = ruleFor(code);
    if (!rule.E && !rule.K)
      return `${code} — iki yanında farklı cinsiyette yolcular var, seçilemiyor`;
    if (!rule.E) return `${code} — yanında kadın yolcu var, sadece kadın seçebilirsiniz`;
    if (!rule.K) return `${code} — yanında erkek yolcu var, sadece erkek seçebilirsiniz`;
    return code;
  }
```

- [ ] **Step 6: Açıklama şeridine iki rozet ekle**

Satır 198-204'teki `Legend` listesine, "Kapalı" satırından önce ekle:

```tsx
          <Legend className="bg-emerald-100 ring-2 ring-inset ring-pink-400" label="Sadece kadın" />
          <Legend className="bg-emerald-100 ring-2 ring-inset ring-blue-400" label="Sadece erkek" />
```

- [ ] **Step 7: Lint ve derleme**

Run: `npm run lint`
Expected: `components/SeatMap.tsx` için hata yok. `seatNeighbors` artık kullanılmadığı için import'tan çıkarıldığına dikkat et (kullanılmayan import lint hatası verir).

Run: `npx tsc --noEmit`
Expected: çıktı yok, exit 0.

> **Yürütme düzeltmesi (2026-11-14):** `npm run build` bu makinede kökteki bozuk
> `.venv/bin/python` sembolik bağı yüzünden Turbopack hatasıyla düşüyor; hata
> koddan bağımsız. Tip doğrulaması için `npx tsc --noEmit` kullanılıyor.

---

### Task 3: `SeatMap` — cinsiyet penceresinde yasaklı butonu pasifleştir

Müşteri "Erkek"e basıp reddedilmesin; basmadan önce neden basamayacağını görsün.

**Files:**
- Modify: `components/SeatMap.tsx` (`chooseGender` satır 104-113; cinsiyet penceresi satır 248-298)

**Interfaces:**
- Consumes: Task 2'den `ruleFor(code)`, Task 1'den `genderBlockMessage`.
- Produces: yok (faz burada kapanır).

- [ ] **Step 1: `chooseGender`'ı savunma katmanı olarak koru**

`chooseGender` (satır 104-113) yeni mesaj üreticisini kullanacak şekilde değişir. Buton pasif olduğu için bu yol normalde çalışmaz; yine de bırakılır (kural tek yerde kalsın).

```tsx
  function chooseGender(gender: Gender) {
    if (!picking) return;
    const reason = genderBlockMessage(picking, gender, ruleFor(picking));
    if (reason) {
      setWarning(reason);
      setPicking(null);
      return;
    }
    setSelected((prev) => [...prev, { code: picking, gender }]);
    setPicking(null);
  }
```

- [ ] **Step 2: Pencerede butonları kurala bağla**

Cinsiyet penceresindeki (satır 248-298) iki butonu ve açıklamayı şununla değiştir. `pickRule` pencere açıkken bir kez hesaplanır.

```tsx
      {picking && (() => {
        const pickRule = ruleFor(picking);
        const blockedMsg =
          (!pickRule.E && genderBlockMessage(picking, "E", pickRule)) ||
          (!pickRule.K && genderBlockMessage(picking, "K", pickRule)) ||
          null;
        return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPicking(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-slate-500">Koltuk</p>
            <p className="text-2xl font-extrabold text-brand">{picking}</p>
            <p className="mt-2 text-sm text-slate-600">Yolcunun cinsiyetini seçin</p>
            {blockedMsg && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-800">
                {blockedMsg}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => chooseGender("E")}
                disabled={!pickRule.E}
                title={pickRule.E ? "" : genderBlockMessage(picking, "E", pickRule) ?? ""}
                className="rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                Erkek
              </button>
              <button
                onClick={() => chooseGender("K")}
                disabled={!pickRule.K}
                title={pickRule.K ? "" : genderBlockMessage(picking, "K", pickRule) ?? ""}
                className="rounded-xl bg-pink-600 py-3 text-sm font-bold text-white transition enabled:hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                Kadın
              </button>
            </div>
            <button
              onClick={() => setPicking(null)}
              className="mt-3 text-xs text-slate-400 hover:text-slate-600"
            >
              Vazgeç
            </button>
          </div>
        </div>
        );
      })()}
```

- [ ] **Step 3: Lint ve derleme**

Run: `npm run lint && DATABASE_URL="file:./dev.db" npm run build`
Expected: ikisi de temiz.

- [ ] **Step 4: Gerçek veriyle elle doğrula**

Run: `DATABASE_URL="file:./dev.db" npm run dev`

Koltuklu bir turun sayfasını aç ve şunları gör:
1. Dolu (kadın) bir koltuğun yanındaki boş koltuk pembe kenarlıklı; üzerine gelince "sadece kadın seçebilirsiniz" yazıyor.
2. O koltuğa basınca açılan pencerede "Erkek" butonu **pasif** ve gerekçe pencerede yazıyor.
3. "Kadın" seçilince koltuk normal şekilde seçime giriyor.
4. Açıklama şeridinde "Sadece kadın" / "Sadece erkek" rozetleri görünüyor.
5. Kendi seçtiğin bir koltuğun yanındaki koltukta kısıtlama **yok** (aynı rezervasyon serbest).

- [ ] **Step 5: Durumu bildir**

Run: `git status --short && DATABASE_URL="file:./dev.db" npm test`
Expected: Değişen dosyalar `lib/shared.ts`, `components/SeatMap.tsx`, yeni `lib/__tests__/seat-gender.test.ts`. Tüm testler geçer. Commit kullanıcıya bırakılır.
