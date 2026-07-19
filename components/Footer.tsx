import Link from "next/link";
import { COMPANY, telHref } from "@/lib/company";

export default function Footer() {
  return (
    <footer className="mt-16 bg-brand text-white/90">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-navy.png" alt="Gözdem Burak Turizm" className="h-20 w-auto" />
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-white">Kurumsal</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/hakkimizda" className="hover:text-white">Hakkımızda</Link></li>
            <li><Link href="/iletisim" className="hover:text-white">İletişim</Link></li>
            <li><Link href="/turlar" className="hover:text-white">Tüm Turlar</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-white">Turlar</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/turlar?kategori=YURT_ICI" className="hover:text-white">Yurt İçi Turlar</Link></li>
            <li><Link href="/turlar?kategori=YURT_DISI" className="hover:text-white">Yurt Dışı Turlar</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-white">İletişim</h3>
          <ul className="space-y-2 text-sm">
            {COMPANY.phones.slice(0, 2).map((p) => (
              <li key={p}>
                <a href={telHref(p)} className="hover:text-white">{p}</a>
              </li>
            ))}
            <li>
              <a href={`mailto:${COMPANY.emails[0]}`} className="break-all hover:text-white">
                {COMPANY.emails[0]}
              </a>
            </li>
            <li className="text-white/70">{COMPANY.address}</li>
          </ul>
          <div className="mt-3 flex gap-3 text-xs">
            <a href={COMPANY.social.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-white">Instagram</a>
            <a href={COMPANY.social.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-white">Facebook</a>
            <a href={COMPANY.social.youtube} target="_blank" rel="noopener noreferrer" className="hover:text-white">YouTube</a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/15 py-4 text-center text-xs text-white/60">
        © {new Date().getFullYear()} {COMPANY.name}. Tüm hakları saklıdır.
      </div>
    </footer>
  );
}
