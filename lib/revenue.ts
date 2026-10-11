// Ciro paneli için tarih aralığı çözümleme ve gruplama — saf fonksiyonlar, DB'siz.
//
// Tüm gün sınırları Türkiye saatine (UTC+3, yaz saati uygulaması yok) göre
// hesaplanır; sunucu hangi saat diliminde çalışırsa çalışsın "bugün" ve
// "bu ay" acentenin takvimiyle aynı olur.

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 3650;

export const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const MONTHS_LONG = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export type PresetKey =
  | "bugun"
  | "dun"
  | "7gun"
  | "30gun"
  | "buay"
  | "gecenay"
  | "3ay"
  | "6ay"
  | "buyil"
  | "1yil"
  | "tumu";

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "bugun", label: "Bugün" },
  { key: "dun", label: "Dün" },
  { key: "7gun", label: "Son 7 Gün" },
  { key: "30gun", label: "Son 30 Gün" },
  { key: "buay", label: "Bu Ay" },
  { key: "gecenay", label: "Geçen Ay" },
  { key: "3ay", label: "Son 3 Ay" },
  { key: "6ay", label: "Son 6 Ay" },
  { key: "buyil", label: "Bu Yıl" },
  { key: "1yil", label: "Son 1 Yıl" },
  { key: "tumu", label: "Tümü" },
];

export interface DateRange {
  from: Date; // dahil
  to: Date; // hariç
  key: PresetKey | "ozel";
  all: boolean; // "Tümü" — önceki dönemle kıyas yok
}

interface Ymd {
  y: number;
  m: number; // 0-11
  d: number;
}

function partsOf(date: Date): Ymd {
  const t = new Date(date.getTime() + TZ_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}

// Türkiye saatiyle y-m-d 00:00 anının gerçek zamanı.
function startOfDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - TZ_OFFSET_MS);
}

export function parseDateInput(value: string | undefined): Ymd | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return { y, m: m - 1, d };
}

// <input type="date"> değeri: yyyy-mm-dd (Türkiye takvimine göre).
export function toDateInput(date: Date): string {
  const { y, m, d } = partsOf(date);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Çözümleme: özel aralık (baslangic+bitis) varsa o, yoksa ön ayar (donem), yoksa son 30 gün.
// earliest: "Tümü" için ilk satışın tarihi (yoksa son 1 yıl).
export function resolveRange(
  params: { donem?: string; baslangic?: string; bitis?: string },
  now: Date,
  earliest?: Date | null
): DateRange {
  const today = partsOf(now);
  const tomorrow = startOfDay(today.y, today.m, today.d + 1);
  const todayStart = startOfDay(today.y, today.m, today.d);

  const s = parseDateInput(params.baslangic);
  const e = parseDateInput(params.bitis);
  if (s && e) {
    let from = startOfDay(s.y, s.m, s.d);
    let to = startOfDay(e.y, e.m, e.d + 1);
    if (from >= to) {
      // başlangıç > bitiş: yer değiştir
      const f2 = startOfDay(e.y, e.m, e.d);
      const t2 = startOfDay(s.y, s.m, s.d + 1);
      from = f2;
      to = t2;
    }
    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      from = new Date(to.getTime() - MAX_RANGE_DAYS * DAY_MS);
    }
    return { from, to, key: "ozel", all: false };
  }

  const key = (PRESETS.find((p) => p.key === params.donem)?.key ?? "30gun") as PresetKey;
  switch (key) {
    case "bugun":
      return { from: todayStart, to: tomorrow, key, all: false };
    case "dun":
      return { from: new Date(todayStart.getTime() - DAY_MS), to: todayStart, key, all: false };
    case "7gun":
      return { from: new Date(tomorrow.getTime() - 7 * DAY_MS), to: tomorrow, key, all: false };
    case "buay":
      return { from: startOfDay(today.y, today.m, 1), to: tomorrow, key, all: false };
    case "gecenay":
      return {
        from: startOfDay(today.y, today.m - 1, 1),
        to: startOfDay(today.y, today.m, 1),
        key,
        all: false,
      };
    case "3ay":
      return { from: startOfDay(today.y, today.m - 2, 1), to: tomorrow, key, all: false };
    case "6ay":
      return { from: startOfDay(today.y, today.m - 5, 1), to: tomorrow, key, all: false };
    case "buyil":
      return { from: startOfDay(today.y, 0, 1), to: tomorrow, key, all: false };
    case "1yil":
      return { from: startOfDay(today.y - 1, today.m, today.d + 1), to: tomorrow, key, all: false };
    case "tumu": {
      const start = earliest ? partsOf(earliest) : { y: today.y - 1, m: today.m, d: today.d };
      return { from: startOfDay(start.y, start.m, start.d), to: tomorrow, key, all: true };
    }
    case "30gun":
    default:
      return { from: new Date(tomorrow.getTime() - 30 * DAY_MS), to: tomorrow, key: "30gun", all: false };
  }
}

