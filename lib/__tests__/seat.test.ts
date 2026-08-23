import { describe, it, expect } from "vitest";
import { buildSeatGrid, seatCodes, seatNeighbor } from "@/lib/shared";
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
