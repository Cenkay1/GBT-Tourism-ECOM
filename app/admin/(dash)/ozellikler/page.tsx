import { prisma } from "@/lib/db";
import { createAmenity, deleteAmenity, toggleAmenity } from "@/lib/admin-actions";
import DeleteButton from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

export default async function AdminAmenities() {
  const amenities = await prisma.amenity.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-3 text-base outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand">Tur Özellikleri</h1>
      <p className="mt-1 text-sm text-slate-500">
        Turlara ekleyebileceğiniz hizmetler (Konaklama, Kahvaltı, Rehber…). Burada tanımladıklarınız
        tur ekleme/düzenleme sayfasında işaretlenebilir ve tur detayında “Fiyata Dahil” olarak görünür.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Liste */}
        <div className="space-y-3">
          {amenities.length === 0 ? (
            <p className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
              Henüz özellik eklenmemiş. Sağdaki formdan ekleyin.
            </p>
          ) : (
            amenities.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
              >
                <span className="text-2xl">{a.icon || "✓"}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">{a.name}</p>
                  <p className="text-xs text-slate-400">Sıra: {a.sortOrder}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    a.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {a.active ? "Aktif" : "Pasif"}
                </span>
                <form
                  action={async () => {
                    "use server";
                    await toggleAmenity(a.id, !a.active);
                  }}
                >
                  <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100">
                    {a.active ? "Gizle" : "Aç"}
                  </button>
                </form>
                <DeleteButton
                  action={async () => {
                    "use server";
                    await deleteAmenity(a.id);
                  }}
                  confirmText="Bu özelliği silmek istediğinize emin misiniz?"
                />
              </div>
            ))
          )}
        </div>

        {/* Ekleme formu */}
        <div className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-brand">Yeni Özellik</h2>
          <form action={createAmenity} className="space-y-4">
            <label className={label}>
              Özellik Adı *
              <input name="name" required className={input} placeholder="Örn. Kahvaltı Dahil" />
            </label>
            <label className={label}>
              İkon (emoji, opsiyonel)
              <input name="icon" className={input} placeholder="Örn. 🍳" maxLength={4} />
            </label>
            <p className="-mt-2 text-xs text-slate-400">
              Örnek ikonlar: 🏨 konaklama · 🍳 kahvaltı · 🍽️ yemek · 🚌 ulaşım · 🧭 rehber · 🎫 giriş ·
              📷 fotoğraf · 📶 wifi · 🛡️ sigorta
            </p>
            <label className={label}>
              Sıra
              <input name="sortOrder" type="number" defaultValue={0} className={input} />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input name="active" type="checkbox" defaultChecked className="h-5 w-5" />
              Aktif
            </label>
            <button className="w-full rounded-lg bg-accent py-3 text-sm font-bold text-white hover:bg-accent-dark">
              Özellik Ekle
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
