// Saf tipler ve yardımcılar — DB'ye bağımlı DEĞİL, client bileşenleri de kullanabilir.

export type Category = "YURT_ICI" | "YURT_DISI";
export type BookingType = "KOLTUK" | "KONTENJAN";
export type SeatStatus = "BOS" | "KILITLI" | "SATILDI" | "BLOKE";

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
  doorAfterRow?: number;
  backRowFull?: boolean;
  seatMap?: SeatMapRows; // araçtan gelen serbest koltuk planı (yoksa eski üretilmiş düzen)
  busId?: string; // turun varsayılan aracı
  bus?: Bus; // çözümlenmiş araç (varsayılan)
  documents?: TourDocument[]; // tur programı dosyaları (PDF/Word)
  hasAccommodation?: boolean;
  singleSupplement?: number;
  departures?: TourDeparture[]; // turun seferleri (kalkış/dönüş çiftleri)
  soldSeats?: string[]; // müsait olmayan (satılı veya kilitli) koltuklar
  blockedSeats?: string[]; // admin tarafından online satışa kapatılmış koltuklar (BLOKE)
  seatGenders?: Record<string, Gender>; // dolu koltuk → cinsiyet
  places?: TourPlace[];
  features: string[]; // seçili özellik id'leri
  excludedFeatures: string[]; // fiyata dahil OLMAYAN özellik id'leri
  amenities?: Amenity[]; // çözümlenmiş özellik nesneleri (detay sayfası için)
  excludedAmenities?: Amenity[]; // fiyata dahil olmayan çözümlenmiş özellikler
}

// Tura eklenen belge (tur programı, sözleşme eki…). PDF veya Word.
export interface TourDocument {
  name: string; // görünen ad (dosya adı)
  url: string; // /api/uploads/<dosya>
  size?: number; // bayt
}

// Bir turun ayrı seferi. Koltuk durumu ve kontenjan sefer bazlıdır.
export interface TourDeparture {
  id: string;
  departureDate: string;
  returnDate?: string;
  capacity?: number; // KONTENJAN: sefere özel kontenjan (yoksa turun kontenjanı)
  status: string; // AKTIF | KAPALI
  sortOrder: number;
  // Araç: sefere özel otobüs seçilmemişse turun varsayılan otobüsü kullanılır.
  // Aşağıdaki düzen alanları etkin araçtan çözümlenmiş hâlidir.
  busId?: string;
  bus?: Bus;
  vehicleType?: VehicleType;
  seatLayout?: string;
  seatRows?: number;
  doorAfterRow?: number;
  backRowFull?: boolean;
  seatMap?: SeatMapRows;
  isPast?: boolean; // kalkış tarihi geçti → arşiv (satışa kapalı)
  sold?: number; // KONTENJAN: bu seferde satılan/kilitli kişi sayısı
  soldSeats?: string[];
  blockedSeats?: string[];
  seatGenders?: Record<string, Gender>;
}

// Bir seferin koltuk durumu — buildSeatGrid'e tur yerine sefer durumu vermek için.
// Otobüs sefer bazında değişebildiği için araç düzeni de buradan gelebilir.
export interface SeatState {
  soldSeats?: string[];
  blockedSeats?: string[];
  seatGenders?: Record<string, Gender>;
  vehicleType?: VehicleType;
  seatRows?: number;
  doorAfterRow?: number;
  backRowFull?: boolean;
  seatMap?: SeatMapRows;
}

// Bir seferin etkin araç düzeni: sefer > tur sırasıyla çözümlenir.
export function seatLayoutOf(
  tour: Tour,
  dep?: TourDeparture
): { vehicleType: VehicleType; seatLayout: string; seatRows: number; doorAfterRow?: number; backRowFull: boolean; seatMap?: SeatMapRows } {
  const vehicleType = dep?.vehicleType ?? tour.vehicleType ?? "OTOBUS";
  return {
    vehicleType,
    seatLayout: dep?.seatLayout ?? tour.seatLayout ?? VEHICLES[vehicleType].layout,
    seatRows: dep?.seatRows ?? tour.seatRows ?? 0,
    doorAfterRow: dep?.doorAfterRow ?? tour.doorAfterRow,
    backRowFull: dep?.backRowFull ?? tour.backRowFull ?? false,
    seatMap: dep?.seatMap ?? tour.seatMap,
  };
}

