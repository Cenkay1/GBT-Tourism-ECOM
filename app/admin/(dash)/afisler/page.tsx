import Link from "next/link";
import { prisma } from "@/lib/db";
import { createBanner, deleteBanner, toggleBanner } from "@/lib/admin-actions";
import { getTourOptions } from "@/lib/tours";
import DeleteButton from "@/components/admin/DeleteButton";
import BannerForm from "@/components/admin/BannerForm";

export const dynamic = "force-dynamic";

export default async function AdminBanners() {
  const [banners, tours] = await Promise.all([
    prisma.banner.findMany({ orderBy: { sortOrder: "asc" } }),
    getTourOptions(),
  ]);

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
                  <p className="font-semibold text-slate-800">{b.title || "(başlıksız)"}</p>
                  <p className="text-sm text-slate-400">{b.subtitle}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Sıra: {b.sortOrder} • Link: {b.linkUrl || "—"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      b.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {b.active ? "Aktif" : "Pasif"}
                  </span>
                  <Link
                    href={`/admin/afisler/${b.id}`}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100"
                  >
                    Düzenle
                  </Link>
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
          <BannerForm action={createBanner} tours={tours} submitLabel="Afiş Ekle" />
        </div>
      </div>
    </div>
  );
}
