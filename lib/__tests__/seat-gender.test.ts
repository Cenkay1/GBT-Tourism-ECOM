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
  // 1 ve 2 yan yana, "" koridor, 3 ve 4 yan yana.
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

// --- Dolu sefer tespiti (yedek liste bu kurala göre gösterilir) -----------
describe("departureIsFull", () => {
  it("KOLTUK: boş koltuk varsa dolu değildir", async () => {
    const { departureIsFull } = await import("@/lib/shared");
    const tour = {
      bookingType: "KOLTUK",
      vehicleType: "MINIBUS",
      seatLayout: "1+1",
      seatRows: 2,
    } as never;
    const dep = { id: "d1", soldSeats: ["1A"], blockedSeats: [] } as never;
    expect(departureIsFull(tour, dep)).toBe(false);
  });

  it("KOLTUK: tüm koltuklar satılı/bloke ise doludur", async () => {
    const { departureIsFull } = await import("@/lib/shared");
    const tour = {
      bookingType: "KOLTUK",
      vehicleType: "MINIBUS",
      seatLayout: "1+1",
      seatRows: 2,
    } as never;
    // 1+1 düzende 2 sıra = 1A,1B,2A,2B
    const dep = {
      id: "d1",
      soldSeats: ["1A", "1B", "2A"],
      blockedSeats: ["2B"],
    } as never;
    expect(departureIsFull(tour, dep)).toBe(true);
  });

  it("KONTENJAN: kalan yer 0 ise doludur", async () => {
    const { departureIsFull } = await import("@/lib/shared");
    const tour = { bookingType: "KONTENJAN", capacity: 10 } as never;
    expect(departureIsFull(tour, { id: "d", sold: 10 } as never)).toBe(true);
    expect(departureIsFull(tour, { id: "d", sold: 9 } as never)).toBe(false);
  });

  it("KONTENJAN: seferin kendi kontenjanı turunkini ezer", async () => {
    const { departureIsFull } = await import("@/lib/shared");
    const tour = { bookingType: "KONTENJAN", capacity: 40 } as never;
    const dep = { id: "d", capacity: 5, sold: 5 } as never;
    expect(departureIsFull(tour, dep)).toBe(true);
  });
});