// Seferin satılabilir kalan kontenjanı (KONTENJAN turları).
export function departureSeatsLeft(tour: Tour, dep: TourDeparture): number {
  const cap = dep.capacity ?? tour.capacity ?? 0;
  return Math.max(0, cap - (dep.sold ?? 0));
}

// Tura eklenebilecek özellik/hizmet (Konaklama, Kahvaltı, Rehber…).
export interface Amenity {
  id: string;
  name: string;
  icon: string; // emoji (opsiyonel)
  active: boolean;
  sortOrder: number;
}

// Acentenin filosundaki araç. Koltuk düzeni ve plaka burada tutulur.
export interface Bus {
  id: string;
  name: string;
  plate: string;
  vehicleType: VehicleType;
  seatLayout: string;
  seatRows: number;
  doorAfterRow?: number;
  backRowFull: boolean;
  seatMap?: SeatMapRows; // serbest koltuk planı: hücre = koltuk numarası, "" = boşluk
  notes: string;
  active: boolean;
}

// Bir araç için okunur etiket: "34 ABC 123 · 45 koltuk (2+2)".
export function busLabel(b: Bus): string {
  return `${b.plate} · ${busSeatCount(b)} koltuk (${b.seatLayout})`;
}

export function busSeatCount(b: Bus): number {
  if (b.seatMap) return seatMapCodes(b.seatMap).length;
  const perRow = seatsPerRow(b.vehicleType);
  return b.seatRows * perRow + (b.backRowFull ? 1 : 0);
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

// Rezervasyonun ödeme yöntemi. ONLINE = müşterinin sitedeki iyzico ödemesi;
// NAKIT / HAVALE = elden satışta ödeme alındı; KREDI_KARTI = elden satışta
// kart iyzico'nun güvenli sayfasında girildi.
export type PaymentMethod = "ONLINE" | "NAKIT" | "HAVALE" | "KREDI_KARTI";

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; badge: string; color: string }> = {
  ONLINE: { label: "Online (iyzico)", badge: "bg-sky-50 text-sky-700", color: "#0284c7" },
  NAKIT: { label: "Nakit", badge: "bg-amber-50 text-amber-700", color: "#d97706" },
  HAVALE: { label: "Havale / EFT", badge: "bg-violet-50 text-violet-700", color: "#7c3aed" },
  KREDI_KARTI: { label: "Kredi Kartı (elden)", badge: "bg-emerald-50 text-emerald-700", color: "#059669" },
};

export function paymentMethodLabel(m: string): string {
  return PAYMENT_METHODS[m as PaymentMethod]?.label ?? m;
}

export type PlaceType = "BINIS" | "GEZI" | "OTEL";

export interface TourPlace {
  id: string;
  type: PlaceType;
  name: string;
  address?: string;
  mapQuery?: string;
  nights?: number;
  price?: number; // BINIS için biniş noktası bazlı kişi başı fiyat
  boardingTime?: string; // BINIS için otobüsün orada olacağı saat, "HH:MM"
  showOnMap?: boolean; // GEZI için haritada gösterilsin mi
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

// --- Serbest koltuk planı ---
// Otobüs düzeni artık elle çizilir: her satır bir dizi hücre, hücre ya koltuk
// numarasıdır ("12") ya da boşluktur (""; koridor / boş yer). Koltuk kodu
// yalnızca bu numaradır. seatMap'i olmayan eski araçlar harfli (1A, 1B…)
// üretilmiş düzenle çalışmaya devam eder.
export type SeatMapRows = string[][];

export const SEAT_MAP_MAX_ROWS = 30;
export const SEAT_MAP_MAX_COLS = 9;

// JSON metni ya da dizi alır; geçerliyse sütunları eşitlenmiş planı, değilse null döndürür.
export function parseSeatMap(raw: unknown): SeatMapRows | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > SEAT_MAP_MAX_ROWS) {
    return null;
  }
  const seen = new Set<string>();
  const rows: SeatMapRows = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length === 0 || row.length > SEAT_MAP_MAX_COLS) return null;
    const cells: string[] = [];
    for (const cell of row) {
      const label = typeof cell === "number" ? String(cell) : typeof cell === "string" ? cell.trim() : null;
      if (label === null) return null;
      if (label !== "") {
        if (!/^[1-9]\d{0,2}$/.test(label)) return null; // yalnız sayı (1–999)
        if (seen.has(label)) return null; // her numara tek koltuk
        seen.add(label);
      }
      cells.push(label);
    }
    rows.push(cells);
  }
  if (seen.size === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
}

