// Çöp kutusu ("Son Silinenler") — silinen yönetim kayıtlarının 25 günlük
// geri alma penceresi.
//
// Neden işaretleyerek silme (soft delete) ve JSON kopya DEĞİL: bir tur
// silindiğinde seferleri, koltukları ve rezervasyonları cascade ile gidiyor.
// Kaydın JSON kopyası alınıp gerçekten silinseydi geri yüklemede yeni id'ler
// üretilir, rezervasyonların koltuk ve fatura bağları kopardı. İşaret
// yöntemiyle hiçbir satır silinmez — kayıt yalnız listelerden düşer ve süre
// dolunca kalıcı silinir.
//
// Listelerden düşürme işi burada DEĞİL, lib/db.ts'teki istemci uzantısında:
// bu modeller 36'dan fazla yerde sorgulanıyor ve tek tek filtre eklemek
// birini unutmak demekti.
import { rawPrismaClient } from "@/lib/db";

export const TRASH_RETENTION_DAYS = 25;

// Çöp kutusu olan modeller. lib/db.ts'teki SOFT_DELETE_MODELS ile aynı küme
// olmalı: orada filtrelenmeyen bir model buraya eklenirse kayıt silindiği
// hâlde listelerde görünmeye devam eder.
export const TRASH_MODELS = ["Tour", "Banner", "Bus", "Amenity"] as const;
export type TrashModel = (typeof TRASH_MODELS)[number];

export const TRASH_MODEL_LABELS: Record<TrashModel, string> = {
  Tour: "Tur",
  Banner: "Afiş",
  Bus: "Otobüs",
  Amenity: "Özellik",
};

export type TrashResult = { ok: true } | { ok: false; error: string };

export interface TrashItem {
  model: TrashModel;
  modelLabel: string;
  id: string;
  label: string; // kaydın okunur adı
  detail: string; // ikinci satır (tarih, plaka…)
  deletedAt: Date;
  daysLeft: number; // kalıcı silinmesine kaç gün kaldı
}

// Filtresiz istemci: çöp kutusu SİLİNMİŞ kayıtları görmek zorunda.
function raw() {
  return rawPrismaClient();
}

// Model adı → Prisma delegesi. Dört modelin ortak alanı yalnız id ve
// deletedAt olduğu için işlemler bu küçük arayüz üzerinden yürüyor.
interface SoftDeleteDelegate {
  findUnique(args: {
    where: { id: string };
    select?: Record<string, boolean>;
  }): Promise<Record<string, unknown> | null>;
  update(args: {
    where: { id: string };
    data: { deletedAt: Date | null };
  }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, string>;
  }): Promise<Record<string, unknown>[]>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

function delegateFor(
  client: ReturnType<typeof rawPrismaClient>,
  model: TrashModel
): SoftDeleteDelegate {
  switch (model) {
    case "Tour":
      return client.tour as unknown as SoftDeleteDelegate;
    case "Banner":
      return client.banner as unknown as SoftDeleteDelegate;
    case "Bus":
      return client.bus as unknown as SoftDeleteDelegate;
    case "Amenity":
      return client.amenity as unknown as SoftDeleteDelegate;
  }
}

function isTrashModel(value: string): value is TrashModel {
  return (TRASH_MODELS as readonly string[]).includes(value);
}

