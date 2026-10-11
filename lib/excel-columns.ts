// Excel yolcu listesi sütun kataloğu.
//
// Her sütun burada BİR kez tanımlanır: anahtarı, başlığı, genişliği ve değeri
// nasıl üreteceği. Hem indirme route'u hem sütun seçme ekranı bu listeden
// beslenir — böylece ikisi ayrışamaz.
//
// Yeni sütun eklemek: aşağıdaki listeye bir girdi ekleyin, başka yere dokunmayın.

export interface ExcelRowSource {
  passenger: {
    firstName: string;
    lastName: string;
    idNumber: string | null;
    seatCode: string | null;
    gender: string | null;
    birthDate: Date | null;
    country: string | null;
    ageBand: string | null;
    ageVerified: boolean;
    roomIndex: number | null;
  };
  booking: {
    id: string;
    status: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    totalAmount: number;
    boardingName: string | null;
    accommodationType: string | null;
    createdAt: Date;
  };
  departureDate: Date;
  plate: string;
  currency: string;
  index: number; // 1'den başlayan sıra numarası
}

export interface ExcelColumn {
  key: string;
  label: string; // Excel'deki sütun başlığı
  width: number; // karakter genişliği
  group: "Yolcu" | "Sefer" | "İletişim" | "Rezervasyon";
  value: (s: ExcelRowSource) => string | number;
}

const statusLabel: Record<string, string> = {
  ODENDI: "Ödendi",
  BEKLIYOR: "Bekliyor",
  IPTAL: "İptal",
  SURE_DOLDU: "Süre Doldu",
};

const genderLabel: Record<string, string> = { E: "Erkek", K: "Kadın" };

const bandLabel: Record<string, string> = {
  ADULT: "Yetişkin",
  CHILD: "Çocuk",
  INFANT: "Bebek",
};

function trDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("tr-TR") : "";
}

export const EXCEL_COLUMNS: ExcelColumn[] = [
  { key: "sira", label: "Sıra", width: 5, group: "Yolcu", value: (s) => s.index },
  { key: "ad", label: "Ad", width: 14, group: "Yolcu", value: (s) => s.passenger.firstName },
  { key: "soyad", label: "Soyad", width: 14, group: "Yolcu", value: (s) => s.passenger.lastName },
  {
    key: "adSoyad",
    label: "Ad Soyad",
    width: 24,
    group: "Yolcu",
    value: (s) => `${s.passenger.firstName} ${s.passenger.lastName}`.trim(),
  },
  {
    key: "tc",
    label: "TC / Pasaport",
    width: 16,
    group: "Yolcu",
    value: (s) => s.passenger.idNumber ?? "",
  },
  {
    key: "cinsiyet",
    label: "Cinsiyet",
    width: 9,
    group: "Yolcu",
    value: (s) => genderLabel[s.passenger.gender ?? ""] ?? "",
  },
  {
    key: "dogumTarihi",
    label: "Doğum Tarihi",
    width: 13,
    group: "Yolcu",
    value: (s) => trDate(s.passenger.birthDate),
  },
  {
    key: "ulke",
    label: "Ülke",
    width: 14,
    group: "Yolcu",
    value: (s) => s.passenger.country ?? "",
  },
  {
    key: "yasGrubu",
    label: "Yaş Grubu",
    width: 11,
    group: "Yolcu",
    value: (s) => bandLabel[s.passenger.ageBand ?? ""] ?? "",
  },
  {
    key: "yasOnayi",
    label: "Yaş Onayı",
    width: 11,
    group: "Yolcu",
    value: (s) =>
      !s.passenger.ageBand || s.passenger.ageBand === "ADULT"
        ? ""
        : s.passenger.ageVerified
          ? "Onaylı"
          : "Bekliyor",
  },
  {
    key: "oda",
    label: "Oda",
    width: 9,
    group: "Yolcu",
    value: (s) => (s.passenger.roomIndex != null ? `${s.passenger.roomIndex + 1}. Oda` : ""),
  },
  {
    key: "koltuk",
    label: "Koltuk",
    width: 8,
    group: "Sefer",
    value: (s) => s.passenger.seatCode ?? "",
  },
  {
    key: "sefer",
    label: "Sefer",
    width: 12,
    group: "Sefer",
    value: (s) => trDate(s.departureDate),
  },
  { key: "arac", label: "Araç", width: 12, group: "Sefer", value: (s) => s.plate },
  {
    key: "binis",
    label: "Biniş",
    width: 18,
    group: "Sefer",
    value: (s) => s.booking.boardingName ?? "",
  },
  {
    key: "konaklama",
    label: "Konaklama",
    width: 13,
    group: "Sefer",
    value: (s) =>
      s.booking.accommodationType === "SINGLE"
        ? "Tek kişilik"
        : s.booking.accommodationType === "MULTI"
          ? "Birden fazla"
          : "",
  },
  {
    key: "iletisimAd",
    label: "İletişim (Ad Soyad)",
    width: 20,
    group: "İletişim",
    value: (s) => s.booking.contactName,
  },
  {
    key: "telefon",
    label: "Telefon",
    width: 16,
    group: "İletişim",
    value: (s) => s.booking.contactPhone,
  },
  {
    key: "eposta",
    label: "E-posta",
    width: 26,
    group: "İletişim",
    value: (s) => s.booking.contactEmail,
  },
  {
    key: "durum",
    label: "Durum",
    width: 10,
    group: "Rezervasyon",
    value: (s) => statusLabel[s.booking.status] ?? s.booking.status,
  },
  {
    key: "tutar",
    label: "Tutar",
    width: 10,
    group: "Rezervasyon",
    value: (s) => s.booking.totalAmount,
  },
  {
    key: "paraBirimi",
    label: "Para Birimi",
    width: 10,
    group: "Rezervasyon",
    value: (s) => s.currency,
  },
  {
    key: "rezervasyonNo",
    label: "Rezervasyon No",
    width: 16,
    group: "Rezervasyon",
    value: (s) => s.booking.id.slice(-8).toUpperCase(),
  },
  {
    key: "kayitTarihi",
    label: "Kayıt Tarihi",
    width: 12,
    group: "Rezervasyon",
    value: (s) => trDate(s.booking.createdAt),
  },
];

