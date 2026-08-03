"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardIcon,
  TicketIcon,
  StarIcon,
  UserIcon,
} from "@/components/Icons";

const items = [
  { href: "/hesabim", label: "Panel", Icon: DashboardIcon, exact: true },
  { href: "/hesabim/rezervasyonlarim", label: "Rezervasyonlarım", Icon: TicketIcon },
  { href: "/hesabim/puanlarim", label: "Puanlarım", Icon: StarIcon },
  { href: "/hesabim/profil", label: "Profil", Icon: UserIcon },
];

export default function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1.5 shadow-sm">
      {items.map((it) => {
        const active = it.exact
          ? pathname === it.href
          : pathname === it.href || pathname.startsWith(it.href + "/");
        const Icon = it.Icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              active ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon width={16} height={16} />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
