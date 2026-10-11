import { describe, it, expect } from "vitest";
import {
  buildSeatGrid,
  seatCodes,
  seatNeighbor,
  seatNeighbors,
  parseSeatMap,
  seatMapCodes,
  seatMapLayoutLabel,
  legacySeatMap,
  renumberSeatMap,
} from "@/lib/shared";
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

describe("serbest koltuk planı", () => {
  const map = [
    ["1", "2", "", "3", "4"],
    ["5", "", "", "", "6"],
    ["7", "8", "9", "10", "11"],
  ];

  it("parseSeatMap geçerli planı döndürür, tekrar/harf/boş planı reddeder", () => {
    expect(parseSeatMap(JSON.stringify(map))).toEqual(map);
    expect(parseSeatMap([["1", "1"]])).toBeNull(); // tekrar
    expect(parseSeatMap([["1A", "2"]])).toBeNull(); // harf
    expect(parseSeatMap([["", ""]])).toBeNull(); // koltuk yok
    expect(parseSeatMap("bozuk")).toBeNull();
  });

  it("farklı uzunluktaki satırları eşitler", () => {
    expect(parseSeatMap([["1", "2"], ["3"]])).toEqual([["1", "2"], ["3", ""]]);
  });

  it("buildSeatGrid planı olduğu gibi çizer; boşluklar aisle olur", () => {
    const rows = buildSeatGrid(tour({ seatMap: map }));
    expect(rows).toHaveLength(3);
    expect(rows[0].map((s) => s.code)).toEqual(["1", "2", "aisle", "3", "4"]);
    expect(rows[2].map((s) => s.code)).toEqual(["7", "8", "9", "10", "11"]);
  });

  it("satılan/bloke durumu numaraya göre işlenir", () => {
    const rows = buildSeatGrid(tour({ seatMap: map }), {
      soldSeats: ["2"],
      blockedSeats: ["3"],
      seatGenders: { "2": "K" },
    });
    expect(rows[0][1]).toMatchObject({ code: "2", status: "SATILDI", gender: "K" });
    expect(rows[0][3]).toMatchObject({ code: "3", status: "BLOKE" });
  });

  it("seatMapCodes ve düzen etiketi", () => {
    expect(seatMapCodes(map)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    expect(seatMapLayoutLabel([["1", "2", "", "3", "4"], ["5", "6", "", "7", "8"]])).toBe("2+2");
  });

  it("komşuluk: yalnız aralarında boşluk olmayan bitişik koltuklar", () => {
    const src = { seatMap: map };
    expect(seatNeighbors("1", src)).toEqual(["2"]);
    expect(seatNeighbors("2", src)).toEqual(["1"]); // sağında boşluk
    expect(seatNeighbors("5", src)).toEqual([]); // tek başına
    expect(seatNeighbors("9", src)).toEqual(["8", "10"]);
  });

  it("plan yokken eski harfli kurala düşer", () => {
    expect(seatNeighbors("3A", { layout: "2+2" })).toEqual(["3B"]);
    expect(seatNeighbors("3M", { layout: "2+2" })).toEqual([]);
  });

  it("eski düzen harfli kodları korur, renumberSeatMap sayıya çevirir", () => {
    const legacy = legacySeatMap("OTOBUS", 2);
    expect(legacy[0]).toEqual(["1A", "1B", "", "1C", "1D"]);
    expect(renumberSeatMap(legacy)[1]).toEqual(["5", "6", "", "7", "8"]);
  });
});
