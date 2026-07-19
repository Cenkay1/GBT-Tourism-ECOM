import Link from "next/link";
import TourCard from "@/components/TourCard";
import { getPublishedTours, Category } from "@/lib/tours";
import { SearchIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kategori?: string }>;
}) {
  const { q, kategori } = await searchParams;

  const filtered = await getPublishedTours({
    category: kategori as Category | undefined,
    q,
  });

  const tabs: { label: string; value?: string }[] = [
    { label: "Tümü", value: undefined },
    { label: "Yurt İçi", value: "YURT_ICI" },
    { label: "Yurt Dışı", value: "YURT_DISI" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-extrabold text-brand">Turlar</h1>
      <p className="mt-1 text-slate-500">
        {q ? `"${q}" için ` : ""}
        {filtered.length} tur bulundu
      </p>

      {/* Arama kutusu */}
      <form action="/turlar" className="mt-5 flex max-w-xl gap-2">
        {kategori && <input type="hidden" name="kategori" value={kategori} />}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            <SearchIcon width={18} height={18} />
          </span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Tur adı veya destinasyon ara"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm text-slate-800 outline-none focus:border-brand"
          />
        </div>
        <button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark">
          Ara
        </button>
        {q && (
          <Link
            href={`/turlar${kategori ? `?kategori=${kategori}` : ""}`}
            className="flex items-center rounded-xl px-3 text-sm font-medium text-slate-500 hover:text-brand"
          >
            Temizle
          </Link>
        )}
      </form>

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = (kategori ?? undefined) === tab.value;
          const params = new URLSearchParams();
          if (tab.value) params.set("kategori", tab.value);
          if (q) params.set("q", q);
          const href = `/turlar${params.toString() ? `?${params}` : ""}`;
          return (
            <Link
              key={tab.label}
              href={href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active ? "bg-brand text-white" : "bg-white text-brand ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-12 text-center text-slate-500">
          Aradığınız kriterlere uygun tur bulunamadı.
        </p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TourCard key={t.slug} tour={t} />
          ))}
        </div>
      )}
    </div>
  );
}
