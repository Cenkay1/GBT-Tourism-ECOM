"use client";

// Başlıktaki sepet ikonu + açılan panel.
//
// Sepette tutulan koltuklar ve geri sayım burada görünür: müşteri başka
// sayfaya geçtiğinde koltuklarının tutulduğunu ve ne kadar süresi kaldığını
// görmeye devam eder. Son 2 dakikada rozet kırmızıya döner.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice, genderLabel } from "@/lib/shared";
import type { CartView } from "@/lib/cart";
import { removeFromCartAction, clearCartAction } from "@/lib/cart-actions";

function mmss(total: number): string {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CartBadge({ initialCart }: { initialCart: CartView | null }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Sepetin tek doğru kaynağı SUNUCU. Yerel bir kopya tutulmuyor: kopya
  // tutulsaydı sunucudan gelen taze veriyle eşitlemek için effect içinde
  // setState gerekirdi (kaskad render) ve iki kaynak kolayca ayrışırdı.
  // Değişiklikten sonra router.refresh() çağrılıyor, panel tazeleniyor.
  const cart = initialCart;

  // Geri sayım, bitiş ZAMAN DAMGASINDAN türetiliyor: saniye sayacı yerine
  // "şimdi"yi tutuyoruz. Böylece sunucudan yeni sepet geldiğinde kalan süre
  // kendiliğinden doğru olur ve sayacı elle eşitlemek gerekmez.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const left = cart
    ? Math.max(0, Math.floor((new Date(cart.expiresAt).getTime() - now) / 1000))
    : 0;

  // Süre dolduğunda sunucu tarafı süpürmesi koltuğu bırakmıştır; şemayı ve
  // rozeti tazele. (Effect içinde setState YOK — yalnız refresh.)
  useEffect(() => {
    if (cart && left <= 0) router.refresh();
  }, [cart, left, router]);

  if (!cart || cart.seats.length === 0 || left <= 0) return null;

  const urgent = left <= 120;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Sepetim"
        className="relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-600 transition hover:bg-slate-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        <span
          className={`absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
            urgent ? "bg-red-600" : "bg-accent"
          }`}
        >
          {cart.seats.length}
        </span>
        <span
          className={`hidden text-xs font-bold tabular-nums sm:inline ${
            urgent ? "text-red-600" : "text-slate-500"
          }`}
        >
          {mmss(left)}
        </span>
      </button>

      {open && (
        <>
          {/* Dışa tıklayınca kapat */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold text-brand">{cart.tourTitle}</p>
                <p className="text-xs text-slate-400">
                  {new Date(cart.departureDate).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold tabular-nums ${
                  urgent ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {mmss(left)}
              </span>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Koltuklarınız sizin için tutuluyor. Süre dolduğunda satışa açılır.
            </p>

            <div className="mt-3 space-y-1.5">
              {cart.seats.map((s) => (
                <div
                  key={s.code}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm font-semibold text-slate-700">
                    {s.code}
                    {s.gender && (
                      <span className="ml-2 text-xs font-medium text-slate-500">
                        {genderLabel(s.gender)}
                      </span>
                    )}
                  </span>
                  <button
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await removeFromCartAction(cart.departureId, s.code);
                        router.refresh();
                      })
                    }
                    className="text-xs font-medium text-red-600 transition hover:underline disabled:opacity-40"
                  >
                    Çıkar
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500">Toplam</span>
              <span className="font-extrabold text-accent">
                {formatPrice(cart.total, cart.currency)}
              </span>
            </div>

            <Link
              href={`/rezervasyon?tur=${cart.tourSlug}&sefer=${cart.departureId}&koltuklar=${cart.seats
                .map((s) => `${s.code}:${s.gender ?? "E"}`)
                .join(",")}`}
              onClick={() => setOpen(false)}
              className="mt-3 block rounded-xl bg-accent py-2.5 text-center text-sm font-bold text-white transition hover:bg-accent-dark"
            >
              Rezervasyonu Tamamla
            </Link>
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await clearCartAction();
                  setOpen(false);
                  router.refresh();
                })
              }
              className="mt-2 w-full text-center text-xs text-slate-400 transition hover:text-slate-600 disabled:opacity-40"
            >
              Sepeti boşalt
            </button>
          </div>
        </>
      )}
    </div>
  );
}
