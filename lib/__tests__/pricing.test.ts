import { describe, it, expect } from "vitest";
import { ageOn, priceBooking } from "@/lib/shared";

const DEP = "2026-09-01";

describe("ageOn", () => {
  it("hesaplar: 5 yaşında", () => {
    expect(ageOn("2021-06-01", DEP)).toBe(5);
  });
  it("doğum günü henüz gelmediyse bir eksik", () => {
    expect(ageOn("2020-12-31", "2026-06-01")).toBe(5);
  });
});

describe("priceBooking", () => {
  const base = { unitPrice: 1000, departureDate: DEP, singleSupplement: 2000 };

  it("2 yetişkin + 1 çocuk (5) → çocuk %50", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, {}, { birthDate: "2021-06-01" }],
    });
    expect(r.adultCount).toBe(2);
    expect(r.childCount).toBe(1);
    expect(r.total).toBe(1000 + 1000 + 500);
  });

  it("1 yetişkin + 1 çocuk (5) → indirim yok", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, { birthDate: "2021-06-01" }],
    });
    expect(r.total).toBe(2000);
  });

  it("doğum tarihi yoksa yetişkin sayılır", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}] });
    expect(r.adultCount).toBe(2);
    expect(r.childCount).toBe(0);
    expect(r.total).toBe(2000);
  });

  it("tek kişilik konaklama farkı eklenir", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}],
      accommodationType: "SINGLE",
    });
    expect(r.supplement).toBe(2000);
    expect(r.total).toBe(3000);
  });

  it("birden fazla kişi konaklamada fark yok", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, {}],
      accommodationType: "MULTI",
    });
    expect(r.supplement).toBe(0);
    expect(r.total).toBe(2000);
  });

  it("7 yaş sınırı: tam 7 yaşında indirim yok", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, {}, { birthDate: "2019-06-01" }], // 7 yaşında
    });
    expect(r.childCount).toBe(0);
    expect(r.total).toBe(3000);
  });
});
