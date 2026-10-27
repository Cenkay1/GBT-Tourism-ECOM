import { describe, it, expect } from "vitest";
import {
  ageOn,
  priceBooking,
  bandForAge,
  passengerBand,
  decodeRooms,
  encodeRooms,
  roomIndexes,
  assignRooms,
  roomsTotal,
  fareBandForAge,
  needsIdDocument,
  validateRooms,
  parseDepartureDate,
  departureDateInput,
  formatDate,
  formatTime,
} from "@/lib/shared";

const DEP = "2026-09-01";

describe("departure time zone", () => {
  it("round trips Turkish midnight regardless of server timezone", () => {
    const date = parseDepartureDate("2026-10-20T00:30");
    expect(date.toISOString()).toBe("2026-10-19T21:30:00.000Z");
    expect(departureDateInput(date)).toBe("2026-10-20T00:30");
    expect(formatDate(date.toISOString())).toContain("20 Ekim 2026");
    expect(formatTime(date.toISOString())).toBe("00:30");
  });

  it("preserves explicitly zoned dates", () => {
    expect(parseDepartureDate("2026-10-19T21:30:00Z").toISOString()).toBe("2026-10-19T21:30:00.000Z");
    expect(Number.isNaN(parseDepartureDate("invalid").getTime())).toBe(true);
  });
});