const BY_KEY = new Map(EXCEL_COLUMNS.map((c) => [c.key, c]));

export function columnByKey(key: string): ExcelColumn | undefined {
  return BY_KEY.get(key);
}

// Hiç seçim yapılmamışsa kullanılan sütunlar (eski çıktının özü).
export const DEFAULT_COLUMN_KEYS = [
  "sira",
  "sefer",
  "arac",
  "binis",
  "ad",
  "soyad",
  "tc",
  "cinsiyet",
  "koltuk",
  "telefon",
  "durum",
];

// Hazır şablon örneği: otele gönderilen liste (oda ve konaklama odaklı).
export const HOTEL_TEMPLATE_KEYS = [
  "sira",
  "adSoyad",
  "tc",
  "cinsiyet",
  "dogumTarihi",
  "oda",
  "konaklama",
];

// İstemciden gelen sütun listesini güvene alır: bilinmeyen anahtarlar atılır,
// yinelenenler teke iner, sıra KULLANICININ verdiği sıradır (şablonun anlamı bu).
// Hiç geçerli anahtar kalmazsa varsayılana düşer — boş Excel üretmeyiz.
export function resolveColumns(keys: string[] | undefined | null): ExcelColumn[] {
  const wanted = Array.isArray(keys) ? keys : [];
  const seen = new Set<string>();
  const out: ExcelColumn[] = [];
  for (const k of wanted) {
    if (typeof k !== "string" || seen.has(k)) continue;
    const col = BY_KEY.get(k);
    if (!col) continue;
    seen.add(k);
    out.push(col);
  }
  if (out.length === 0) {
    return DEFAULT_COLUMN_KEYS.map((k) => BY_KEY.get(k)!).filter(Boolean);
  }
  return out;
}

// Sütun anahtarlarını saklamak/okumak için JSON yardımcıları.
export function encodeColumnKeys(keys: string[]): string {
  return JSON.stringify(resolveColumns(keys).map((c) => c.key));
}

export function decodeColumnKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

// Seçili sütunlara göre tek bir satır üretir (Excel'e verilecek nesne).
export function buildRow(
  columns: ExcelColumn[],
  source: ExcelRowSource
): Record<string, string | number> {
  const row: Record<string, string | number> = {};
  for (const c of columns) row[c.label] = c.value(source);
  return row;
}
