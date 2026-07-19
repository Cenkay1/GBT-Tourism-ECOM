"use client";

import Link from "next/link";
import { useRef } from "react";
import { Banner } from "@/lib/shared";
import { ChevronRightIcon } from "@/components/Icons";

// Afişler Instagram gönderi formatında (4:5) yatay şerit halinde gösterilir.
export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  const scroller = useRef<HTMLDivElement>(null);

  if (banners.length === 0) return null;

  function scroll(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <section className="relative">
      <div
        ref={scroller}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((b) => {
          const card = (
            <div className="group relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-slate-100 shadow-md ring-1 ring-black/5 transition duration-300 hover:shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.image}
                alt={b.title || "Kampanya"}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              />
              {b.linkUrl && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/55 to-transparent p-4 opacity-0 transition duration-300 group-hover:opacity-100">
                  <span className="text-sm font-semibold text-white drop-shadow">
                    Detayları Gör
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-brand">
                    <ChevronRightIcon width={18} height={18} />
                  </span>
                </div>
              )}
            </div>
          );
          return (
            <div
              key={b.id}
              className="w-[80%] shrink-0 snap-start sm:w-[55%] md:w-[42%] lg:w-[32%]"
            >
              {b.linkUrl ? (
                <Link href={b.linkUrl} aria-label={b.title || "Kampanya"}>
                  {card}
                </Link>
              ) : (
                card
              )}
            </div>
          );
        })}
      </div>

      {/* Masaüstü kaydırma okları */}
      {banners.length > 3 && (
        <>
          <button
            aria-label="Önceki"
            onClick={() => scroll(-1)}
            className="absolute -left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 rotate-180 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 hover:bg-slate-50 md:flex"
          >
            <ChevronRightIcon width={20} height={20} className="text-brand" />
          </button>
          <button
            aria-label="Sonraki"
            onClick={() => scroll(1)}
            className="absolute -right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 hover:bg-slate-50 md:flex"
          >
            <ChevronRightIcon width={20} height={20} className="text-brand" />
          </button>
        </>
      )}
    </section>
  );
}
