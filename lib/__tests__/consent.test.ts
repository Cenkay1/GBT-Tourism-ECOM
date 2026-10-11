import { describe, it, expect } from "vitest";
import {
  CONSENT_FIELDS,
  CONSENT_VERSION,
  checkConsent,
  clientIpFrom,
  isChecked,
} from "@/lib/consent";

function form(terms?: string, privacy?: string): FormData {
  const fd = new FormData();
  if (terms !== undefined) fd.set(CONSENT_FIELDS.terms, terms);
  if (privacy !== undefined) fd.set(CONSENT_FIELDS.privacy, privacy);
  return fd;
}

describe("isChecked", () => {
  it("tarayıcının gönderdiği 'on' değerini işaretli sayar", () => {
    expect(isChecked("on")).toBe(true);
  });

  it("boş, eksik ve beklenmeyen değerleri işaretsiz sayar", () => {
    expect(isChecked(null)).toBe(false);
    expect(isChecked("")).toBe(false);
    expect(isChecked("off")).toBe(false);
    expect(isChecked("hayir")).toBe(false);
  });
});

describe("checkConsent", () => {
  it("iki onay da verildiğinde rıza kaydı üretir", () => {
    const res = checkConsent(form("on", "on"), "85.1.2.3");

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("beklenmedik");
    expect(res.consent.consentVersion).toBe(CONSENT_VERSION);
    expect(res.consent.consentIp).toBe("85.1.2.3");
    expect(res.consent.consentAcceptedAt).toBeInstanceOf(Date);
  });

  it("hiç onay yoksa reddeder", () => {
    const res = checkConsent(form(), null);

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("beklenmedik");
    expect(res.error).toMatch(/onaylaman[ıi]z gerekir/i);
  });

  it("yalnız KVKK işaretliyse reddeder ve eksik olanı söyler", () => {
    const res = checkConsent(form(undefined, "on"), null);

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("beklenmedik");
    expect(res.error).toMatch(/Mesafeli Satış/);
  });

  it("yalnız mesafeli satış işaretliyse reddeder ve eksik olanı söyler", () => {
    const res = checkConsent(form("on"), null);

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("beklenmedik");
    expect(res.error).toMatch(/KVKK/);
  });

  it("istemci atlanıp sahte değer gönderilse de reddeder", () => {
    // Elle hazırlanmış istek: alanlar var ama işaretli değil.
    const res = checkConsent(form("off", "false"), "1.2.3.4");

    expect(res.ok).toBe(false);
  });

  it("IP bilinmiyorsa rıza yine alınır, IP null kalır", () => {
    const res = checkConsent(form("on", "on"), null);

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("beklenmedik");
    expect(res.consent.consentIp).toBeNull();
  });
});

describe("clientIpFrom", () => {
  const headers = (map: Record<string, string>) => ({
    get: (n: string) => map[n.toLowerCase()] ?? null,
  });

  it("x-forwarded-for listesinden İLK adresi alır (gerçek istemci)", () => {
    expect(
      clientIpFrom(headers({ "x-forwarded-for": "85.1.2.3, 10.0.0.1, 172.16.0.1" }))
    ).toBe("85.1.2.3");
  });

  it("x-forwarded-for yoksa x-real-ip'e düşer", () => {
    expect(clientIpFrom(headers({ "x-real-ip": "91.9.9.9" }))).toBe("91.9.9.9");
  });

  it("hiçbiri yoksa null döner", () => {
    expect(clientIpFrom(headers({}))).toBeNull();
  });

  it("aşırı uzun değeri kırpar (kötü niyetli başlığa karşı)", () => {
    const uzun = "9".repeat(500);

    const ip = clientIpFrom(headers({ "x-forwarded-for": uzun }));

    expect(ip).not.toBeNull();
    expect(ip!.length).toBeLessThanOrEqual(64);
  });
});
