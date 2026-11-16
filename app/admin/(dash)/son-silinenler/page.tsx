import { listTrash, purgeExpiredTrash, TRASH_RETENTION_DAYS } from "@/lib/trash";
import { formatDate } from "@/lib/shared";
import TrashRow from "@/components/admin/TrashRow";
import { ClockIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Son Silinenler — silinen tur, afiş, otobüs ve özellik kayıtları.
//
// Kayıtlar gerçekten silinmez, işaretlenir (bkz. lib/trash.ts): turun
// seferleri, koltukları ve rezervasyonları olduğu gibi durur, bu yüzden geri
// yükleme kaydı eksiksiz geri getirir. Saklama süresi dolan kayıt kalıcı
// silinir.
export default async function AdminTrash() {
  // Süresi dolanları sayfa açılışında da temizle: günlük cron bir gün
  // kaçırsa bile listede "süresi geçmiş" kayıt görünmesin.
  await purgeExpiredTrash().catch(() => {
    // Temizlik başarısız olsa bile liste gösterilir.
  });

  const items = await listTrash();
  const soonest = items.reduce<number | null>(
    (min, i) => (min === null || i.daysLeft < min ? i.daysLeft : min),
    null
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Son Silinenler</h1>
          <p className="mt-1 text-sm text-slate-500">
            Silinen tur, afiş, otobüs ve özellik kayıtları {TRASH_RETENTION_DAYS} gün
            burada bekler, sonra kalıcı olarak silinir. Geri yüklenen tur, seferleri
            ve rezervasyonlarıyla birlikte geri gelir.
          </p>
        </div>
        {items.length > 0 && (
          <span className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">
            <ClockIcon width={16} height={16} />
            {items.length} kayıt
            {soonest !== null && soonest <= 3 && (
              <span className="text-red-600">· en yakın {soonest} gün</span>
            )}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            Çöp kutusu boş. Panelden sildiğiniz turlar, afişler, otobüsler ve
            özellikler {TRASH_RETENTION_DAYS} gün boyunca burada görünür.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <TrashRow
                key={`${item.model}-${item.id}`}
                item={{
                  model: item.model,
                  modelLabel: item.modelLabel,
                  id: item.id,
                  label: item.label,
                  detail: item.detail,
                  deletedAt: formatDate(item.deletedAt.toISOString()),
                  daysLeft: item.daysLeft,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
