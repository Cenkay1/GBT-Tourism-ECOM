import Link from "next/link";
import BannerCarousel from "@/components/BannerCarousel";
import TourCard from "@/components/TourCard";
import ReviewsSection from "@/components/ReviewsSection";
import { getPublishedTours, getActiveBanners, getActiveReviews } from "@/lib/tours";
import { getGoogleBusiness } from "@/lib/google-reviews";
import {
  SearchIcon,
  TicketIcon,
  ShieldIcon,
  HeadsetIcon,
  ChevronRightIcon,
} from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [tours, banners, manualReviews, google] = await Promise.all([
    getPublishedTours(),
    getActiveBanners(),
    getActiveReviews(),
    getGoogleBusiness(),
  ]);
  // Google API varsa canlı yorum/puanı kullan; yoksa elle girilen yorumlara düş.
  const reviews =
    google && google.reviews.length > 0 ? google.reviews : manualReviews;
  const yurtIci = tours.filter((t) => t.category === "YURT_ICI");
  const yurtDisi = tours.filter((t) => t.category === "YURT_DISI");

  return (
    <div>
      {/* Arama bandı (hero) */}
      <div className="relative overflow-hidden bg-brand">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,.35), transparent 40%), radial-gradient(circle at 80% 0%, rgba(106,31,52,.6), transparent 45%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 py-7 text-center md:py-16">
          <h1 className="text-xl font-extrabold text-white sm:text-2xl md:text-4xl">
            Hayalinizdeki tura çıkın
          </h1>
          <p className="mx-auto mt-1.5 max-w-xl text-xs text-white/80 sm:text-sm md:text-base">
            Yurt içi ve yurt dışı turlarımız arasında arayın; online koltuk seçin, güvenle ödeyin.
          </p>

          <form
            action="/turlar"
            className="mx-auto mt-4 flex max-w-2xl flex-col gap-3 rounded-2xl bg-white p-2.5 shadow-xl sm:mt-6 sm:flex-row sm:items-center"
          >
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon width={20} height={20} />
              </span>
              <input
                name="q"
                placeholder="Tur adı veya destinasyon ara (örn. Kapadokya, Balkan)"
                className="w-full rounded-xl border border-transparent bg-slate-50 py-3.5 pl-12 pr-4 text-base text-slate-800 outline-none transition focus:border-brand focus:bg-white"
              />
            </div>
            <button className="flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-3.5 text-base font-semibold text-white transition hover:bg-accent-dark">
              <SearchIcon width={18} height={18} />
              Tur Ara
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-white/70">
            <span>Popüler:</span>
            <QuickSearch label="Kapadokya" />
            <QuickSearch label="Karadeniz" />
            <QuickSearch label="Balkan" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Kampanyalar (afişler — 4:5 Instagram formatı) */}
        {banners.length > 0 && (
          <section className="mt-4">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-extrabold text-brand md:text-3xl">Kampanyalar</h2>
                <p className="text-sm text-slate-500">Güncel fırsatlar ve kampanya afişlerimiz</p>
              </div>
            </div>
            <BannerCarousel banners={banners} />
          </section>
        )}

      {/* Yurt içi */}
      <Section
        title="Yurt İçi Turlar"
        subtitle="Türkiye'nin en güzel rotaları"
        href="/turlar?kategori=YURT_ICI"
      >
        {yurtIci.map((t) => (
          <TourCard key={t.slug} tour={t} />
        ))}
      </Section>

      {/* Yurt dışı */}
      <Section
        title="Yurt Dışı Turlar"
        subtitle="Vizeli ve vizesiz yurt dışı rotaları"
        href="/turlar?kategori=YURT_DISI"
      >
        {yurtDisi.map((t) => (
          <TourCard key={t.slug} tour={t} />
        ))}
      </Section>

      {/* Misafir yorumları */}
      <ReviewsSection
        reviews={reviews}
        rating={google?.rating}
        reviewCount={google?.reviewCount}
      />

      {/* Güven bandı */}
      <div className="mt-16 grid gap-6 rounded-2xl bg-brand p-8 text-white sm:grid-cols-3">
        <Feature
          icon={<TicketIcon width={26} height={26} />}
          title="Online Koltuk Seçimi"
          text="Yerinizi kendiniz seçin, anında rezerve edin."
        />
        <Feature
          icon={<ShieldIcon width={26} height={26} />}
          title="Güvenli Ödeme"
          text="iyzico altyapısı ile 3D Secure ödeme."
        />
        <Feature
          icon={<HeadsetIcon width={26} height={26} />}
          title="7/24 Destek"
          text="Tur boyunca yanınızdayız."
        />
      </div>
      </div>
    </div>
  );
}

function QuickSearch({ label }: { label: string }) {
  return (
    <Link
      href={`/turlar?q=${encodeURIComponent(label)}`}
      className="rounded-full border border-white/25 px-3 py-1 font-medium text-white/90 transition hover:bg-white/15"
    >
      {label}
    </Link>
  );
}

function Section({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-brand">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <Link
          href={href}
          className="flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
        >
          Tümünü gör
          <ChevronRightIcon width={16} height={16} />
        </Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
        {icon}
      </div>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm text-white/80">{text}</p>
      </div>
    </div>
  );
}