// Plandaki koltuk numaraları (satır satır, soldan sağa).
export function seatMapCodes(map: SeatMapRows): string[] {
  return map.flat().filter(Boolean);
}

// "2+2", "2+1" gibi kısa etiket: en sık görülen satır deseninden türetilir.
export function seatMapLayoutLabel(map: SeatMapRows): string {
  const counts = new Map<string, number>();
  for (const row of map) {
    const groups: number[] = [];
    let run = 0;
    for (const cell of row) {
      if (cell) run++;
      else if (run) {
        groups.push(run);
        run = 0;
      }
    }
    if (run) groups.push(run);
    if (groups.length === 0) continue;
    const key = groups.join("+");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [key, n] of counts) {
    if (n > bestCount) {
      best = key;
      bestCount = n;
    }
  }
  return best || "özel";
}

// Eski (harfli) düzeni plan olarak döndürür — koltuk kodları 1A, 1B, 3M…
export function legacySeatMap(vt: VehicleType, rows: number, backRowFull = false): SeatMapRows {
  const { left, right } = VEHICLES[vt] ?? VEHICLES.OTOBUS;
  const out: SeatMapRows = [];
  for (let r = 1; r <= rows; r++) {
    const mid = backRowFull && r === rows ? `${r}M` : "";
    out.push([...left.map((c) => `${r}${c}`), mid, ...right.map((c) => `${r}${c}`)]);
  }
  return out;
}

