"use client";

import { usePathname } from "next/navigation";

// Site başlık/altbilgi gibi genel çerçeveyi /admin altında gizler.
// (Admin paneli kendi düzenini kullanır; müşteri hesap menüsü orada görünmemeli.)
export default function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
