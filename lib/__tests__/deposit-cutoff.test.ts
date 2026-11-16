import { describe, it, expect } from "vitest";
import { depositAvailableFor, DEPOSIT_CUTOFF_DAYS } from "@/lib/shared";

// Sabit "şimdi": testler takvime göre kaymasın.
const now = new Date("2026-11-14T12:00:00.000Z");

function inDays(n: number): Date {
  return new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
}

describe("depositAvailableFor", () => {
  it("sınır 5 gündür", () => {
    expect(DEPOSIT_CUTOFF_DAYS).toBe(5);
  });

  it("kalkışa 6 gün kaldıysa ön ödeme açıktır", () => {
    expect(depositAvailableFor(inDays(6), now)).toBe(true);
  });

  it("kalkışa tam 5 gün kaldıysa ön ödeme KAPALIDIR", () => {
    // "5 günden az kaldıysa kapansın" kuralı sınırı da kapsar: 5 gün kalan
    // rezervasyonda kalan ödemenin son tarihi kalkışa denk gelir.
    expect(depositAvailableFor(inDays(5), now)).toBe(false);
  });

  it("kalkışa 4 gün kaldıysa kapalıdır", () => {
    expect(depositAvailableFor(inDays(4), now)).toBe(false);
  });

  it("kalkış bugünse kapalıdır", () => {
    expect(depositAvailableFor(now, now)).toBe(false);
  });

  it("kalkış geçmişse kapalıdır", () => {
    expect(depositAvailableFor(inDays(-3), now)).toBe(false);
  });

  it("5 gün 1 saat kaldıysa açıktır", () => {
    const d = new Date(inDays(5).getTime() + 60 * 60 * 1000);
    expect(depositAvailableFor(d, now)).toBe(true);
  });

  it("ISO metin tarih de kabul eder", () => {
    expect(depositAvailableFor(inDays(10).toISOString(), now)).toBe(true);
    expect(depositAvailableFor(inDays(2).toISOString(), now)).toBe(false);
  });

  it("geçersiz tarihte kapalıdır (güvenli taraf)", () => {
    expect(depositAvailableFor("bu bir tarih degil", now)).toBe(false);
  });

  it("now verilmezse sistem saatini kullanır", () => {
    const uzak = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    expect(depositAvailableFor(uzak)).toBe(true);
    const yakin = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect(depositAvailableFor(yakin)).toBe(false);
  });
});
