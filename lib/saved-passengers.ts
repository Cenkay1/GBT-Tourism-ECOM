// Kayıtlı yolcular — müşterinin hesabına kaydettiği kişiler (kendisi ve yakınları).
//
// Amaç: rezervasyon formunda TC kimlik no / doğum tarihi gibi alanları her
// seferinde yeniden girmemek. Satın alma formunda listeden seçilir, alanlar
// dolar; müşteri isterse üzerine yazar.
//
// GÜVENLİK: buradaki her fonksiyon userId ALIR ve sorgularını onunla sınırlar.
// Tek bir id ile çağrılan bir güncelleme/silme yoktur — aksi halde başka bir
// müşterinin kaydı kimlik numarasıyla birlikte okunabilir ya da silinebilirdi.
//
// KVKK: kayıt opt-in'dir, müşteri Kişilerim sayfasından silebilir. Rezervasyonun
// kendi Passenger kaydından bağımsızdır: buradan silmek geçmiş rezervasyonu,
// bileti veya faturayı etkilemez.
import { prisma } from "@/lib/db";
import { isValidId } from "@/lib/shared";

export interface SavedPassengerInput {
  firstName: string;
  lastName: string;
  idNumber?: string;
  birthDate?: string; // yyyy-mm-dd
  gender?: "E" | "K";
  nationality?: "TC" | "FOREIGN";
  country?: string;
  label?: string;
  isSelf?: boolean;
}

// İstemciye giden biçim — Date yerine ISO metin (client bileşeni kullanıyor).
export interface SavedPassengerView {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  birthDate: string; // yyyy-mm-dd ya da ""
  gender: "E" | "K" | "";
  nationality: "TC" | "FOREIGN";
  country: string;
  label: string;
  isSelf: boolean;
}

const MAX_SAVED = 30; // makul üst sınır: kötüye kullanım ve liste şişmesine karşı

function dateInput(d: Date | null): string {
  if (!d) return "";
  // Doğum tarihi gün hassasiyetinde tutuluyor; UTC parçaları yeterli ve
  // saat dilimi kaymasına açık değil.
  return d.toISOString().slice(0, 10);
}

export function toView(row: {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string | null;
  birthDate: Date | null;
  gender: string | null;
  nationality: string;
  country: string | null;
  label: string;
  isSelf: boolean;
}): SavedPassengerView {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    idNumber: row.idNumber ?? "",
    birthDate: dateInput(row.birthDate),
    gender: row.gender === "E" || row.gender === "K" ? row.gender : "",
    nationality: row.nationality === "FOREIGN" ? "FOREIGN" : "TC",
    country: row.country ?? "",
    label: row.label,
    isSelf: row.isSelf,
  };
}

// Kullanıcının kayıtlı kişileri. "Ben" kaydı en üstte, sonra ada göre.
export async function listSavedPassengers(
  userId: string
): Promise<SavedPassengerView[]> {
  const rows = await prisma.savedPassenger.findMany({
    where: { userId },
    orderBy: [{ isSelf: "desc" }, { firstName: "asc" }, { lastName: "asc" }],
  });
  return rows.map(toView);
}

export type SaveResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: string };

// Girdi doğrulama — hem Kişilerim formu hem satın alma akışı buradan geçer.
function validate(input: SavedPassengerInput): string | null {
  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  if (first.length < 2) return "Ad en az 2 karakter olmalı.";
  if (last.length < 2) return "Soyad en az 2 karakter olmalı.";

  const foreign = input.nationality === "FOREIGN";
  const id = input.idNumber?.trim() ?? "";
  // Kimlik no zorunlu DEĞİL (müşteri sonra tamamlayabilir) ama girildiyse
  // geçerli olmalı: uydurma numara kaydedilip sonraki rezervasyonlara
  // taşınırsa satın alma sırasında reddedilir ve hata müşteriye orada çıkar.
  if (id && !isValidId(id, foreign))
    return foreign
      ? "Geçerli bir pasaport no girin."
      : "Geçerli bir TC Kimlik No girin (11 hane).";

  if (input.birthDate) {
    const d = new Date(input.birthDate);
    if (Number.isNaN(d.getTime())) return "Doğum tarihi okunamadı.";
    if (d > new Date()) return "Doğum tarihi gelecekte olamaz.";
  }
  if (foreign && !(input.country?.trim())) return "Yabancı uyruklu kişi için ülke seçin.";
  return null;
}

function dataFrom(input: SavedPassengerInput) {
  const foreign = input.nationality === "FOREIGN";
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    idNumber: input.idNumber?.trim() || null,
    birthDate: input.birthDate ? new Date(input.birthDate) : null,
    gender: input.gender === "E" || input.gender === "K" ? input.gender : null,
    nationality: foreign ? "FOREIGN" : "TC",
    country: foreign ? input.country?.trim() || null : "Türkiye",
    label: input.label?.trim().slice(0, 40) ?? "",
    isSelf: Boolean(input.isSelf),
  };
}

