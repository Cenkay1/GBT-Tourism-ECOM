// Başlıktaki hesap alanı — oturuma göre "Giriş" bağlantısı ya da kullanıcı menüsü.
// Server component: cookie'yi okur, plain veriyi client menüye geçirir.
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { tierDef } from "@/lib/loyalty";
import HeaderUserMenu from "@/components/HeaderUserMenu";
import { UserIcon } from "@/components/Icons";

export default async function HeaderAccount() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link
        href="/giris"
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-brand transition hover:bg-slate-50"
      >
        <UserIcon width={16} height={16} />
        <span className="hidden sm:inline">Giriş</span>
      </Link>
    );
  }

  return (
    <HeaderUserMenu
      name={user.name ?? "Hesabım"}
      points={user.points}
      tier={tierDef(user.tier).label}
    />
  );
}
