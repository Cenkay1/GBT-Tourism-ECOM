import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma, createTestBooking } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

// Boş bir sefer kurar (createTestBooking 1A/1B satıyor, 4 koltuk boş kalır).
async function sefer() {
  const { tourId, departureId } = await createTestBooking(prisma, {
    status: "ODENDI",
    seatCodes: ["1A", "1B"],
  });
  return { tourId, departureId };
}

let t = 0;
const token = () => `sepet-${++t}-${Date.now()}`;

describe("addSeatToCart", () => {
  it("boş koltuğu sepete kilitler", async () => {
    const { addSeatToCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const tok = token();

    const res = await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });
    expect(res.ok).toBe(true);

    const seat = (await prisma.seat.findFirst({ where: { departureId, code: "2A" } }))!;
    expect(seat.status).toBe("KILITLI");
    expect(seat.gender).toBe("E");
    expect(seat.holdToken).toBe(tok);
    expect(seat.holdExpiresAt).not.toBeNull();
  });

  it("SATILMIŞ koltuk sepete eklenemez", async () => {
    const { addSeatToCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const res = await addSeatToCart(token(), {
      tourId,
      departureId,
      code: "1A", // dolu
      gender: "E",
    });
    expect(res.ok).toBe(false);
  });

  it("BAŞKA sepetin kilitlediği koltuk alınamaz", async () => {
    const { addSeatToCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const a = token();
    const b = token();

    expect((await addSeatToCart(a, { tourId, departureId, code: "2A", gender: "E" })).ok).toBe(true);
    const res = await addSeatToCart(b, { tourId, departureId, code: "2A", gender: "K" });
    expect(res.ok).toBe(false);

    // Kilit ilk sepette kalır.
    const seat = (await prisma.seat.findFirst({ where: { departureId, code: "2A" } }))!;
    expect(seat.holdToken).toBe(a);
  });

  it("aynı koltuğu tekrar eklemek süreyi yeniler, hata vermez", async () => {
    const { addSeatToCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const tok = token();

    await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });
    const first = (await prisma.seat.findFirst({ where: { departureId, code: "2A" } }))!
      .holdExpiresAt!;

    await new Promise((r) => setTimeout(r, 15));
    const res = await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });
    expect(res.ok).toBe(true);

    const second = (await prisma.seat.findFirst({ where: { departureId, code: "2A" } }))!
      .holdExpiresAt!;
    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });

  it("yan yana cinsiyet kuralını uygular", async () => {
    const { addSeatToCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    // 1+1 düzende komşu yok; serbest plan kurup komşuluk oluştur.
    const bus = await prisma.bus.create({
      data: {
        name: "Plan", plate: "34 P 1", vehicleType: "OTOBUS",
        seatLayout: "2+2", seatRows: 2,
        seatMap: JSON.stringify([["1A", "1B"]]),
      },
    });
    await prisma.tourDeparture.update({ where: { id: departureId }, data: { busId: bus.id } });
    // 1A'yı KADIN olarak sat.
    await prisma.seat.updateMany({
      where: { departureId, code: "1A" },
      data: { status: "SATILDI", gender: "K", holdToken: null, holdExpiresAt: null },
    });
    await prisma.seat.updateMany({
      where: { departureId, code: "1B" },
      data: { status: "BOS", gender: null },
    });

    const res = await addSeatToCart(token(), {
      tourId, departureId, code: "1B", gender: "E",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("1A");
  });

  it("en fazla 6 koltuk eklenebilir", async () => {
    const { addSeatToCart, MAX_CART_SEATS } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const tok = token();
    // Sefere 6'dan fazla BOŞ koltuk gerekiyor. Yardımcı 1A..3B üretiyor ve
    // 1A/1B satılı; kalanları burada ekliyoruz.
    const codes = ["2A", "2B", "3A", "3B", "4A", "4B", "5A"];
    await prisma.seat.createMany({
      data: ["4A", "4B", "5A"].map((code) => ({ tourId, departureId, code, status: "BOS" })),
    });

    let eklenen = 0;
    for (const code of codes) {
      const r = await addSeatToCart(tok, { tourId, departureId, code, gender: "E" });
      if (r.ok) eklenen++;
    }
    expect(eklenen).toBe(MAX_CART_SEATS);
  });
});

describe("getCart", () => {
  it("sepetteki koltukları ve kalan süreyi döndürür", async () => {
    const { addSeatToCart, getCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const tok = token();
    await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });
    await addSeatToCart(tok, { tourId, departureId, code: "2B", gender: "K" });

    const cart = await getCart(tok);
    expect(cart).not.toBeNull();
    expect(cart!.seats.map((s) => s.code).sort()).toEqual(["2A", "2B"]);
    expect(cart!.departureId).toBe(departureId);
    expect(cart!.expiresInSeconds).toBeGreaterThan(0);
    expect(cart!.tourSlug).toBeTruthy();
  });

  it("boş sepette null döner", async () => {
    const { getCart } = await import("@/lib/cart");
    expect(await getCart(token())).toBeNull();
  });

  it("süresi dolmuş sepet null döner", async () => {
    const { addSeatToCart, getCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const tok = token();
    await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });
    // Süreyi geçmişe çek.
    await prisma.seat.updateMany({
      where: { holdToken: tok },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(await getCart(tok)).toBeNull();
  });
});

describe("removeSeatFromCart", () => {
  it("kendi koltuğunu sepetten çıkarır ve koltuk boşalır", async () => {
    const { addSeatToCart, removeSeatFromCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const tok = token();
    await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });

    expect((await removeSeatFromCart(tok, departureId, "2A")).ok).toBe(true);
    const seat = (await prisma.seat.findFirst({ where: { departureId, code: "2A" } }))!;
    expect(seat.status).toBe("BOS");
    expect(seat.holdToken).toBeNull();
    expect(seat.gender).toBeNull();
  });

  it("BAŞKA sepetin koltuğunu çıkaramaz", async () => {
    const { addSeatToCart, removeSeatFromCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const a = token();
    await addSeatToCart(a, { tourId, departureId, code: "2A", gender: "E" });

    const res = await removeSeatFromCart(token(), departureId, "2A");
    expect(res.ok).toBe(false);
    const seat = (await prisma.seat.findFirst({ where: { departureId, code: "2A" } }))!;
    expect(seat.status).toBe("KILITLI"); // dokunulmadı
  });
});

describe("clearCart", () => {
  it("tüm sepeti boşaltır", async () => {
    const { addSeatToCart, clearCart, getCart } = await import("@/lib/cart");
    const { tourId, departureId } = await sefer();
    const tok = token();
    await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });
    await addSeatToCart(tok, { tourId, departureId, code: "2B", gender: "K" });

    const res = await clearCart(tok);
    expect(res.released).toBe(2);
    expect(await getCart(tok)).toBeNull();

    const free = await prisma.seat.count({
      where: { departureId, code: { in: ["2A", "2B"] }, status: "BOS" },
    });
    expect(free).toBe(2);
  });
});

