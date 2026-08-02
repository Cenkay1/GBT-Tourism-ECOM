import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateBanner } from "@/lib/admin-actions";
import { getTourOptions } from "@/lib/tours";
import BannerForm from "@/components/admin/BannerForm";

export const dynamic = "force-dynamic";

export default async function EditBannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [b, tours] = await Promise.all([
    prisma.banner.findUnique({ where: { id } }),
    getTourOptions(),
  ]);
  if (!b) notFound();

  const action = updateBanner.bind(null, id);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-brand">Afişi Düzenle</h1>
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <BannerForm
          action={action}
          tours={tours}
          initial={{
            title: b.title,
            subtitle: b.subtitle,
            image: b.image,
            linkUrl: b.linkUrl,
            sortOrder: b.sortOrder,
            active: b.active,
          }}
          submitLabel="Değişiklikleri Kaydet"
        />
      </div>
    </div>
  );
}
