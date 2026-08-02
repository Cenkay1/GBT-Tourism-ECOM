"use client";

import Link from "next/link";
import { useState } from "react";
import { PhoneIcon } from "@/components/Icons";
import { COMPANY, telHref } from "@/lib/company";

const links = [
  { href: "/turlar", label: "Tüm Turlar" },
  { href: "/turlar?kategori=YURT_ICI", label: "Yurt İçi" },
  { href: "/turlar?kategori=YURT_DISI", label: "Yurt Dışı" },
  { href: "/iletisim", label: "İletişim" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Gözdem Burak Turizm"
            className="h-14 w-auto sm:h-18 md:h-20"
          />
        </Link>

        {/* Masaüstü menü */}
        <nav className="hidden items-center gap-6 text-sm font-medium text-brand md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-accent">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Telefon: masaüstünde tam, mobilde sadece ikon */}
          <a
            href={telHref(COMPANY.phones[0])}
            className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark"
          >
            <PhoneIcon width={16} height={16} />
            <span className="hidden sm:inline">{COMPANY.phones[0]}</span>
          </a>

          {/* Hamburger — sadece mobil */}
          <button
            type="button"
            aria-label="Menü"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-brand hover:bg-slate-100 md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobil açılır menü */}
      {open && (
        <nav className="border-t border-slate-100 bg-white md:hidden">
          <div className="mx-auto max-w-6xl px-4 py-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 text-sm font-medium text-brand transition hover:bg-slate-50"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
