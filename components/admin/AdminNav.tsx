"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardIcon,
  BusIcon,
  ImageIcon,
  TicketIcon,
  UsersIcon,
  UserIcon,
  CheckIcon,
} from "@/components/Icons";

const items = [
  { href: "/admin", label: "Panel", Icon: DashboardIcon, exact: true },
  { href: "/admin/turlar", label: "Turlar", Icon: BusIcon },
  { href: "/admin/ozellikler", label: "Özellikler", Icon: CheckIcon },
  { href: "/admin/afisler", label: "Afişler", Icon: ImageIcon },
  { href: "/admin/rezervasyonlar", label: "Rezervasyonlar", Icon: TicketIcon },
  { href: "/admin/uyeler", label: "Üyeler", Icon: UserIcon },
  { href: "/admin/yorumlar", label: "Yorumlar", Icon: UsersIcon },
];

export default function AdminNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={mobile ? "flex gap-1 overflow-x-auto" : "flex flex-col gap-1"}>
      {items.map((it) => {
        const active = it.exact
          ? pathname === it.href
          : pathname === it.href || pathname.startsWith(it.href + "/");
        const Icon = it.Icon;
        if (mobile) {
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-brand text-white" : "text-brand"
              }`}
            >
              <Icon width={16} height={16} />
              {it.label}
            </Link>
          );
        }
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
            }`}
          >
            <Icon width={18} height={18} />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
