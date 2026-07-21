"use client";

import { useState } from "react";
import Link from "next/link";
import { COMPANY } from "@/lib/company";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={40}
      height={40}
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

export default function RateUsCard() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (rating === 0) return;
    // Yazılan yorumu panoya kopyala — müşteri Google sayfasında tek tık yapıştırsın.
    if (text.trim()) {
      try {
        await navigator.clipboard.writeText(text.trim());
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
    // Google "yorum yaz" sayfasını müşterinin kendi hesabıyla açılacak şekilde aç.
    window.open(COMPANY.google.writeReviewUrl, "_blank", "noopener,noreferrer");
    setSent(true);
  }

  const active = hover || rating;

  return (
    <div className="mt-5 rounded-2xl bg-white p-8 text-center shadow-sm">
      <h2 className="text-xl font-extrabold text-brand">Deneyiminizi Değerlendirin</h2>
      <p className="mt-1.5 text-sm text-slate-500">
        Görüşünüz bizim için çok değerli. Puanınızı verip yorumunuzu Google&apos;da paylaşın.
      </p>

      {/* Yıldızlar */}
      <div className="mt-5 flex items-center justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} yıldız`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Star filled={n <= active} />
          </button>
        ))}
      </div>

      {/* Yorum */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Yorumunuzu buraya yazın… (isteğe bağlı)"
        className="mt-5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand focus:bg-white"
      />

      {!sent ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={rating === 0}
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rating === 0 ? "Önce puan verin" : "Google'da Değerlendir"}
        </button>
      ) : (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {copied
            ? "Yorumunuz panoya kopyalandı. Açılan Google sayfasına yapıştırıp gönderebilirsiniz. Teşekkürler!"
            : "Açılan Google sayfasından yorumunuzu paylaşabilirsiniz. Teşekkürler!"}
          <div className="mt-2">
            <a
              href={COMPANY.google.writeReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-emerald-700 underline"
            >
              Google sayfası açılmadıysa buraya tıklayın
            </a>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-brand">
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