// Aynı kişinin ikinci kez kaydedilmesini önler.
//
// Eşleştirme kimlik numarasıyla yapılır (kişiyi tek olarak belirleyen alan).
// Kimlik no yoksa ad+soyad'a düşülür — aksi halde her rezervasyonda aynı
// çocuk için yeni bir satır açılır ve liste kullanılamaz hâle gelir.
async function findExisting(
  userId: string,
  data: ReturnType<typeof dataFrom>
): Promise<{ id: string } | null> {
  if (data.idNumber) {
    const byId = await prisma.savedPassenger.findFirst({
      where: { userId, idNumber: data.idNumber },
      select: { id: true },
    });
    if (byId) return byId;
  }
  const rows = await prisma.savedPassenger.findMany({
    where: { userId },
    select: { id: true, firstName: true, lastName: true },
  });
  const first = data.firstName.toLocaleLowerCase("tr");
  const last = data.lastName.toLocaleLowerCase("tr");
  const match = rows.find(
    (r) =>
      r.firstName.trim().toLocaleLowerCase("tr") === first &&
      r.lastName.trim().toLocaleLowerCase("tr") === last
  );
  return match ? { id: match.id } : null;
}

// Kişiyi kaydet ya da mevcut kaydı güncelle (upsert benzeri).
export async function saveSavedPassenger(
  userId: string,
  input: SavedPassengerInput
): Promise<SaveResult> {
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const data = dataFrom(input);
  const existing = await findExisting(userId, data);

  if (existing) {
    // Güncellemede boş alanlar mevcut değeri EZMEZ: satın alma akışından
    // gelen kayıtta bazı alanlar (ör. cinsiyet) olmayabilir ve daha önce
    // girilmiş bilgiyi silmek istemeyiz.
    await prisma.savedPassenger.update({
      where: { id: existing.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        ...(data.idNumber ? { idNumber: data.idNumber } : {}),
        ...(data.birthDate ? { birthDate: data.birthDate } : {}),
        ...(data.gender ? { gender: data.gender } : {}),
        nationality: data.nationality,
        ...(data.country ? { country: data.country } : {}),
        ...(data.label ? { label: data.label } : {}),
        ...(data.isSelf ? { isSelf: true } : {}),
      },
    });
    return { ok: true, id: existing.id, created: false };
  }

  const count = await prisma.savedPassenger.count({ where: { userId } });
  if (count >= MAX_SAVED)
    return {
      ok: false,
      error: `En fazla ${MAX_SAVED} kişi kaydedebilirsiniz. Kullanmadığınız kayıtları silin.`,
    };

  // "Ben" tek olmalı: yeni bir kayıt kendini "ben" ilan ederse eskisi düşer.
  if (data.isSelf) {
    await prisma.savedPassenger.updateMany({
      where: { userId, isSelf: true },
      data: { isSelf: false },
    });
  }

  const created = await prisma.savedPassenger.create({
    data: { userId, ...data },
    select: { id: true },
  });
  return { ok: true, id: created.id, created: true };
}

// Var olan kaydı güncelle. id SAHİPLİK KONTROLÜYLE birlikte sorgulanır.
export async function updateSavedPassenger(
  userId: string,
  id: string,
  input: SavedPassengerInput
): Promise<SaveResult> {
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const own = await prisma.savedPassenger.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!own) return { ok: false, error: "Kayıt bulunamadı." };

  const data = dataFrom(input);
  if (data.isSelf) {
    await prisma.savedPassenger.updateMany({
      where: { userId, isSelf: true, NOT: { id } },
      data: { isSelf: false },
    });
  }
  // Elle düzenlemede alanlar OLDUĞU GİBİ yazılır: müşteri bir alanı kasıtlı
  // boşaltmış olabilir (örn. yanlış girilmiş kimlik no).
  await prisma.savedPassenger.update({ where: { id }, data });
  return { ok: true, id, created: false };
}

export async function deleteSavedPassenger(
  userId: string,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const result = await prisma.savedPassenger.deleteMany({ where: { id, userId } });
  if (result.count === 0) return { ok: false, error: "Kayıt bulunamadı." };
  return { ok: true };
}

// Satın alma akışından toplu kaydetme.
//
// Müşteri "bu kişiyi kaydet" kutusunu işaretlediği yolcular için çağrılır.
// Best-effort: bir kişi kaydedilemezse (ör. geçersiz kimlik no) diğerleri
// kaydedilir ve satın alma ASLA bloklanmaz — rezervasyon çoktan oluşmuştur.
export async function saveFromBooking(
  userId: string,
  passengers: SavedPassengerInput[]
): Promise<{ saved: number }> {
  let saved = 0;
  for (const p of passengers) {
    try {
      const res = await saveSavedPassenger(userId, p);
      if (res.ok) saved++;
      else console.warn("[kayıtlı yolcu atlandı]", { userId, error: res.error });
    } catch (e) {
      console.error("[kayıtlı yolcu kaydedilemedi]", { userId, error: e });
    }
  }
  return { saved };
}
