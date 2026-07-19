import { prisma } from "@/lib/db";
import { createReview, deleteReview, toggleReview } from "@/lib/admin-actions";
import DeleteButton from "@/components/admin/DeleteButton";
import { COMPANY } from "@/lib/company";

export const dynamic = "force-dynamic";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-sm text-amber-500">
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default async function AdminReviews() {
  const reviews = await prisma.review.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand">Misafir Yorumları</h1>
      <p className="mt-1 text-sm text-slate-500">
        Google puanınız ana sayfada gösterilir: {COMPANY.google.rating.toFixed(1)} ·{" "}
        {COMPANY.google.reviewCount} yorum. Buradan öne çıkarmak istediğiniz yorumları ekleyin.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Liste */}
        <div className="space-y-3">
          {reviews.length === 0 ? (
            <p className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
              Henüz yorum eklenmemiş. Sağdaki formdan ekleyin.
            </p>
          ) : (
            reviews.map((r) => (
              <div key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{r.author}</span>
                      <Stars rating={r.rating} />
                    </div>
                    {r.location && (
                      <p className="text-xs text-slate-400">{r.location}</p>
                    )}
                    <p className="mt-2 text-sm text-slate-600">“{r.text}”</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        r.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {r.active ? "Yayında" : "Gizli"}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-1 border-t border-slate-100 pt-2">
                  <form
                    action={async () => {
                      "use server";
                      await toggleReview(r.id, !r.active);
                    }}
                  >
                    <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100">
                      {r.active ? "Gizle" : "Yayınla"}
                    </button>
                  </form>
                  <DeleteButton
                    action={async () => {
                      "use server";
                      await deleteReview(r.id);
                    }}
                    confirmText="Yorumu silmek istediğinize emin misiniz?"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Ekleme formu */}
        <div className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-brand">Yeni Yorum</h2>
          <form action={createReview} className="space-y-4">
            <label className={label}>
              Yorum Sahibi *
              <input name="author" required className={input} placeholder="Örn. Ayşe K." />
            </label>
            <label className={label}>
              Puan
              <select name="rating" defaultValue="5" className={input}>
                <option value="5">★★★★★ (5)</option>
                <option value="4">★★★★ (4)</option>
                <option value="3">★★★ (3)</option>
                <option value="2">★★ (2)</option>
                <option value="1">★ (1)</option>
              </select>
            </label>
            <label className={label}>
              Yorum Metni *
              <textarea name="text" required rows={4} className={input} placeholder="Müşterinin yorumu..." />
            </label>
            <label className={label}>
              Etiket (opsiyonel)
              <input name="location" className={input} placeholder="Örn. Kapadokya Turu" />
            </label>
            <label className={label}>
              Sıra
              <input name="sortOrder" type="number" defaultValue={0} className={input} />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input name="active" type="checkbox" defaultChecked className="h-4 w-4" />
              Yayında
            </label>
            <button className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-dark">
              Yorum Ekle
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
