import { Review } from "@/lib/tours";
import { COMPANY } from "@/lib/company";

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} yıldız`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={i <= rating ? "#f5a623" : "#e2e8f0"}
        >
          <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
        </svg>
      ))}
    </div>
  );
}

// "G" harfli Google baş harfi rozeti
function GoogleG() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold shadow-sm ring-1 ring-slate-200">
      <span
        style={{
          background: "conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        G
      </span>
    </span>
  );
}

export default function ReviewsSection({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;

  // Kayan şerit için listeyi ikiye katla (kesintisiz döngü)
  const loop = [...reviews, ...reviews];

  return (
    <section className="mt-16">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-brand md:text-3xl">Misafir Yorumları</h2>
          <p className="text-sm text-slate-500">Bizi tercih eden misafirlerimizin görüşleri</p>
        </div>

        {/* Google puan rozeti */}
        <a
          href={COMPANY.google.reviewsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
        >
          <GoogleG />
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-extrabold text-slate-800">
                {COMPANY.google.rating.toFixed(1)}
              </span>
              <Stars rating={Math.round(COMPANY.google.rating)} />
            </div>
            <span className="text-xs text-slate-500">
              {COMPANY.google.reviewCount} Google yorumu
            </span>
          </div>
        </a>
      </div>

      {/* Kayan şerit */}
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
        <div className="flex w-max gap-4 animate-[gb-marquee_40s_linear_infinite] hover:[animation-play-state:paused]">
          {loop.map((r, i) => (
            <article
              key={`${r.id}-${i}`}
              className="w-80 shrink-0 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
            >
              <div className="flex items-center justify-between">
                <Stars rating={r.rating} />
                <GoogleG />
              </div>
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-slate-600">
                “{r.text}”
              </p>
              <div className="mt-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                  {r.author.trim().charAt(0).toUpperCase()}
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-slate-800">{r.author}</p>
                  {r.location && <p className="text-xs text-slate-400">{r.location}</p>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
