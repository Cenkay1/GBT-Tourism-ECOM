import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateAmenity } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";

export default async function EditAmenityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const a = await prisma.amenity.findUnique({ where: { id } });
  if (!a) notFound();

  const action = updateAmenity.bind(null, id);

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-3 text-base outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-brand">Özelliği Düzenle</h1>
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <form action={action} className="space-y-4">
          <label className={label}>
            Özellik Adı *
            <input name="name" required defaultValue={a.name} className={input} />
          </label>
          <label className={label}>
            İkon (emoji, opsiyonel)
            <input name="icon" defaultValue={a.icon} className={input} maxLength={4} placeholder="Örn. 🍳" />
          </label>
          <label className={label}>
            Sıra
            <input name="sortOrder" type="number" defaultValue={a.sortOrder} className={input} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input name="active" type="checkbox" defaultChecked={a.active} className="h-5 w-5" />
            Aktif
          </label>
          <div className="flex gap-2">
            <button className="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-white hover:bg-accent-dark">
              Değişiklikleri Kaydet
            </button>
            <a
              href="/admin/ozellikler"
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Vazgeç
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
