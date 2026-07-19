import { prisma } from "@/lib/db";
import { createBanner, deleteBanner, toggleBanner } from "@/lib/admin-actions";
import DeleteButton from "@/components/admin/DeleteButton";
import ImageUpload from "@/components/admin/ImageUpload";

export const dynamic = "force-dynamic";

export default async function AdminBanners() {
  const banners = await prisma.banner.findMany({ orderBy: { sortOrder: "asc" } });

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand">Afişler</h1>
      <p className="mt-1 text-sm text-slate-500">
        Ana sayfadaki kayan afişler / kampanya görselleri.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Liste */}
        <div className="space-y-4">
          {banners.length === 0 ? (
            <p className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
              Henüz afiş eklenmemiş.
            </p>
          ) : (
            banners.map((b) => (
              <div
                key={b.id}
                className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.image}
                  alt={b.title}
                  className="aspect-[4/5] w-full rounded-lg object-cover sm:w-28"
                />
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{b.title}</p>
                  <p className="text-sm text-slate-400">{b.subtitle}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Sıra: {b.sortOrder} • Link: {b.linkUrl || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      b.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {b.active ? "Aktif" : "Pasif"}
                  </span>
                  <form
                    action={async () => {
                      "use server";
                      await toggleBanner(b.id, !b.active);
                    }}
                  >
                    <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100">
                      {b.active ? "Pasifleştir" : "Aktifleştir"}
                    </button>
                  </form>
                  <DeleteButton
                    action={async () => {
                      "use server";
                      await deleteBanner(b.id);
                    }}
                    confirmText="Afişi silmek istediğinize emin misiniz?"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Ekleme formu */}
        <div className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-brand">Yeni Afiş</h2>
          <form action={createBanner} className="space-y-4">
            <label className={label}>
              Başlık (yönetim içi not)
              <input name="title" className={input} placeholder="Örn. Yaz Kampanyası" />
            </label>
            <ImageUpload
              name="image"
              label="Afiş Görseli *"
              hint="Instagram gönderi formatında (4:5) tasarımınızı yükleyin — örn. 1080×1350 px (JPG/PNG/WEBP, en fazla 8 MB)."
            />
            <label className={label}>
              Link (tıklanınca gidilecek)
              <input name="linkUrl" className={input} placeholder="/turlar?kategori=YURT_ICI" />
            </label>
            <label className={label}>
              Sıra
              <input name="sortOrder" type="number" defaultValue={0} className={input} />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input name="active" type="checkbox" defaultChecked className="h-4 w-4" />
              Aktif
            </label>
            <button className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-dark">
              Afiş Ekle
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