describe("releaseExpiredHolds — sepet kilitleri", () => {
  it("süresi dolmuş SEPET kilidini boşaltır", async () => {
    const { addSeatToCart } = await import("@/lib/cart");
    const { releaseExpiredHolds } = await import("@/lib/booking");
    const { tourId, departureId } = await sefer();
    const tok = token();
    await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });
    await prisma.seat.updateMany({
      where: { holdToken: tok },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });

    await releaseExpiredHolds();
    const seat = (await prisma.seat.findFirst({ where: { departureId, code: "2A" } }))!;
    expect(seat.status).toBe("BOS");
    expect(seat.holdToken).toBeNull();
  });

  it("REZERVASYON kilidine (holdExpiresAt null) dokunmaz", async () => {
    const { releaseExpiredHolds } = await import("@/lib/booking");
    const { departureId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["1A"],
    });
    // Rezervasyon kilidi: koltukta holdExpiresAt yok.
    const before = (await prisma.seat.findFirst({ where: { departureId, code: "1A" } }))!;
    expect(before.holdExpiresAt).toBeNull();
    expect(before.status).toBe("KILITLI");

    await releaseExpiredHolds();
    // Rezervasyonun süresi dolmadığı için koltuk HÂLÂ kilitli olmalı.
    const after = (await prisma.seat.findFirst({ where: { departureId, code: "1A" } }))!;
    expect(after.status).toBe("KILITLI");
  });

  it("süresi DOLMAMIŞ sepet kilidine dokunmaz", async () => {
    const { addSeatToCart } = await import("@/lib/cart");
    const { releaseExpiredHolds } = await import("@/lib/booking");
    const { tourId, departureId } = await sefer();
    const tok = token();
    await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });

    await releaseExpiredHolds();
    const seat = (await prisma.seat.findFirst({ where: { departureId, code: "2A" } }))!;
    expect(seat.status).toBe("KILITLI");
    expect(seat.holdToken).toBe(tok);
  });
});