// Koltukları satır satır 1, 2, 3… diye yeniden numaralar (boşluklar korunur).
export function renumberSeatMap(map: SeatMapRows): SeatMapRows {
  let n = 0;
  return map.map((row) => row.map((cell) => (cell ? String(++n) : "")));
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

// Bir koltuğun yanındaki (aralarında boşluk olmayan) koltuklar. Serbest planda
// soldaki ve sağdaki bitişik hücreye bakılır; plan yoksa eski harfli kurala düşer.
export function seatNeighbors(
  code: string,
  src: { seatMap?: SeatMapRows | null; layout?: string | null }
): string[] {
  if (src.seatMap) {
    for (const row of src.seatMap) {
      const c = row.indexOf(code);
      if (c < 0) continue;
      return [row[c - 1], row[c + 1]].filter((x): x is string => Boolean(x));
    }
    return [];
  }
  const n = seatNeighbor(code, src.layout ?? "2+2");
  return n ? [n] : [];
}

function seatCell(
  code: string,
  taken: Set<string>,
  blocked: Set<string>,
  genders: Record<string, Gender>
): Seat {
  const isTaken = taken.has(code);
  const isBlocked = !isTaken && blocked.has(code);
  return {
    code,
    status: isTaken ? "SATILDI" : isBlocked ? "BLOKE" : "BOS",
    gender: isTaken ? genders[code] ?? null : null,
  };
}

// KOLTUK turları için koltuk düzenini üret: araçta serbest plan varsa o, yoksa
// araç tipine göre eski düzen. Boşluklar { code: "aisle" } olarak döner.
export function buildSeatGrid(tour: Tour, state?: SeatState): Seat[][] {
  if (tour.bookingType !== "KOLTUK") return [];
  // Sıra sayısı ve araç tipi sefere (otobüse) göre değişebilir.
  const map = state?.seatMap ?? tour.seatMap;
  const rowCount = state?.seatRows ?? tour.seatRows;
  const backRowFull = state?.backRowFull ?? tour.backRowFull;
  if (!map && !rowCount) return [];
  // Sefer durumu verildiyse onu kullan; yoksa tur üzerindeki (tek seferli) duruma düş.
  const taken = new Set(state?.soldSeats ?? tour.soldSeats ?? []);
  const blocked = new Set(state?.blockedSeats ?? tour.blockedSeats ?? []);
  const genders = state?.seatGenders ?? tour.seatGenders ?? {};
  const vt = state?.vehicleType ?? tour.vehicleType ?? "OTOBUS";
  const plan = map ?? legacySeatMap(vt, rowCount ?? 0, backRowFull ?? false);
  return plan.map((row) =>
    row.map((code) =>
      code ? seatCell(code, taken, blocked, genders) : { code: "aisle", status: "BOS" as const }
    )
  );
}

// Bir araç tipi + sıra için tüm koltuk kodlarını sırayla döndürür (eski düzen).
export function seatCodes(vt: VehicleType, rows: number, backRowFull = false): string[] {
  const { left, right } = VEHICLES[vt];
  const codes: string[] = [];
  for (let r = 1; r <= rows; r++) {
    for (const c of [...left, ...right]) codes.push(`${r}${c}`);
    if (backRowFull && r === rows) codes.push(`${r}M`);
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

// Tarih + saat: "12 Ekim 2026, 20:00". Kalkış/dönüş saatleri müşteriye
// gösterilirken bu kullanılır (yalnız tarih yeterli değil).
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Yalnız saat: "20:00".
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "HH:MM" biçimini doğrula (biniş saati girişi).
export function isValidClockTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());
}

export function categoryLabel(c: Category): string {
  return c === "YURT_ICI" ? "Yurt İçi" : "Yurt Dışı";
}

// --- Yaş / fiyatlandırma ---
export function ageOn(birthDate: string, ref: string): number {
  const b = new Date(birthDate);
  const r = new Date(ref);
  let age = r.getFullYear() - b.getFullYear();
  const m = r.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age--;
  return age;
}

// --- Yaş bantları ---
// Yetişkin 12+, Çocuk 4-12 (12 dahil değil), Bebek 0-3.
export type AgeBand = "ADULT" | "CHILD" | "INFANT";

export const CHILD_MIN_AGE = 4; // bu yaştan itibaren çocuk
export const ADULT_MIN_AGE = 12; // bu yaştan itibaren yetişkin
export const CHILD_DISCOUNT = 0.5; // çocuk indirimi (2+ yetişkin şartıyla)
export const CHILD_DISCOUNT_MIN_ADULTS = 2; // indirim için gereken yetişkin sayısı
export const ROOM_MAX_GUESTS = 3; // bir odada en fazla kişi (bebek dahil)

export function bandForAge(age: number): AgeBand {
  if (age < CHILD_MIN_AGE) return "INFANT";
  if (age < ADULT_MIN_AGE) return "CHILD";
  return "ADULT";
}

export function bandLabel(b: AgeBand): string {
  if (b === "ADULT") return "Yetişkin";
  if (b === "CHILD") return "Çocuk";
  return "Bebek";
}

export function bandAgeText(b: AgeBand): string {
  if (b === "ADULT") return `${ADULT_MIN_AGE}+ yaş`;
  if (b === "CHILD") return `${CHILD_MIN_AGE}-${ADULT_MIN_AGE} yaş`;
  return `0-${CHILD_MIN_AGE - 1} yaş`;
}

// --- Oda planı ---
// Oda YALNIZCA "kaç kişi" tutar; yaş grubu ayrıca girilmez, her yolcunun
// DOĞUM TARİHİNDEN hesaplanır (tek doğruluk kaynağı). "3|2" = ilk odada 3,
// ikinci odada 2 kişi. Yolcular sırayla odalara yerleşir.
export type RoomPlan = number[];

export function roomsTotal(rooms: RoomPlan): number {
  return rooms.reduce((s, n) => s + n, 0);
}

// Yolcu sırasını oda indeksine eşler: [3,2] → [0,0,0,1,1]
export function roomIndexes(rooms: RoomPlan): number[] {
  const out: number[] = [];
  rooms.forEach((n, i) => {
    for (let k = 0; k < n; k++) out.push(i);
  });
  return out;
}

// Yolcuları odalara dağıtır. Önce HER ODAYA BİR YETİŞKİN yerleştirir, sonra
// kalanları sırayla doldurur — böylece çocuk/bebek hiçbir odada tek başına
// kalmaz ve müşteri yolcu sırasıyla uğraşmak zorunda kalmaz.
// Dönen dizi: yolcu indeksi → oda indeksi.
export function assignRooms(rooms: RoomPlan, bands: AgeBand[]): number[] {
  const assignment = new Array<number>(bands.length).fill(0);
  const capacity = [...rooms];
  const adults: number[] = [];
  const others: number[] = [];
  bands.forEach((b, i) => (b === "ADULT" ? adults : others).push(i));

  let next = 0;
  for (let room = 0; room < rooms.length && next < adults.length; room++) {
    assignment[adults[next++]] = room;
    capacity[room]--;
  }

  // Kalan yetişkinler, ardından çocuk/bebekler boş kapasiteye sırayla yerleşir.
  let room = 0;
  for (const passenger of [...adults.slice(next), ...others]) {
    while (room < capacity.length && capacity[room] <= 0) room++;
    if (room >= capacity.length) break; // kapasite yetmiyor → validateRooms yakalar
    assignment[passenger] = room;
    capacity[room]--;
  }
  return assignment;
}

// "3|2" ⇄ oda planı (URL'de ve rezervasyon kaydında taşımak için).
export function encodeRooms(rooms: RoomPlan): string {
  return rooms.join("|");
}

// Ayrıştırma sadıktır: geçersiz odalar SESSİZCE ATILMAZ, olduğu gibi döner ki
// validateRooms onları reddedebilsin (aksi halde 4 kişilik oda gönderen bir
// istemci doğrulamayı tümden atlatabilirdi).
export function decodeRooms(raw?: string | null): RoomPlan {
  if (!raw?.trim()) return [];
  return raw
    .split("|")
    .map((part) => Math.max(0, Math.round(Number(part.trim()) || 0)));
}

// Oda planı geçerli mi? Her oda 1..ROOM_MAX_GUESTS kişi olmalı.
// `bands` verilirse (yolcuların doğum tarihlerinden hesaplanmış yaş grupları)
// oda sayısının yetişkin sayısını aşmadığı da denetlenir: yolcular odalara
// assignRooms ile dağıtıldığında her odaya bir yetişkin düşmesi gerekir,
// çünkü çocuk/bebek tek başına odada kalamaz.
export function validateRooms(rooms: RoomPlan, bands?: AgeBand[]): string | null {
  if (rooms.length === 0) return "En az bir oda ekleyin.";
  for (let i = 0; i < rooms.length; i++) {
    if (rooms[i] < 1) return `${i + 1}. oda boş.`;
    if (rooms[i] > ROOM_MAX_GUESTS)
      return `${i + 1}. odada en fazla ${ROOM_MAX_GUESTS} kişi olabilir.`;
  }
  if (bands) {
    const adults = bands.filter((b) => b === "ADULT").length;
    if (rooms.length > adults)
      return adults === 0
        ? "Rezervasyonda en az bir yetişkin olmalı."
        : `${rooms.length} oda için en az ${rooms.length} yetişkin gerekir (şu an ${adults} yetişkin var). Çocuk veya bebek tek başına odada kalamaz.`;
  }
  return null;
}

export interface PricePassenger {
  birthDate?: string | null;
  // Yaş doğrulama belgesi (kimlik fotoğrafı) yüklendi mi? Çocuk indirimi ve
  // bebek ücretsizliği belgeye bağlıdır: belge yoksa TAM ücret uygulanır.
  hasIdDocument?: boolean;
}

export interface PriceResult {
  total: number;
  // fullFare: yaş indirimi uygulanmadı (belge yok) → tam ücret alındı.
  perPassenger: { fare: number; isChild: boolean; band: AgeBand; fullFare: boolean }[];
  childCount: number;
  infantCount: number;
  adultCount: number;
  supplement: number;
  singleRooms: number; // tek kişilik konaklanan oda sayısı
  unverifiedCount: number; // belge beklendiği için tam ücret alınan yolcu sayısı
}

// Bu yolcu için yaş doğrulama belgesi gerekiyor mu? (yalnız çocuk ve bebek)
export function needsIdDocument(band: AgeBand): boolean {
  return band !== "ADULT";
}

// Bir yolcunun yaş bandı YALNIZCA doğum tarihinden hesaplanır — ayrıca yaş
// grubu girilmez. Doğum tarihi yoksa yetişkin (tam ücret) sayılır.
export function passengerBand(
  p: { birthDate?: string | null },
  departureDate: string
): AgeBand {
  if (p.birthDate) return bandForAge(ageOn(p.birthDate, departureDate));
  return "ADULT";
}

// Rezervasyon tutarını hesaplar (saf; hem istemci hem sunucu kullanır).
// Yetişkin (12+): tam ücret. Çocuk (4-12): rezervasyonda >=2 yetişkin varsa %50.
// Bebek (0-3): her zaman ücretsiz.
// Konaklamalı turda tek kişi kalan her oda için tek kişilik farkı eklenir.
export function priceBooking(input: {
  unitPrice: number;
  departureDate: string;
  passengers: PricePassenger[];
  rooms?: RoomPlan; // konaklamalı turda oda planı (oda başına kişi sayısı)
  accommodationType?: "SINGLE" | "MULTI" | null; // oda dağılımı yoksa eski davranış
  singleSupplement?: number;
}): PriceResult {
  const { unitPrice, departureDate, passengers } = input;
  const bands = passengers.map((p) => passengerBand(p, departureDate));
  const adultCount = bands.filter((b) => b === "ADULT").length;
  const discount = adultCount >= CHILD_DISCOUNT_MIN_ADULTS;
  const childFare = Math.round(unitPrice * CHILD_DISCOUNT);

  const perPassenger = bands.map((band, i) => {
    // Yaş indirimi belgeye bağlıdır: çocuk/bebek için kimlik belgesi
    // yüklenmediyse yolcu tam ücret öder.
    const missingDoc = needsIdDocument(band) && passengers[i].hasIdDocument === false;
    const fare = missingDoc
      ? unitPrice
      : band === "INFANT"
      ? 0
      : band === "CHILD" && discount
      ? childFare
      : unitPrice;
    return { band, isChild: band === "CHILD", fare, fullFare: missingDoc };
  });
  const base = perPassenger.reduce((s, p) => s + p.fare, 0);

  // Tek kişilik farkı: oda dağılımı varsa tek kişilik oda başına, yoksa eski
  // "SINGLE / MULTI" seçimine göre bir kez.
  const rooms = input.rooms ?? [];
  const singleRooms = rooms.length
    ? rooms.filter((n) => n === 1).length
    : input.accommodationType === "SINGLE"
    ? 1
    : 0;
  const supplement = singleRooms * (input.singleSupplement ?? 0);

  return {
    total: base + supplement,
    perPassenger,
    childCount: bands.filter((b) => b === "CHILD").length,
    infantCount: bands.filter((b) => b === "INFANT").length,
    adultCount,
    supplement,
    singleRooms,
    unverifiedCount: perPassenger.filter((p) => p.fullFare).length,
  };
}