// Kalkışta tam olarak `age` yaşında olacak bir doğum tarihi üretir.
function bornForAge(age: number): string {
  const d = new Date(DEP);
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

describe("ageOn", () => {
  it("hesaplar: 5 yaşında", () => {
    expect(ageOn("2021-06-01", DEP)).toBe(5);
  });
  it("doğum günü henüz gelmediyse bir eksik", () => {
    expect(ageOn("2020-12-31", "2026-06-01")).toBe(5);
  });
});

describe("bandForAge — Yetişkin 12+ / Çocuk 4-12 / Bebek 0-3", () => {
  it("3 yaş bebek", () => expect(bandForAge(3)).toBe("INFANT"));
  it("4 yaş çocuk (alt sınır)", () => expect(bandForAge(4)).toBe("CHILD"));
  it("11 yaş çocuk (üst sınır)", () => expect(bandForAge(11)).toBe("CHILD"));
  it("12 yaş yetişkin", () => expect(bandForAge(12)).toBe("ADULT"));
});

describe("passengerBand — yaş grubu yalnız doğum tarihinden", () => {
  it("doğum tarihinden hesaplar", () => {
    expect(passengerBand({ birthDate: bornForAge(6) }, DEP)).toBe("CHILD");
    expect(passengerBand({ birthDate: bornForAge(2) }, DEP)).toBe("INFANT");
    expect(passengerBand({ birthDate: bornForAge(30) }, DEP)).toBe("ADULT");
  });
  it("doğum tarihi yoksa yetişkin (tam ücret)", () => {
    expect(passengerBand({}, DEP)).toBe("ADULT");
    expect(passengerBand({ birthDate: null }, DEP)).toBe("ADULT");
  });
});

describe("fareBandForAge — ücret bandı tur tipine göre", () => {
  it("konaklamalı: 0-3 ücretsiz", () => {
    expect(fareBandForAge(0, true)).toBe("FREE");
    expect(fareBandForAge(3, true)).toBe("FREE");
  });
  it("konaklamalı: 4-6 yarım", () => {
    expect(fareBandForAge(4, true)).toBe("HALF");
    expect(fareBandForAge(6, true)).toBe("HALF");
  });
  it("konaklamalı: 7+ tam", () => {
    expect(fareBandForAge(7, true)).toBe("FULL");
    expect(fareBandForAge(11, true)).toBe("FULL");
  });
  it("günübirlik: 0-3 ücretsiz, 4+ tam", () => {
    expect(fareBandForAge(3, false)).toBe("FREE");
    expect(fareBandForAge(4, false)).toBe("FULL");
    expect(fareBandForAge(6, false)).toBe("FULL");
  });
});

describe("needsIdDocument — belge yalnız indirimli yolcudan", () => {
  it("ücretsiz ve yarım ücretli yolcudan istenir", () => {
    expect(needsIdDocument("FREE")).toBe(true);
    expect(needsIdDocument("HALF")).toBe(true);
  });
  it("tam ücret ödeyenden istenmez", () => expect(needsIdDocument("FULL")).toBe(false));
});

describe("priceBooking — konaklamalı tur (0-3 ücretsiz, 4-6 %50, 7+ tam)", () => {
  const base = {
    unitPrice: 1000,
    departureDate: DEP,
    singleSupplement: 2000,
    hasAccommodation: true,
  };
  // Belgesi yüklenmiş indirimli yolcu (indirim uygulanabilmesi için gerekir).
  const kid = (age: number) => ({ birthDate: bornForAge(age), hasIdDocument: true });

  it("2 yetişkin + 6 yaş → %50", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}, kid(6)] });
    expect(r.adultCount).toBe(2);
    expect(r.halfCount).toBe(1);
    expect(r.total).toBe(1000 + 1000 + 500);
  });

  it("1 yetişkin + 6 yaş → indirim yok (2+ yetişkin şartı sürüyor)", () => {
    const r = priceBooking({ ...base, passengers: [{}, kid(6)] });
    expect(r.halfCount).toBe(1); // hakkı var
    expect(r.total).toBe(2000); // ama şart sağlanmadı
  });

  it("4 yaş alt sınırı indirimli", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}, kid(4)] });
    expect(r.total).toBe(2500);
  });

  it("7 yaş üst sınırı TAM ücret", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}, kid(7)] });
    expect(r.halfCount).toBe(0);
    expect(r.total).toBe(3000);
  });

  it("eski kural geçersiz: 11 yaş artık tam ücret öder", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}, kid(11)] });
    expect(r.perPassenger[2].fareBand).toBe("FULL");
    expect(r.total).toBe(3000);
  });

  it("3 yaş ücretsiz — tek yetişkinle bile", () => {
    const r = priceBooking({ ...base, passengers: [{}, kid(3)] });
    expect(r.freeCount).toBe(1);
    expect(r.perPassenger[1].fare).toBe(0);
    expect(r.total).toBe(1000);
  });

  it("doğum tarihi yoksa yetişkin sayılır", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}] });
    expect(r.adultCount).toBe(2);
    expect(r.halfCount).toBe(0);
    expect(r.total).toBe(2000);
  });

  it("belge yüklenmemiş 6 yaş tam ücret öder", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, {}, { birthDate: bornForAge(6), hasIdDocument: false }],
    });
    expect(r.unverifiedCount).toBe(1);
    expect(r.perPassenger[2].fullFare).toBe(true);
    expect(r.total).toBe(3000);
  });

  it("belge yüklenmemiş 2 yaş tam ücret öder", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, { birthDate: bornForAge(2), hasIdDocument: false }],
    });
    expect(r.unverifiedCount).toBe(1);
    expect(r.perPassenger[1].fare).toBe(1000);
    expect(r.total).toBe(2000);
  });

  it("yetişkin için belge gerekmez", () => {
    const r = priceBooking({ ...base, passengers: [{ hasIdDocument: false }] });
    expect(r.unverifiedCount).toBe(0);
    expect(r.total).toBe(1000);
  });

  it("tek kişilik oda → tek kişi farkı eklenir", () => {
    const r = priceBooking({ ...base, passengers: [{}], rooms: [1] });
    expect(r.singleRooms).toBe(1);
    expect(r.supplement).toBe(2000);
    expect(r.total).toBe(3000);
  });

  it("iki kişilik oda → fark yok", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}], rooms: [2] });
    expect(r.supplement).toBe(0);
    expect(r.total).toBe(2000);
  });

  it("iki oda, biri tek kişilik → fark bir kez", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}, {}], rooms: [2, 1] });
    expect(r.singleRooms).toBe(1);
    expect(r.total).toBe(3000 + 2000);
  });

  it("iki tek kişilik oda → fark iki kez", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}], rooms: [1, 1] });
    expect(r.singleRooms).toBe(2);
    expect(r.total).toBe(2000 + 4000);
  });

  it("oda planı yoksa eski SINGLE davranışı korunur", () => {
    const r = priceBooking({ ...base, passengers: [{}], accommodationType: "SINGLE" });
    expect(r.supplement).toBe(2000);
    expect(r.total).toBe(3000);
  });

  it("2 yetişkin + 6 yaş + 2 yaş: %50, ücretsiz, 2. oda tek kişilik", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, {}, kid(6), kid(2)],
      rooms: [3, 1],
    });
    // 1000 + 1000 + 500 + 0 = 2500, ikinci oda tek kişilik → +2000
    expect(r.halfCount).toBe(1);
    expect(r.freeCount).toBe(1);
    expect(r.singleRooms).toBe(1);
    expect(r.total).toBe(2500 + 2000);
  });
});

