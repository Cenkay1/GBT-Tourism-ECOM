// Saf tipler ve yardımcılar — DB'ye bağımlı DEĞİL, client bileşenleri de kullanabilir.

export type Category = "YURT_ICI" | "YURT_DISI";
export type BookingType = "KOLTUK" | "KONTENJAN";
export type SeatStatus = "BOS" | "KILITLI" | "SATILDI";

export interface Tour {
  id: string;
  slug: string;
  title: string;
  destination: string;
  category: Category;
  bookingType: BookingType;
  departureDate: string;
  returnDate?: string;
  departureLocation: string;
  durationDays: number;
  price: number;
  currency: string;
  coverImage: string;
  images: string[];
  description: string;
  highlights: string[];
  status: string;
  capacity?: number;
  sold?: number;
  vehicleType?: VehicleType;
  seatLayout?: string;
  seatRows?: number;
  soldSeats?: string[]; // müsait olmayan (satılı veya kilitli) koltuklar
  seatGenders?: Record<string, Gender>; // dolu koltuk → cinsiyet
  places?: TourPlace[];
}

export type VehicleType = "OTOBUS" | "VIP" | "MINIBUS";

// Araç tipi → koltuk düzeni tanımları
export const VEHICLES: Record<
  VehicleType,
  { label: string; layout: string; left: string[]; right: string[] }
> = {
  OTOBUS: { label: "Otobüs", layout: "2+2", left: ["A", "B"], right: ["C", "D"] },
  VIP: { label: "Lüks / VIP", layout: "2+1", left: ["A", "B"], right: ["C"] },
  MINIBUS: { label: "Minibüs / Küçük", layout: "1+1", left: ["A"], right: ["B"] },
};

export function vehicleLabel(v?: VehicleType | null): string {
  if (!v) return "";
  return VEHICLES[v]?.label ?? "";
}

export function seatsPerRow(v: VehicleType): number {
  return VEHICLES[v].left.length + VEHICLES[v].right.length;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  linkUrl: string;
}

export type Gender = "E" | "K";

export type PlaceType = "DURAK" | "OTEL";

export interface TourPlace {
  id: string;
  type: PlaceType;
  name: string;
  address?: string;
  mapQuery?: string;
  nights?: number;
  sortOrder: number;
}

// Anahtarsız Google Maps gömme URL'i (adres veya "enlem,boylam").
export function mapEmbedUrl(query: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=13&output=embed`;
}

export function mapLinkUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export interface Seat {
  code: string;
  status: SeatStatus;
  gender?: Gender | null;
}

export function genderLabel(g?: string | null): string {
  if (g === "E") return "Erkek";
  if (g === "K") return "Kadın";
  return "";
}

// --- TC Kimlik No doğrulama (resmi algoritma) ---
export function isValidTC(value: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return false;
  const sum10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return sum10 % 10 === d[10];
}

// Kimlik alanı: yurt içinde geçerli TC; yurt dışında pasaport da kabul.
export function isValidId(value: string, allowPassport: boolean): boolean {
  const v = value.trim();
  if (/^\d{11}$/.test(v)) return isValidTC(v);
  if (allowPassport) return /^[A-Za-z0-9]{6,15}$/.test(v);
  return false;
}

// --- Telefon doğrulama (TR cep) ---
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}
export function isValidPhone(value: string): boolean {
  const d = normalizePhone(value);
  if (d.length === 11) return d.startsWith("05");
  if (d.length === 10) return d.startsWith("5");
  return false;
}
export function formatPhone(value: string): string {
  const d = normalizePhone(value);
  const n = d.length === 10 ? "0" + d : d;
  if (n.length !== 11) return value;
  return `0(${n.slice(1, 4)}) ${n.slice(4, 7)} ${n.slice(7, 9)} ${n.slice(9, 11)}`;
}

// --- Yan yana koltuk kuralı ---
// Aynı sıradaki, koridorun aynı tarafındaki bitişik koltuğu döndürür.
export function seatNeighbor(code: string, layout: string): string | null {
  const m = code.match(/^(\d+)([A-Z])$/);
  if (!m) return null;
  const row = m[1];
  const col = m[2];
  const pairs: Record<string, Record<string, string>> = {
    "2+2": { A: "B", B: "A", C: "D", D: "C" },
    "2+1": { A: "B", B: "A" }, // C tek başına
    "1+1": {}, // koridor iki tarafta, komşu yok
  };
  const map = pairs[layout] ?? pairs["2+2"];
  const neighborCol = map[col];
  return neighborCol ? `${row}${neighborCol}` : null;
}

// KOLTUK turları için koltuk düzenini araç tipine göre üret.
export function buildSeatGrid(tour: Tour): Seat[][] {
  if (tour.bookingType !== "KOLTUK" || !tour.seatRows) return [];
  const taken = new Set(tour.soldSeats ?? []);
  const genders = tour.seatGenders ?? {};
  const vt = tour.vehicleType ?? "OTOBUS";
  const { left, right } = VEHICLES[vt] ?? VEHICLES.OTOBUS;
  const rows: Seat[][] = [];
  for (let r = 1; r <= tour.seatRows; r++) {
    const rowSeats: Seat[] = [];
    for (const c of [...left, "aisle", ...right]) {
      if (c === "aisle") {
        rowSeats.push({ code: "aisle", status: "BOS" });
        continue;
      }
      const code = `${r}${c}`;
      const isTaken = taken.has(code);
      rowSeats.push({
        code,
        status: isTaken ? "SATILDI" : "BOS",
        gender: isTaken ? genders[code] ?? null : null,
      });
    }
    rows.push(rowSeats);
  }
  return rows;
}

// Bir araç tipi + sıra için tüm koltuk kodlarını sırayla döndürür.
export function seatCodes(vt: VehicleType, rows: number): string[] {
  const { left, right } = VEHICLES[vt];
  const codes: string[] = [];
  for (let r = 1; r <= rows; r++) {
    for (const c of [...left, ...right]) codes.push(`${r}${c}`);
  }
  return codes;
}

export function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€" };
  return `${price.toLocaleString("tr-TR")} ${symbols[currency] ?? currency}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function categoryLabel(c: Category): string {
  return c === "YURT_ICI" ? "Yurt İçi" : "Yurt Dışı";
}
