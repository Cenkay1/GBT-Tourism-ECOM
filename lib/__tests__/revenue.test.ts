import { describe, it, expect } from "vitest";
import {
  resolveRange,
  previousRange,
  granularityFor,
  buildPoints,
  aggregate,
  percentChange,
  toDateInput,
  describeRange,
} from "@/lib/revenue";

// 15 Ekim 2026 14:30 Türkiye saati = 11:30 UTC
const NOW = new Date("2026-10-15T11:30:00Z");

describe("resolveRange", () => {
  it("bugün: Türkiye gün sınırları", () => {
    const r = resolveRange({ donem: "bugun" }, NOW);
    expect(r.from.toISOString()).toBe("2026-10-14T21:00:00.000Z"); // 15 Eki 00:00 TR
    expect(r.to.toISOString()).toBe("2026-10-15T21:00:00.000Z");
  });

  it("gece yarısından sonra (UTC önceki gün) doğru günü seçer", () => {
    // 16 Ekim 01:00 TR = 15 Ekim 22:00 UTC
    const r = resolveRange({ donem: "bugun" }, new Date("2026-10-15T22:00:00Z"));
    expect(toDateInput(r.from)).toBe("2026-10-16");
  });

  it("bu ay / geçen ay", () => {
    const buAy = resolveRange({ donem: "buay" }, NOW);
    expect(toDateInput(buAy.from)).toBe("2026-10-01");
    const gecen = resolveRange({ donem: "gecenay" }, NOW);
    expect(toDateInput(gecen.from)).toBe("2026-09-01");
    expect(toDateInput(gecen.to)).toBe("2026-10-01");
  });

  it("son 7 gün bugün dahil 7 gündür", () => {
    const r = resolveRange({ donem: "7gun" }, NOW);
    expect((r.to.getTime() - r.from.getTime()) / 86400000).toBe(7);
    expect(toDateInput(r.from)).toBe("2026-10-09");
  });

  it("özel aralık: bitiş günü dahildir", () => {
    const r = resolveRange({ baslangic: "2026-10-01", bitis: "2026-10-10" }, NOW);
    expect(r.key).toBe("ozel");
    expect((r.to.getTime() - r.from.getTime()) / 86400000).toBe(10);
  });

  it("başlangıç bitişten büyükse yer değiştirir", () => {
    const r = resolveRange({ baslangic: "2026-10-10", bitis: "2026-10-01" }, NOW);
    expect(toDateInput(r.from)).toBe("2026-10-01");
    expect(describeRange(r)).toBe("1 Ekim 2026 – 10 Ekim 2026");
  });

  it("geçersiz tarih ya da bilinmeyen dönem → son 30 gün", () => {
    expect(resolveRange({ baslangic: "2026-13-40", bitis: "x" }, NOW).key).toBe("30gun");
    expect(resolveRange({ donem: "bilinmez" }, NOW).key).toBe("30gun");
  });

  it("tümü ilk satıştan başlar", () => {
    const r = resolveRange({ donem: "tumu" }, NOW, new Date("2025-03-20T10:00:00Z"));
    expect(r.all).toBe(true);
    expect(toDateInput(r.from)).toBe("2025-03-20");
  });

  it("önceki dönem aynı uzunlukta ve bitişik", () => {
    const r = resolveRange({ donem: "7gun" }, NOW);
    const p = previousRange(r);
    expect(p.to.getTime()).toBe(r.from.getTime());
    expect(r.to.getTime() - r.from.getTime()).toBe(r.from.getTime() - p.from.getTime());
  });
});

describe("gruplama", () => {
  it("granülarite: gün / ay / yıl", () => {
    expect(granularityFor(resolveRange({ donem: "30gun" }, NOW))).toBe("gun");
    expect(granularityFor(resolveRange({ donem: "1yil" }, NOW))).toBe("ay");
    expect(
      granularityFor({ from: new Date("2018-01-01"), to: new Date("2026-01-01") })
    ).toBe("yil");
  });

  it("satış olmayan günler de 0 ile gelir; satışlar doğru güne yazılır", () => {
    const range = resolveRange({ baslangic: "2026-10-01", bitis: "2026-10-05" }, NOW);
    const points = aggregate(
      [
        { createdAt: new Date("2026-10-02T09:00:00Z"), totalAmount: 1000 },
        { createdAt: new Date("2026-10-02T21:30:00Z"), totalAmount: 500 }, // 3 Eki 00:30 TR
        { createdAt: new Date("2026-10-04T10:00:00Z"), totalAmount: 250 },
        { createdAt: new Date("2026-11-01T10:00:00Z"), totalAmount: 999 }, // aralık dışı
      ],
      range,
      "gun"
    );
    expect(points).toHaveLength(5);
    expect(points.map((p) => p.value)).toEqual([0, 1000, 500, 250, 0]);
    expect(points[1].count).toBe(1);
    expect(points[0].title).toBe("1 Ekim 2026");
  });

  it("aylık kovalar yıl sınırını geçer", () => {
    const points = buildPoints(
      { from: new Date("2025-11-01T00:00:00+03:00"), to: new Date("2026-03-01T00:00:00+03:00") },
      "ay"
    );
    expect(points.map((p) => p.key)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("percentChange", () => {
  it("artış, düşüş ve kıyas yok", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 0)).toBeNull();
  });
});
