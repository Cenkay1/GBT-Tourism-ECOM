import ImageUpload from "@/components/admin/ImageUpload";
import BannerLinkPicker, { TourOption } from "@/components/admin/BannerLinkPicker";

export interface BannerFormValues {
  title?: string;
  subtitle?: string;
  image?: string;
  linkUrl?: string;
  sortOrder?: number;
  active?: boolean;
}

export default function BannerForm({
  action,
  tours,
  initial,
  submitLabel,
}: {
  action: (fd: FormData) => void;
  tours: TourOption[];
  initial?: BannerFormValues;
  submitLabel: string;
}) {
  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";
  const isNew = !initial;

  return (
    <form action={action} className="space-y-4">
      <label className={label}>
        Başlık (yönetim içi not)
        <input name="title" defaultValue={initial?.title} className={input} placeholder="Örn. Yaz Kampanyası" />
      </label>
      <ImageUpload
        name="image"
        defaultValue={initial?.image}
        label="Afiş Görseli *"
        hint="Instagram gönderi formatında (4:5) tasarımınızı yükleyin — örn. 1080×1350 px (JPG/PNG/WEBP, en fazla 8 MB)."
      />
      <BannerLinkPicker name="linkUrl" tours={tours} defaultValue={initial?.linkUrl ?? ""} />
      <label className={label}>
        Sıra
        <input name="sortOrder" type="number" defaultValue={initial?.sortOrder ?? 0} className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <input name="active" type="checkbox" defaultChecked={initial?.active ?? true} className="h-4 w-4" />
        Aktif
      </label>
      <div className="flex gap-2">
        <button className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-dark">
          {submitLabel}
        </button>
        {!isNew && (
          <a
            href="/admin/afisler"
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Vazgeç
          </a>
        )}
      </div>
    </form>
  );
}
