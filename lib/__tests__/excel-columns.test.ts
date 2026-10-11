import { describe, it, expect } from "vitest";
import {
  EXCEL_COLUMNS,
  DEFAULT_COLUMN_KEYS,
  HOTEL_TEMPLATE_KEYS,
  buildRow,
  columnByKey,
  decodeColumnKeys,
  encodeColumnKeys,
  resolveColumns,
  type ExcelRowSource,
} from "@/lib/excel-columns";

const source: ExcelRowSource = {
  passenger: {
    firstName: "Ayşe",
    lastName: "Yılmaz",
    idNumber: "11111111110",
    seatCode: "12",
    gender: "K",
    birthDate: new Date("1990-05-17T00:00:00Z"),
    country: "Türkiye",
    ageBand: "ADULT",
    ageVerified: false,
    roomIndex: 2,
  },
  booking: {
    id: "cmabcdef12345678",
    status: "ODENDI",
    contactName: "Mehmet Yılmaz",
    contactPhone: "5551112233",
    contactEmail: "m@example.com",
    totalAmount: 7500,
    boardingName: "Dudullu Terminal",
    accommodationType: "SINGLE",
    createdAt: new Date("2026-10-01T09:00:00Z"),
  },
  departureDate: new Date("2026-11-20T17:00:00Z"),
  plate: "34 ABC 123",
  currency: "TRY",
  index: 1,
};

describe("sütun kataloğu", () => {
  it("anahtarlar benzersizdir", () => {
    const keys = EXCEL_COLUMNS.map((c) => c.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("başlıklar benzersizdir (Excel'de sütun çakışmasın)", () => {
    const labels = EXCEL_COLUMNS.map((c) => c.label);

    expect(new Set(labels).size).toBe(labels.length);
  });

  it("varsayılan ve otel şablonundaki her anahtar katalogda vardır", () => {
    for (const k of [...DEFAULT_COLUMN_KEYS, ...HOTEL_TEMPLATE_KEYS]) {
      expect(columnByKey(k), `eksik anahtar: ${k}`).toBeDefined();
    }
  });

  it("her sütun kendi değerini üretebilir (hiçbiri patlamaz)", () => {
    for (const c of EXCEL_COLUMNS) {
      expect(() => c.value(source)).not.toThrow();
    }
  });
});

describe("resolveColumns", () => {
  it("seçim sırasını korur — şablonun anlamı budur", () => {
    const cols = resolveColumns(["tc", "ad", "soyad"]);

    expect(cols.map((c) => c.key)).toEqual(["tc", "ad", "soyad"]);
  });

  it("bilinmeyen anahtarları atar", () => {
    const cols = resolveColumns(["ad", "uydurma", "soyad"]);

    expect(cols.map((c) => c.key)).toEqual(["ad", "soyad"]);
  });

  it("yinelenen anahtarı teke indirir", () => {
    const cols = resolveColumns(["ad", "ad", "soyad"]);

    expect(cols.map((c) => c.key)).toEqual(["ad", "soyad"]);
  });

  it("hiç geçerli anahtar yoksa varsayılana düşer (boş Excel üretilmez)", () => {
    const cols = resolveColumns(["tamamen", "gecersiz"]);

    expect(cols.map((c) => c.key)).toEqual(DEFAULT_COLUMN_KEYS);
  });

  it("boş/null girdide varsayılana düşer", () => {
    expect(resolveColumns([]).length).toBeGreaterThan(0);
    expect(resolveColumns(null).length).toBeGreaterThan(0);
    expect(resolveColumns(undefined).length).toBeGreaterThan(0);
  });
});

describe("şablon saklama (encode/decode)", () => {
  it("gidiş-dönüş seçimi korur", () => {
    const keys = ["adSoyad", "tc", "oda"];

    expect(decodeColumnKeys(encodeColumnKeys(keys))).toEqual(keys);
  });

  it("encode sırasında geçersiz anahtar temizlenir", () => {
    expect(decodeColumnKeys(encodeColumnKeys(["ad", "yok", "soyad"]))).toEqual([
      "ad",
      "soyad",
    ]);
  });

  it("bozuk JSON okunduğunda çökmez", () => {
    expect(decodeColumnKeys("{bozuk")).toEqual([]);
    expect(decodeColumnKeys(null)).toEqual([]);
    expect(decodeColumnKeys('"metin"')).toEqual([]);
  });
});

describe("buildRow", () => {
  it("yalnız seçili sütunları, seçilen sırayla üretir", () => {
    const row = buildRow(resolveColumns(["adSoyad", "tc", "oda"]), source);

    expect(Object.keys(row)).toEqual(["Ad Soyad", "TC / Pasaport", "Oda"]);
    expect(row["Ad Soyad"]).toBe("Ayşe Yılmaz");
    expect(row["TC / Pasaport"]).toBe("11111111110");
    expect(row["Oda"]).toBe("3. Oda");
  });

  it("otel şablonu otelin ihtiyaç duyduğu alanları verir", () => {
    const row = buildRow(resolveColumns(HOTEL_TEMPLATE_KEYS), source);

    expect(Object.keys(row)).toContain("Ad Soyad");
    expect(Object.keys(row)).toContain("Oda");
    expect(Object.keys(row)).not.toContain("Telefon");
    expect(Object.keys(row)).not.toContain("Tutar");
  });

  it("boş alanlar hata değil boş metin olur", () => {
    const bos: ExcelRowSource = {
      ...source,
      passenger: {
        ...source.passenger,
        idNumber: null,
        gender: null,
        birthDate: null,
        country: null,
        ageBand: null,
        roomIndex: null,
        seatCode: null,
      },
      booking: { ...source.booking, boardingName: null, accommodationType: null },
    };

    const row = buildRow(resolveColumns(["tc", "cinsiyet", "dogumTarihi", "oda", "koltuk"]), bos);

    expect(Object.values(row).every((v) => v === "")).toBe(true);
  });

  it("yetişkinde yaş onayı sütunu boş, çocukta durum yazar", () => {
    const cocuk: ExcelRowSource = {
      ...source,
      passenger: { ...source.passenger, ageBand: "CHILD", ageVerified: false },
    };

    expect(buildRow(resolveColumns(["yasOnayi"]), source)["Yaş Onayı"]).toBe("");
    expect(buildRow(resolveColumns(["yasOnayi"]), cocuk)["Yaş Onayı"]).toBe("Bekliyor");
  });
});
