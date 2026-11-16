import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

let n = 0;
async function birTur() {
  n++;
  return prisma.tour.create({
    data: {
      slug: `cop-tur-${n}-${Date.now()}`,
      title: `Çöp Testi ${n}`,
      destination: "Test",
      category: "YURT_ICI",
      bookingType: "KONTENJAN",
      departureDate: new Date(Date.now() + 20 * 86400000),
      departureLocation: "Test",
      price: 1000,
      coverImage: "",
      capacity: 10,
    },
  });
}

describe("softDelete / restore", () => {
  it("tur silinince kayıt durur ama deletedAt işaretlenir", async () => {
    const { softDeleteRecord } = await import("@/lib/trash");
    const tour = await birTur();

    const res = await softDeleteRecord("Tour", tour.id);
    expect(res.ok).toBe(true);

    // Kayıt SİLİNMEDİ — ilişkileri (sefer, koltuk, rezervasyon) duruyor.
    const row = await prisma.tour.findFirst({ where: { id: tour.id } });
    expect(row).not.toBeNull();
    expect(row!.deletedAt).not.toBeNull();
  });

  it("geri yükleme işareti kaldırır", async () => {
    const { softDeleteRecord, restoreRecord } = await import("@/lib/trash");
    const tour = await birTur();
    await softDeleteRecord("Tour", tour.id);

    expect((await restoreRecord("Tour", tour.id)).ok).toBe(true);
    const row = await prisma.tour.findFirst({ where: { id: tour.id } });
    expect(row!.deletedAt).toBeNull();
  });

  it("aynı kaydı iki kez silmek ilk silme tarihini korur", async () => {
    const { softDeleteRecord } = await import("@/lib/trash");
    const tour = await birTur();
    await softDeleteRecord("Tour", tour.id);
    const first = (await prisma.tour.findFirst({ where: { id: tour.id } }))!.deletedAt!;

    const second = await softDeleteRecord("Tour", tour.id);
    expect(second.ok).toBe(false);
    const after = (await prisma.tour.findFirst({ where: { id: tour.id } }))!.deletedAt!;
    expect(after.getTime()).toBe(first.getTime());
  });

  it("olmayan kayıtta hata döner", async () => {
    const { softDeleteRecord, restoreRecord } = await import("@/lib/trash");
    expect((await softDeleteRecord("Tour", "yok")).ok).toBe(false);
    expect((await restoreRecord("Tour", "yok")).ok).toBe(false);
  });

  it("afiş, otobüs ve özellik de silinip geri yüklenebilir", async () => {
    const { softDeleteRecord, restoreRecord } = await import("@/lib/trash");

    const banner = await prisma.banner.create({
      data: { title: "Afiş", image: "/x.png" },
    });
    const bus = await prisma.bus.create({
      data: {
        name: "Otobüs",
        plate: "34 TEST 1",
        vehicleType: "OTOBUS",
        seatLayout: "2+2",
        seatRows: 10,
      },
    });
    const amenity = await prisma.amenity.create({ data: { name: "Kahvaltı" } });

    for (const [model, id] of [
      ["Banner", banner.id],
      ["Bus", bus.id],
      ["Amenity", amenity.id],
    ] as const) {
      expect((await softDeleteRecord(model, id)).ok).toBe(true);
      expect((await restoreRecord(model, id)).ok).toBe(true);
    }
  });
});

describe("listTrash", () => {
  it("silinen kayıtları kalan gün sayısıyla listeler", async () => {
    const { softDeleteRecord, listTrash, TRASH_RETENTION_DAYS } = await import(
      "@/lib/trash"
    );
    const tour = await birTur();
    await softDeleteRecord("Tour", tour.id);

    const items = await listTrash();
    const found = items.find((i) => i.id === tour.id);
    expect(found).toBeDefined();
    expect(found!.model).toBe("Tour");
    expect(found!.label).toContain("Çöp Testi");
    // Yeni silinen kayıtta kalan süre tam saklama süresidir.
    expect(found!.daysLeft).toBe(TRASH_RETENTION_DAYS);
  });

  it("silinmemiş kayıtları listelemez", async () => {
    const { listTrash } = await import("@/lib/trash");
    const tour = await birTur();
    const items = await listTrash();
    expect(items.find((i) => i.id === tour.id)).toBeUndefined();
  });
});

describe("purgeExpiredTrash", () => {
  it("25 günü geçen kaydı KALICI siler", async () => {
    const { softDeleteRecord, purgeExpiredTrash, TRASH_RETENTION_DAYS } = await import(
      "@/lib/trash"
    );
    const tour = await birTur();
    await softDeleteRecord("Tour", tour.id);

    // Silme tarihini saklama süresinin ötesine çek.
    const eski = new Date(Date.now() - (TRASH_RETENTION_DAYS + 1) * 86400000);
    await prisma.tour.update({ where: { id: tour.id }, data: { deletedAt: eski } });

    const res = await purgeExpiredTrash();
    expect(res.purged).toBeGreaterThanOrEqual(1);

    // Artık gerçekten yok.
    const row = await prisma.tour.findFirst({ where: { id: tour.id } });
    expect(row).toBeNull();
  });

  it("süresi dolmamış kaydı silmez", async () => {
    const { softDeleteRecord, purgeExpiredTrash } = await import("@/lib/trash");
    const tour = await birTur();
    await softDeleteRecord("Tour", tour.id);

    await purgeExpiredTrash();
    // Hâlâ çöp kutusunda duruyor olmalı.
    const { listTrash } = await import("@/lib/trash");
    expect((await listTrash()).find((i) => i.id === tour.id)).toBeDefined();
  });
});

describe("soft-delete filtresi (lib/db.ts uzantısı)", () => {
  // Bu testler UYGULAMANIN istemcisini kullanır: filtre orada kurulu
  // (getTestPrisma filtresiz ham istemci döndürüyor, çöp kutusunun kendisi
  // silinen kayıtları görmek zorunda olduğu için).
  it("silinen tur findMany sonuçlarında GÖRÜNMEZ", async () => {
    const { softDeleteRecord } = await import("@/lib/trash");
    const { prisma: appPrisma } = await import("@/lib/db");
    const tour = await birTur();

    const before = await appPrisma.tour.findMany({ where: { id: tour.id } });
    expect(before).toHaveLength(1);

    await softDeleteRecord("Tour", tour.id);

    // Filtre uzantısı sayesinde elle `deletedAt: null` yazmaya gerek yok.
    const after = await appPrisma.tour.findMany({ where: { id: tour.id } });
    expect(after).toHaveLength(0);
  });

  it("silinen tur count'a girmez", async () => {
    const { softDeleteRecord } = await import("@/lib/trash");
    const { prisma: appPrisma } = await import("@/lib/db");
    const tour = await birTur();
    expect(await appPrisma.tour.count({ where: { id: tour.id } })).toBe(1);
    await softDeleteRecord("Tour", tour.id);
    expect(await appPrisma.tour.count({ where: { id: tour.id } })).toBe(0);
  });

  it("silinmeyen kayıtlar normal görünmeye devam eder", async () => {
    const { prisma: appPrisma } = await import("@/lib/db");
    const tour = await birTur();
    const rows = await appPrisma.tour.findMany({ where: { id: tour.id } });
    expect(rows).toHaveLength(1);
  });
});
