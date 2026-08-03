"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutUser } from "@/lib/auth-actions";
import {
  StarIcon,
  UserIcon,
  TicketIcon,
  DashboardIcon,
  LogOutIcon,
  ChevronRightIcon,
} from "@/components/Icons";

// Giriş yapmış müşteri için başlıktaki puan + isim menüsü (açılır).
export default function HeaderUserMenu({
  name,
  points,
  tier,
}: {
  name: string;
  points: number;
  tier: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const firstName = name.split(" ")[0] || "Hesabım";

  const links = [
    { href: "/hesabim", label: "Panel", Icon: DashboardIcon },
    { href: "/hesabim/rezervasyonlarim", label: "Rezervasyonlarım", Icon: TicketIcon },
    { href: "/hesabim/puanlarim", label: "Puanlarım", Icon: StarIcon },
    { href: "/hesabim/profil", label: "Profil", Icon: UserIcon },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-brand transition hover:bg-slate-50"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
          {firstName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[7rem] truncate sm:inline">{firstName}</span>
        <span className="flex items-center gap-0.5 rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-bold text-accent">
          <StarIcon width={11} height={11} />
          {points.toLocaleString("tr-TR")}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-brand">{name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-accent">
              <StarIcon width={12} height={12} />
              {points.toLocaleString("tr-TR")} puan · {tier}
            </p>
          </div>
          <div className="py-1">
            {links.map((l) => {
              const Icon = l.Icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon width={16} height={16} />
                    {l.label}
                  </span>
                  <ChevronRightIcon width={14} height={14} className="text-slate-300" />
                </Link>
              );
            })}
          </div>
          <form action={logoutUser} className="border-t border-slate-100">
            <button className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              <LogOutIcon width={16} height={16} />
              Çıkış Yap
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