// Karşılaştırma dönemi: aynı uzunlukta, hemen öncesi.
export function previousRange(range: DateRange): { from: Date; to: Date } {
  const len = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - len), to: range.from };
}

// "12 Ekim 2026" biçimli okunur tarih (Türkiye takvimi).
export function formatDay(date: Date): string {
  const { y, m, d } = partsOf(date);
  return `${d} ${MONTHS_LONG[m]} ${y}`;
}

// Başlıkta gösterilecek aralık metni (bitiş gün dahil gösterilir).
export function describeRange(range: DateRange): string {
  const last = new Date(range.to.getTime() - 1);
  const a = formatDay(range.from);
  const b = formatDay(last);
  return a === b ? a : `${a} – ${b}`;
}

export type Granularity = "gun" | "ay" | "yil";

export function granularityFor(range: { from: Date; to: Date }): Granularity {
  const days = (range.to.getTime() - range.from.getTime()) / DAY_MS;
  if (days <= 92) return "gun";
  if (days <= 1830) return "ay";
  return "yil";
}

export interface RevenuePoint {
  key: string;
  label: string; // eksen etiketi
  title: string; // ipucu metni
  value: number; // ciro
  count: number; // satış adedi
}

function keyOf(date: Date, g: Granularity): string {
  const { y, m, d } = partsOf(date);
  if (g === "gun") return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (g === "ay") return `${y}-${String(m + 1).padStart(2, "0")}`;
  return String(y);
}

// Aralığı kesintisiz kovalara böler (satış olmayan günler/aylar da 0 ile görünsün).
export function buildPoints(range: { from: Date; to: Date }, g: Granularity): RevenuePoint[] {
  const points: RevenuePoint[] = [];
  const last = new Date(range.to.getTime() - 1);
  const start = partsOf(range.from);
  const end = partsOf(last);

  if (g === "gun") {
    for (let t = range.from.getTime(); t < range.to.getTime(); t += DAY_MS) {
      const date = new Date(t);
      const p = partsOf(date);
      points.push({
        key: keyOf(date, g),
        label: `${p.d} ${MONTHS_SHORT[p.m]}`,
        title: `${p.d} ${MONTHS_LONG[p.m]} ${p.y}`,
        value: 0,
        count: 0,
      });
    }
  } else if (g === "ay") {
    for (let y = start.y, m = start.m; y < end.y || (y === end.y && m <= end.m); ) {
      points.push({
        key: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: `${MONTHS_SHORT[m]} ${String(y).slice(2)}`,
        title: `${MONTHS_LONG[m]} ${y}`,
        value: 0,
        count: 0,
      });
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  } else {
    for (let y = start.y; y <= end.y; y++) {
      points.push({ key: String(y), label: String(y), title: String(y), value: 0, count: 0 });
    }
  }
  return points;
}

export function aggregate(
  rows: { createdAt: Date; totalAmount: number }[],
  range: { from: Date; to: Date },
  g: Granularity
): RevenuePoint[] {
  const points = buildPoints(range, g);
  const byKey = new Map(points.map((p) => [p.key, p]));
  for (const r of rows) {
    const p = byKey.get(keyOf(r.createdAt, g));
    if (!p) continue;
    p.value += r.totalAmount;
    p.count += 1;
  }
  return points;
}

// Önceki döneme göre değişim yüzdesi; kıyaslanacak veri yoksa null.
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