describe("priceBooking — günübirlik tur (0-3 ücretsiz, 4+ tam)", () => {
  const base = {
    unitPrice: 1000,
    departureDate: DEP,
    singleSupplement: 2000,
    hasAccommodation: false,
  };
  const kid = (age: number) => ({ birthDate: bornForAge(age), hasIdDocument: true });

  it("3 yaş ücretsiz", () => {
    const r = priceBooking({ ...base, passengers: [{}, kid(3)] });
    expect(r.freeCount).toBe(1);
    expect(r.total).toBe(1000);
  });

  it("4 yaş TAM ücret — günübirlikte çocuk indirimi yok", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}, kid(4)] });
    expect(r.halfCount).toBe(0);
    expect(r.total).toBe(3000);
  });

  it("7 yaş tam ücret", () => {
    const r = priceBooking({ ...base, passengers: [{}, {}, kid(7)] });
    expect(r.total).toBe(3000);
  });

  it("aynı yolcu konaklamalıda %50, günübirlikte tam öder", () => {
    const passengers = [{}, {}, kid(5)];
    expect(priceBooking({ ...base, hasAccommodation: true, passengers }).total).toBe(2500);
    expect(priceBooking({ ...base, passengers }).total).toBe(3000);
  });

  it("tam ücret ödeyen 5 yaştan belge istenmez", () => {
    const r = priceBooking({
      ...base,
      passengers: [{}, { birthDate: bornForAge(5), hasIdDocument: false }],
    });
    expect(r.unverifiedCount).toBe(0);
    expect(r.total).toBe(2000);
  });
});

describe("oda planı", () => {
  it("encode/decode gidiş-dönüş", () => {
    expect(encodeRooms([3, 2])).toBe("3|2");
    expect(decodeRooms("3|2")).toEqual([3, 2]);
  });

  it("roomIndexes yolcuyu odasına eşler", () => {
    expect(roomIndexes([3, 2])).toEqual([0, 0, 0, 1, 1]);
  });

  it("roomsTotal toplam kişi", () => {
    expect(roomsTotal([3, 2, 1])).toBe(6);
  });

  it("3 kişiyi aşan oda decode'da atılmaz, doğrulamada reddedilir", () => {
    expect(decodeRooms("4")).toEqual([4]);
    expect(validateRooms([4])).toMatch(/en fazla 3 kişi/);
  });

  it("boş oda reddedilir", () => {
    expect(validateRooms([2, 0])).toMatch(/oda boş/);
  });

  it("boş liste reddedilir", () => {
    expect(validateRooms([])).toMatch(/oda/);
  });

  it("3 kişilik oda geçerli", () => {
    expect(validateRooms([3])).toBeNull();
  });

  it("hiç yetişkin yoksa reddedilir", () => {
    expect(validateRooms([2], ["CHILD", "CHILD"])).toMatch(/en az bir yetişkin/);
  });

  it("oda sayısı yetişkin sayısını aşarsa reddedilir", () => {
    // 2 oda ama tek yetişkin → biri çocuk/bebekle tek kalırdı
    expect(validateRooms([2, 1], ["ADULT", "CHILD", "INFANT"])).toMatch(
      /en az 2 yetişkin gerekir/
    );
  });

  it("her odaya bir yetişkin düşüyorsa geçerli", () => {
    expect(validateRooms([2, 2], ["ADULT", "CHILD", "ADULT", "INFANT"])).toBeNull();
  });
});

describe("assignRooms — her odaya bir yetişkin", () => {
  it("yetişkinler odalara serpiştirilir, çocuk/bebek tek kalmaz", () => {
    // Yolcu sırası yetişkinleri başa toplasa bile her odaya bir yetişkin düşer.
    const bands = ["ADULT", "ADULT", "CHILD", "INFANT"] as const;
    const a = assignRooms([3, 1], [...bands]);
    expect(a[0]).toBe(0); // 1. yetişkin → 1. oda
    expect(a[1]).toBe(1); // 2. yetişkin → 2. oda

    // Her odada en az bir yetişkin olmalı.
    for (const room of [0, 1]) {
      const adultsInRoom = a.filter((r, i) => r === room && bands[i] === "ADULT");
      expect(adultsInRoom.length).toBeGreaterThan(0);
    }
  });

  it("oda kapasitelerine uyar", () => {
    const a = assignRooms([2, 2], ["ADULT", "ADULT", "CHILD", "CHILD"]);
    const counts = [0, 0];
    a.forEach((r) => counts[r]++);
    expect(counts).toEqual([2, 2]);
  });

  it("tek oda: herkes aynı odada", () => {
    expect(assignRooms([3], ["ADULT", "CHILD", "INFANT"])).toEqual([0, 0, 0]);
  });
});