// Kaydı çöp kutusuna taşı.
export async function softDeleteRecord(
  model: TrashModel,
  id: string
): Promise<TrashResult> {
  if (!isTrashModel(model)) return { ok: false, error: "Geçersiz kayıt türü." };
  const client = raw();
  try {
    const d = delegateFor(client, model);
    const row = await d.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!row) return { ok: false, error: "Kayıt bulunamadı." };
    // İkinci silme ilk silme tarihini EZMEMELİ: aksi halde 24. günündeki bir
    // kayıt yeniden silinerek süresi baştan başlatılabilirdi.
    if (row.deletedAt)
      return { ok: false, error: "Bu kayıt zaten çöp kutusunda." };

    await d.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

// Kaydı çöp kutusundan geri al.
export async function restoreRecord(
  model: TrashModel,
  id: string
): Promise<TrashResult> {
  if (!isTrashModel(model)) return { ok: false, error: "Geçersiz kayıt türü." };
  const client = raw();
  try {
    const d = delegateFor(client, model);
    const row = await d.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!row) return { ok: false, error: "Kayıt bulunamadı." };
    if (!row.deletedAt) return { ok: false, error: "Bu kayıt çöp kutusunda değil." };

    await d.update({ where: { id }, data: { deletedAt: null } });
    return { ok: true };
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

// Kaydı beklemeden kalıcı sil.
export async function purgeRecord(
  model: TrashModel,
  id: string
): Promise<TrashResult> {
  if (!isTrashModel(model)) return { ok: false, error: "Geçersiz kayıt türü." };
  const client = raw();
  try {
    const d = delegateFor(client, model);
    const row = await d.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!row) return { ok: false, error: "Kayıt bulunamadı." };
    // Yalnız çöp kutusundaki kayıt kalıcı silinebilir: aktif bir turu bu
    // kapıdan silmek geri alma penceresini atlamak olurdu.
    if (!row.deletedAt)
      return { ok: false, error: "Önce kaydı silip çöp kutusuna taşımalısınız." };

    await d.delete({ where: { id } });
    return { ok: true };
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

function daysLeftFrom(deletedAt: Date, now: Date): number {
  const elapsed = (now.getTime() - deletedAt.getTime()) / 86400000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed));
}

// Çöp kutusu içeriği — en son silinen önce.
export async function listTrash(now: Date = new Date()): Promise<TrashItem[]> {
  const client = raw();
  try {
    const items: TrashItem[] = [];

    const tours = await client.tour.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, title: true, destination: true, departureDate: true, deletedAt: true },
    });
    for (const t of tours) {
      items.push({
        model: "Tour",
        modelLabel: TRASH_MODEL_LABELS.Tour,
        id: t.id,
        label: t.title,
        detail: `${t.destination} · ${t.departureDate.toLocaleDateString("tr-TR")}`,
        deletedAt: t.deletedAt!,
        daysLeft: daysLeftFrom(t.deletedAt!, now),
      });
    }

    const banners = await client.banner.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, title: true, subtitle: true, deletedAt: true },
    });
    for (const b of banners) {
      items.push({
        model: "Banner",
        modelLabel: TRASH_MODEL_LABELS.Banner,
        id: b.id,
        label: b.title,
        detail: b.subtitle,
        deletedAt: b.deletedAt!,
        daysLeft: daysLeftFrom(b.deletedAt!, now),
      });
    }

    const buses = await client.bus.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, name: true, plate: true, seatRows: true, deletedAt: true },
    });
    for (const b of buses) {
      items.push({
        model: "Bus",
        modelLabel: TRASH_MODEL_LABELS.Bus,
        id: b.id,
        label: b.name,
        detail: b.plate,
        deletedAt: b.deletedAt!,
        daysLeft: daysLeftFrom(b.deletedAt!, now),
      });
    }

    const amenities = await client.amenity.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, name: true, icon: true, deletedAt: true },
    });
    for (const a of amenities) {
      items.push({
        model: "Amenity",
        modelLabel: TRASH_MODEL_LABELS.Amenity,
        id: a.id,
        label: a.name,
        detail: a.icon,
        deletedAt: a.deletedAt!,
        daysLeft: daysLeftFrom(a.deletedAt!, now),
      });
    }

    return items.sort((x, y) => y.deletedAt.getTime() - x.deletedAt.getTime());
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

// Saklama süresi dolan kayıtları kalıcı sil. Günlük cron'dan çağrılır
// (app/api/cron/reminders) ve çöp kutusu açıldığında da tetiklenir.
// İdempotent: silinecek kayıt yoksa hiçbir şey yapmaz.
export async function purgeExpiredTrash(
  now: Date = new Date()
): Promise<{ purged: number }> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 86400000);
  const client = raw();
  try {
    let purged = 0;
    for (const model of TRASH_MODELS) {
      const d = delegateFor(client, model);
      const res = await d.deleteMany({ where: { deletedAt: { lt: cutoff } } });
      purged += res.count;
    }
    return { purged };
  } finally {
    await client.$disconnect().catch(() => {});
  }
}
