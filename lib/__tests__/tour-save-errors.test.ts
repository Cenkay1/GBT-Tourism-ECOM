import { describe, it, expect } from "vitest";
import { tourSaveErrorMessage, newErrorRef } from "@/lib/tour-save-errors";

describe("tourSaveErrorMessage", () => {
  it("eski koltuk indeksi çakışmasını tanır ve çözümü söyler", () => {
    const err = { code: "P2002", meta: { target: ["tourId", "code"] } };

    const msg = tourSaveErrorMessage(err);

    expect(msg).toContain("deploy-migrate");
    expect(msg).toContain("koltuk");
  });

  it("hedef dizi yerine metin gelse de tanır", () => {
    const err = { code: "P2002", meta: { target: "tourId, code" } };

    expect(tourSaveErrorMessage(err)).toContain("deploy-migrate");
  });

  it("diğer benzersizlik çakışmalarına genel mesaj verir", () => {
    const err = { code: "P2002", meta: { target: ["slug"] } };

    const msg = tourSaveErrorMessage(err);

    expect(msg).toContain("zaten var");
    expect(msg).not.toContain("deploy-migrate");
  });

  it("bilinmeyen hataya 'beklenmeyen hata' mesajı verir", () => {
    expect(tourSaveErrorMessage(new Error("patladı"))).toContain("Beklenmeyen bir hata");
  });

  it("null/undefined ile çökmez", () => {
    expect(tourSaveErrorMessage(null)).toContain("Beklenmeyen bir hata");
    expect(tourSaveErrorMessage(undefined)).toContain("Beklenmeyen bir hata");
  });

  it("bilinmeyen hataya ref verildiğinde mesajda referans geçer", () => {
    const msg = tourSaveErrorMessage(new Error("patladı"), "AB12CD");

    expect(msg).toContain("AB12CD");
    expect(msg).toContain("Beklenmeyen bir hata");
  });

  it("bilinmeyen hataya ref verilmediğinde de çalışır ve 'beklenmeyen' dilini korur", () => {
    const msg = tourSaveErrorMessage(new Error("patladı"));

    expect(msg).toContain("Beklenmeyen bir hata");
    expect(msg).not.toContain("referans");
  });

  it("P2002 (eski koltuk çakışması) ref verilse de kendi mesajını döndürür", () => {
    const err = { code: "P2002", meta: { target: ["tourId", "code"] } };

    const msg = tourSaveErrorMessage(err, "AB12CD");

    expect(msg).toContain("deploy-migrate");
    expect(msg).not.toContain("AB12CD");
  });

  it("P2002 (diğer benzersizlik çakışması) ref verilse de kendi mesajını döndürür", () => {
    const err = { code: "P2002", meta: { target: ["slug"] } };

    const msg = tourSaveErrorMessage(err, "AB12CD");

    expect(msg).toContain("zaten var");
    expect(msg).not.toContain("AB12CD");
  });

  it("newErrorRef() her çağrıda farklı ve beklenen biçimde bir değer üretir", () => {
    const refs = new Set(Array.from({ length: 20 }, () => newErrorRef()));

    // 20 üretimden en az ikisi farklı olmalı (pratikte hepsi farklı olur).
    expect(refs.size).toBeGreaterThan(1);

    for (const ref of refs) {
      expect(ref).toMatch(/^[A-Z0-9]{6,8}$/);
    }
  });
});
