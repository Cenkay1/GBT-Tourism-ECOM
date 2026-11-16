// Admin üye yönetimi — ham veri işlemleri.
//
// Neden lib/admin-actions.ts'te değil: burada yetki kontrolü ve önbellek
// tazeleme YOK, yalnız veri işlemleri var. Böylece testlerden doğrudan
// çağrılabiliyor (lib/booking.ts ↔ admin-actions.ts ile aynı ayrım).
// Yetki (requireAdmin) ve revalidatePath sarmalayıcı server action'lardadır.
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/password";
import { linkGuestBookings } from "@/lib/loyalty";

export type MemberResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export interface CreateMemberInput {
  name: string;
  email: string;
  phone: string;
}

// Kabaca biçim denetimi. Asıl doğrulama e-postanın ulaşıp ulaşmadığıdır;
// buradaki kontrol elle girilen bariz hataları (boşluk, eksik @) yakalar.
function isEmailLike(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// Bu e-postayla yapılmış, HENÜZ bir hesaba bağlı olmayan misafir rezervasyonlar.
//
// Admin kaydetmeden önce uyarılsın diye var: createMember emailVerified'i dolu
// açıyor ve bu rezervasyonlar yeni hesaba otomatik bağlanıyor. Yanlış e-posta
// girilirse başkasının rezervasyonları bu hesaba bağlanırdı.
//
// Karşılaştırma JS'te normalize edilerek yapılıyor — SQLite string eşitliği
// büyük/küçük harf duyarlı ve contactEmail girildiği gibi saklanıyor
// (linkGuestBookings da aynı yolu izliyor; iki sayının uyuşması şart).
export async function countGuestBookingsFor(email: string): Promise<number> {
  const normalized = normalizeEmail(email);
  if (!normalized) return 0;
  const orphans = await prisma.booking.findMany({
    where: { userId: null },
    select: { contactEmail: true },
  });
  return orphans.filter((b) => normalizeEmail(b.contactEmail) === normalized).length;
}

// Admin elle üye açar — acentenin telefonla tanıdığı müşteri için.
//
// Şifre VERİLMEZ: passwordHash null kalır, üye "şifremi unuttum" akışıyla kendi
// şifresini kurar. Böylece admin müşterinin şifresini hiç bilmez.
//
// Hoşgeldin puanı YAZILMAZ: grantWelcome bir kayıt teşviki ve bu üye kendi
// kaydolmadı. Ayrıca aşağıdaki linkGuestBookings geçmiş ödenmiş
// rezervasyonlarının puanını zaten yazıyor — ikisi birlikte çifte ikram olurdu.
export async function createMember(input: CreateMemberInput): Promise<MemberResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = input.phone.trim();

  if (!name) return { ok: false, error: "Üyenin adı yazılmalı." };
  if (!isEmailLike(email)) return { ok: false, error: "Geçerli bir e-posta adresi yazın." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing)
    return { ok: false, error: "Bu e-posta adresiyle kayıtlı bir üye zaten var." };

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      // Admin üyeyi tanıyor → doğrulanmış sayılır. Bunun bilinen sonucu:
      // aynı e-postayla yapılmış misafir rezervasyonları bu hesaba bağlanır
      // (bkz. countGuestBookingsFor).
      emailVerified: new Date(),
      active: true,
    },
  });

  await linkGuestBookings(user.id, email).catch(() => {
    // Bağlama başarısız olursa üye yine açılmıştır; müşteri
    // "Rezervasyonlarım"ı açtığında işlem tekrar denenir (idempotent).
  });

  return { ok: true, userId: user.id };
}

// Üyeliği aç/kapat. Pasif üye giriş yapamaz ve açık oturumu da düşer
// (bkz. auth.ts ve lib/session.ts); verileri olduğu gibi kalır.
export async function setMemberActive(
  id: string,
  active: boolean
): Promise<MemberResult> {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return { ok: false, error: "Üye bulunamadı." };
  await prisma.user.update({ where: { id }, data: { active } });
  return { ok: true, userId: id };
}

export interface MemberDeletionImpact {
  bookings: number; // misafir rezervasyonuna dönecek rezervasyon sayısı
  points: number; // silinecek puan bakiyesi
  pointsRows: number; // silinecek puan defteri satırı
  savedPassengers: number; // silinecek kayıtlı kişi
}

// Kalıcı silmenin sonuçları — onay ekranı bunları sayılarla yazsın diye.
export async function memberDeletionImpact(
  id: string
): Promise<MemberDeletionImpact | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      points: true,
      _count: { select: { bookings: true, pointsLog: true, savedPassengers: true } },
    },
  });
  if (!user) return null;
  return {
    bookings: user._count.bookings,
    points: user.points,
    pointsRows: user._count.pointsLog,
    savedPassengers: user._count.savedPassengers,
  };
}

// Üyeyi kalıcı siler. GERİ ALINAMAZ.
//
// Rezervasyonlar SİLİNMEZ: Booking.userId opsiyonel olduğu için Prisma onu
// null'a çeker (SetNull) ve rezervasyon misafir rezervasyonuna döner — yolcu
// listesi, koltuk, tahsilat ve fatura olduğu gibi kalır. Account, Session,
// PointsLedger ve SavedPassenger şemadaki Cascade tanımıyla silinir, yani puan
// geçmişi ve kayıtlı kişiler gider.
export async function deleteMember(id: string): Promise<MemberResult> {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return { ok: false, error: "Üye bulunamadı." };
  await prisma.user.delete({ where: { id } });
  return { ok: true, userId: id };
}
