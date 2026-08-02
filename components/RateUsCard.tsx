"use client";

import Link from "next/link";
import { COMPANY } from "@/lib/company";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={44}
      height={44}
      fill={filled ? "#f59e0b" : "none"}
      stroke={filled ? "#f59e0b" : "#cbd5e1"}
      strokeWidth={1.5}
      strokeLinejoin="round"
      className="transition-colors"
    >
      <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.9 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 2.5z" />
    </svg>
  );
}

// "G" harfli Google rozeti
function GoogleG() {
  return (
    <span
      style={{
        background: "conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
      className="text-lg font-bold"
    >
      G
    </span>
  );
}

// Not: Google'a yorum API ile gönderilemez (Google kuralı). Bu yüzden müşteriyi
// tek tıkla doğrudan Google'ın kendi yorum ekranına götürüyoruz — orada puanını
// verip yorumunu TEK YERDE yazar. Sitede ayrı bir metin kutusu tutmuyoruz ki
// müşteri aynı yorumu iki kez yazmak zorunda kalmasın.
export default function RateUsCard() {
  function openGoogle() {
    window.open(COMPANY.google.writeReviewUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-5 rounded-2xl bg-white p-8 text-center shadow-sm">
      <h2 className="text-xl font-extrabold text-brand">Deneyiminizi Değerlendirin</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">
        Görüşünüz bizim için çok değerli. Bir yıldıza dokunun — Google&apos;da açılan sayfada
        puanınızı verip yorumunuzu tek seferde yazabilirsiniz.
      </p>

      {/* Yıldızlar — herhangi birine dokununca doğrudan Google'a gider */}
      <div className="mt-5 flex items-center justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} yıldız verip Google'da değerlendir`}
            onClick={openGoogle}
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Star filled={false} />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={openGoogle}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-dark"
      >
        <GoogleG />
        Google&apos;da Değerlendir
      </button>

      <p className="mt-3 text-xs text-slate-400">
        Değerlendirme Google hesabınız üzerinden yapılır; birkaç saniye sürer.
      </p>

      <div className="mt-5">
        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-brand">
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
