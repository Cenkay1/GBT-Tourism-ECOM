import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma, createTestBooking } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

let n = 0;
function mail(): string {
  return `uye${++n}.${Date.now()}@example.com`;
}

describe("createMember", () => {
  it("üyeyi oluşturur: e-posta doğrulanmış, aktif, şifresiz", async () => {
    const { createMember } = await import("@/lib/members");
    const email = mail();
    const res = await createMember({ name: "Ayşe Yılmaz", email, phone: "5551112233" });
    expect(res.ok).toBe(true);

    const u = await prisma.user.findUnique({ where: { email } });
    expect(u).not.toBeNull();
    expect(u!.name).toBe("Ayşe Yılmaz");
    expect(u!.active).toBe(true);
    // Admin üyeyi tanıyor → e-posta doğrulanmış sayılır.
    expect(u!.emailVerified).not.toBeNull();
    // Şifre verilmez; üye "şifremi unuttum" ile kendi şifresini kurar.
    expect(u!.passwordHash).toBeNull();
  });

  it("e-postayı normalize eder", async () => {
    const { createMember } = await import("@/lib/members");
    const email = mail().toUpperCase();
    const res = await createMember({ name: "Veli", email: `  ${email}  `, phone: "" });
    expect(res.ok).toBe(true);
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    expect(u).not.toBeNull();
  });

  it("aynı e-postayla ikinci üye açılmaz", async () => {
    const { createMember } = await import("@/lib/members");
    const email = mail();
    await createMember({ name: "Bir", email, phone: "" });
    const res = await createMember({ name: "İki", email, phone: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("e-posta");
  });

  it("geçersiz e-posta reddedilir", async () => {
    const { createMember } = await import("@/lib/members");
    const res = await createMember({ name: "Hatalı", email: "bu-eposta-degil", phone: "" });
    expect(res.ok).toBe(false);
  });

  it("ad zorunludur", async () => {
    const { createMember } = await import("@/lib/members");
    const res = await createMember({ name: "   ", email: mail(), phone: "" });
    expect(res.ok).toBe(false);
  });

  it("o e-postayla yapılmış misafir rezervasyonlarını hesaba bağlar", async () => {
    const { createMember } = await import("@/lib/members");
    const email = mail();
    const { bookingId } = await createTestBooking(prisma, { status: "ODENDI" });
    // Misafir rezervasyonun iletişim e-postasını üyenin e-postasına çek.
    await prisma.booking.update({
      where: { id: bookingId },
      data: { contactEmail: email.toUpperCase(), userId: null },
    });

    const res = await createMember({ name: "Bağlanan", email, phone: "" });
    expect(res.ok).toBe(true);

    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b!.userId).toBe(res.ok ? res.userId : null);
  });
});

describe("countGuestBookingsFor", () => {
  it("büyük/küçük harf farkına bakmadan sayar", async () => {
    const { countGuestBookingsFor } = await import("@/lib/members");
    const email = mail();
    const { bookingId } = await createTestBooking(prisma, { status: "ODENDI" });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { contactEmail: email.toUpperCase(), userId: null },
    });
    expect(await countGuestBookingsFor(email)).toBe(1);
  });

  it("hesaba bağlı rezervasyonları saymaz", async () => {
    const { countGuestBookingsFor, createMember } = await import("@/lib/members");
    const email = mail();
    const { bookingId } = await createTestBooking(prisma, { status: "ODENDI" });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { contactEmail: email, userId: null },
    });
    expect(await countGuestBookingsFor(email)).toBe(1);
    await createMember({ name: "Sahip", email, phone: "" });
    // Artık bağlı → misafir sayısı sıfır.
    expect(await countGuestBookingsFor(email)).toBe(0);
  });
});

describe("setMemberActive", () => {
  it("pasife alır ve geri açar", async () => {
    const { createMember, setMemberActive } = await import("@/lib/members");
    const email = mail();
    const created = await createMember({ name: "Geçici", email, phone: "" });
    const id = created.ok ? created.userId : "";

    expect((await setMemberActive(id, false)).ok).toBe(true);
    expect((await prisma.user.findUnique({ where: { id } }))!.active).toBe(false);

    expect((await setMemberActive(id, true)).ok).toBe(true);
    expect((await prisma.user.findUnique({ where: { id } }))!.active).toBe(true);
  });

  it("olmayan üyede hata döner", async () => {
    const { setMemberActive } = await import("@/lib/members");
    const res = await setMemberActive("boyle-bir-id-yok", false);
    expect(res.ok).toBe(false);
  });
});

describe("memberDeletionImpact", () => {
  it("silmenin sonuçlarını sayılarla bildirir", async () => {
    const { createMember, memberDeletionImpact } = await import("@/lib/members");
    const email = mail();
    const created = await createMember({ name: "Etkili", email, phone: "" });
    const id = created.ok ? created.userId : "";

    const { bookingId } = await createTestBooking(prisma, { status: "ODENDI", userId: id });
    expect(bookingId).toBeTruthy();
    await prisma.savedPassenger.create({
      data: { userId: id, firstName: "Kayıtlı", lastName: "Kişi" },
    });

    const impact = await memberDeletionImpact(id);
    expect(impact).not.toBeNull();
    expect(impact!.bookings).toBe(1);
    expect(impact!.savedPassengers).toBe(1);
  });
});

describe("deleteMember", () => {
  it("üyeyi siler, rezervasyonu MİSAFİR rezervasyonuna çevirir", async () => {
    const { createMember, deleteMember } = await import("@/lib/members");
    const email = mail();
    const created = await createMember({ name: "Silinecek", email, phone: "" });
    const id = created.ok ? created.userId : "";
    const { bookingId } = await createTestBooking(prisma, { status: "ODENDI", userId: id });

    const res = await deleteMember(id);
    expect(res.ok).toBe(true);

    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
    // Rezervasyon SİLİNMEZ: yolcu listesi, koltuk ve fatura korunur.
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b).not.toBeNull();
    expect(b!.userId).toBeNull();
  });

  it("kayıtlı kişileri ve puan defterini siler", async () => {
    const { createMember, deleteMember } = await import("@/lib/members");
    const email = mail();
    const created = await createMember({ name: "Kademeli", email, phone: "" });
    const id = created.ok ? created.userId : "";
    await prisma.savedPassenger.create({
      data: { userId: id, firstName: "A", lastName: "B" },
    });
    await prisma.pointsLedger.create({
      data: { userId: id, delta: 100, reason: "DUZELTME" },
    });

    expect((await deleteMember(id)).ok).toBe(true);
    expect(await prisma.savedPassenger.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.pointsLedger.count({ where: { userId: id } })).toBe(0);
  });

  it("olmayan üyede hata döner", async () => {
    const { deleteMember } = await import("@/lib/members");
    expect((await deleteMember("yok-boyle-bir-uye")).ok).toBe(false);
  });
});