describe("sepetten rezervasyona", () => {
  it("sepetteki koltukla rezervasyon açılır ve kilit devredilir", async () => {
    const { addSeatToCart } = await import("@/lib/cart");
    const { createPendingBooking } = await import("@/lib/booking");
    const { tourId, departureId } = await sefer();
    const tok = token();
    await addSeatToCart(tok, { tourId, departureId, code: "2A", gender: "E" });

    const res = await createPendingBooking({
      tourId,
      departureId,
      contactName: "Sepet Müşteri",
      contactPhone: "5551112233",
      contactEmail: "sepet@example.com",
      seatCodes: ["2A"],
      passengers: [
        { firstName: "Ali", lastName: "Veli", gender: "E", idNumber: "11111111110", seatCode: "2A" },
      ],
      cartToken: tok,
    });
    if (!res.ok) throw new Error(res.error);

    const seat = (await prisma.seat.findFirst({ where: { departureId, code: "2A" } }))!;
    expect(seat.status).toBe("KILITLI");
    // Sepet alanları temizlendi: kilidi artık rezervasyon tutuyor.
    expect(seat.holdToken).toBeNull();
    expect(seat.holdExpiresAt).toBeNull();
  });

  it("BAŞKA sepetin koltuğuyla rezervasyon AÇILMAZ", async () => {
    const { addSeatToCart } = await import("@/lib/cart");
    const { createPendingBooking } = await import("@/lib/booking");
    const { tourId, departureId } = await sefer();
    const a = token();
    await addSeatToCart(a, { tourId, departureId, code: "2A", gender: "E" });

    const res = await createPendingBooking({
      tourId,
      departureId,
      contactName: "Hırsız",
      contactPhone: "5551112233",
      contactEmail: "h@example.com",
      seatCodes: ["2A"],
      passengers: [
        { firstName: "X", lastName: "Y", gender: "E", idNumber: "11111111110", seatCode: "2A" },
      ],
      cartToken: token(), // başkasının sepeti
    });
    expect(res.ok).toBe(false);
  });

  it("sepet olmadan BOŞ koltukla rezervasyon yine açılır (elden satış)", async () => {
    const { createPendingBooking } = await import("@/lib/booking");
    const { tourId, departureId } = await sefer();

    const res = await createPendingBooking({
      tourId,
      departureId,
      contactName: "Elden",
      contactPhone: "5551112233",
      contactEmail: "e@example.com",
      seatCodes: ["2A"],
      passengers: [
        { firstName: "A", lastName: "B", gender: "E", idNumber: "11111111110", seatCode: "2A" },
      ],
    });
    expect(res.ok).toBe(true);
  });
});
