// Kayıtlı yolcular — kaydetme, mükerrer önleme ve SAHİPLİK sınırları.
//
// En kritik davranış sahiplik: bu kayıtlar TC kimlik numarası taşıyor, bir
// müşterinin başkasının kaydını okuyup/silip değiştirememesi gerekir.
import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getTestPrisma } from "./helpers/db";
import {
  listSavedPassengers,
  saveSavedPassenger,
  updateSavedPassenger,
  deleteSavedPassenger,
  saveFromBooking,
} from "@/lib/saved-passengers";

let prisma: PrismaClient;
let n = 0;

async function createUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `kisi-${++n}-${Date.now()}@example.com`, name: "Test" },
  });
  return user.id;
}

// Geçerli TC kimlik numaraları — son iki hane resmi algoritmayla türetildi,
// isValidId bunları kabul eder. (Rastgele 11 hane kabul EDİLMEZ; testin
// doğrulamayı gerçekten geçmesi için bu değerler hesaplanmış olmalı.)
const GECERLI_TC = "10000000146";
const GECERLI_TC_2 = "22222222220";

beforeAll(async () => {
  prisma = await getTestPrisma();
});

describe("saveSavedPassenger", () => {
  it("kişiyi kaydeder ve listede döndürür", async () => {
    const userId = await createUser();
    const res = await saveSavedPassenger(userId, {
      firstName: "Ahmet",
      lastName: "Yılmaz",
      idNumber: GECERLI_TC,
      birthDate: "1990-05-10",
      gender: "E",
      nationality: "TC",
      label: "Eşim",
      isSelf: true,
    });
    expect(res.ok).toBe(true);

    const list = await listSavedPassengers(userId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      firstName: "Ahmet",
      lastName: "Yılmaz",
      idNumber: GECERLI_TC,
      birthDate: "1990-05-10",
      gender: "E",
      nationality: "TC",
      country: "Türkiye",
      label: "Eşim",
      isSelf: true,
    });
  });

  it("aynı kimlik numarasını ikinci kez kaydetmez, mevcut kaydı günceller", async () => {
    const userId = await createUser();
    await saveSavedPassenger(userId, {
      firstName: "Ayşe",
      lastName: "Demir",
      idNumber: GECERLI_TC,
    });
    const second = await saveSavedPassenger(userId, {
      firstName: "Ayşe",
      lastName: "Demir",
      idNumber: GECERLI_TC,
      birthDate: "1985-03-01",
      gender: "K",
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.created).toBe(false);

    const list = await listSavedPassengers(userId);
    expect(list).toHaveLength(1);
    // Yeni bilgi eklendi, eski bilgi korundu.
    expect(list[0].birthDate).toBe("1985-03-01");
    expect(list[0].gender).toBe("K");
  });

  it("kimlik no yoksa ad+soyad ile eşleştirir (her rezervasyonda yeni satır açmaz)", async () => {
    const userId = await createUser();
    await saveSavedPassenger(userId, { firstName: "Minik", lastName: "Kaya" });
    await saveSavedPassenger(userId, { firstName: "minik", lastName: "KAYA" });
    expect(await listSavedPassengers(userId)).toHaveLength(1);
  });

  it("geçersiz kimlik numarasını reddeder", async () => {
    const userId = await createUser();
    const res = await saveSavedPassenger(userId, {
      firstName: "Veli",
      lastName: "Can",
      idNumber: "12345678901",
    });
    expect(res.ok).toBe(false);
    expect(await listSavedPassengers(userId)).toHaveLength(0);
  });

  it("gelecek doğum tarihini ve eksik adı reddeder", async () => {
    const userId = await createUser();
    const ileri = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(
      (await saveSavedPassenger(userId, {
        firstName: "Ali",
        lastName: "Vural",
        birthDate: ileri,
      })).ok
    ).toBe(false);
    expect(
      (await saveSavedPassenger(userId, { firstName: "A", lastName: "Vural" })).ok
    ).toBe(false);
  });

  it("yabancı uyruklu kişi için ülke zorunludur", async () => {
    const userId = await createUser();
    const res = await saveSavedPassenger(userId, {
      firstName: "John",
      lastName: "Smith",
      nationality: "FOREIGN",
    });
    expect(res.ok).toBe(false);

    const ok = await saveSavedPassenger(userId, {
      firstName: "John",
      lastName: "Smith",
      nationality: "FOREIGN",
      country: "Almanya",
    });
    expect(ok.ok).toBe(true);
  });

  it("yalnız bir kişi 'ben' olarak işaretli kalır", async () => {
    const userId = await createUser();
    await saveSavedPassenger(userId, {
      firstName: "Birinci",
      lastName: "Kişi",
      idNumber: GECERLI_TC,
      isSelf: true,
    });
    await saveSavedPassenger(userId, {
      firstName: "İkinci",
      lastName: "Kişi",
      idNumber: GECERLI_TC_2,
      isSelf: true,
    });
    const list = await listSavedPassengers(userId);
    expect(list.filter((p) => p.isSelf)).toHaveLength(1);
    expect(list.filter((p) => p.isSelf)[0].firstName).toBe("İkinci");
  });
});

