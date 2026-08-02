"use client";

import Link from "next/link";
import { Banner } from "@/lib/shared";
import { ChevronRightIcon } from "@/components/Icons";

// Afişler (kampanyalar) yorumlar gibi kesintisiz, yavaşça kayan bir şerit halinde
// gösterilir. Instagram gönderi formatında (4:5). Fareyle üzerine gelince durur.
export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  if (banners.length === 0) return null;

  // Şeridi doldurmak için en az 4 karta tamamla, sonra kesintisiz döngü için ikiye katla.
  let base = banners;
  while (base.length < 4) base = [...base, ...banners];
  const loop = [...base, ...base];

  return (
    <section className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
      <div className="flex w-max gap-4 animate-[gb-marquee_50s_linear_infinite] hover:[animation-play-state:paused]">
        {loop.map((b, i) => {
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
              key={`${b.id}-${i}`}
              className="w-52 shrink-0 sm:w-60 md:w-64"
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
    </section>
  );
}