describe("sahiplik sınırları", () => {
  it("başka kullanıcının kaydı listelenmez", async () => {
    const a = await createUser();
    const b = await createUser();
    await saveSavedPassenger(a, {
      firstName: "Gizli",
      lastName: "Kişi",
      idNumber: GECERLI_TC,
    });
    expect(await listSavedPassengers(b)).toHaveLength(0);
  });

  it("başka kullanıcının kaydı güncellenemez", async () => {
    const a = await createUser();
    const b = await createUser();
    await saveSavedPassenger(a, { firstName: "Gizli", lastName: "Kişi" });
    const [row] = await listSavedPassengers(a);

    const res = await updateSavedPassenger(b, row.id, {
      firstName: "Çalındı",
      lastName: "Kişi",
    });
    expect(res.ok).toBe(false);
    // Kayıt olduğu gibi kalmalı.
    expect((await listSavedPassengers(a))[0].firstName).toBe("Gizli");
  });

  it("başka kullanıcının kaydı silinemez", async () => {
    const a = await createUser();
    const b = await createUser();
    await saveSavedPassenger(a, { firstName: "Gizli", lastName: "Kişi" });
    const [row] = await listSavedPassengers(a);

    const res = await deleteSavedPassenger(b, row.id);
    expect(res.ok).toBe(false);
    expect(await listSavedPassengers(a)).toHaveLength(1);

    // Sahibi silebilir.
    expect((await deleteSavedPassenger(a, row.id)).ok).toBe(true);
    expect(await listSavedPassengers(a)).toHaveLength(0);
  });
});

describe("saveFromBooking", () => {
  it("satın alma akışından gelen kişileri kaydeder, geçersiz olanı atlar", async () => {
    const userId = await createUser();
    const res = await saveFromBooking(userId, [
      { firstName: "Geçerli", lastName: "Yolcu", idNumber: GECERLI_TC },
      { firstName: "X", lastName: "Y" }, // ad çok kısa → atlanır
      { firstName: "İkinci", lastName: "Yolcu", birthDate: "2015-01-01" },
    ]);
    expect(res.saved).toBe(2);
    expect(await listSavedPassengers(userId)).toHaveLength(2);
  });

  it("aynı rezervasyon iki kez işlenirse kayıt çoğalmaz", async () => {
    const userId = await createUser();
    const yolcular = [
      { firstName: "Tekrar", lastName: "Eden", idNumber: GECERLI_TC },
    ];
    await saveFromBooking(userId, yolcular);
    await saveFromBooking(userId, yolcular);
    expect(await listSavedPassengers(userId)).toHaveLength(1);
  });
});

describe("updateSavedPassenger", () => {
  it("elle düzenlemede alan boşaltılabilir (yanlış girilen kimlik no silinir)", async () => {
    const userId = await createUser();
    await saveSavedPassenger(userId, {
      firstName: "Düzelt",
      lastName: "Beni",
      idNumber: GECERLI_TC,
      gender: "E",
    });
    const [row] = await listSavedPassengers(userId);

    const res = await updateSavedPassenger(userId, row.id, {
      firstName: "Düzelt",
      lastName: "Beni",
      idNumber: "",
      gender: undefined,
    });
    expect(res.ok).toBe(true);

    const [after] = await listSavedPassengers(userId);
    expect(after.idNumber).toBe("");
    expect(after.gender).toBe("");
  });
});
