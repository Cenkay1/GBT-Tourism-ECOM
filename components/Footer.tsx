import Link from "next/link";
import { COMPANY, telHref } from "@/lib/company";

export default function Footer() {
  return (
    <footer className="mt-16 bg-brand text-white/90">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div>
          {/* Lacivert-çizimli logoyu beyaz rozet içinde göster: footer lacivertiyle
              logonun gömülü lacivert arka planı birbirini tutmadığından kutu görünmesin. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Gözdem Burak Turizm"
            className="h-20 w-auto rounded-xl bg-white p-3 shadow-sm"
          />
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
      {/* Yasal linkler + güvenli ödeme bandı */}
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-6 md:flex-row md:justify-between">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/70">
            <li><Link href="/mesafeli-satis" className="hover:text-white">Mesafeli Satış Sözleşmesi</Link></li>
            <li><Link href="/teslimat-iade" className="hover:text-white">Teslimat ve İade Şartları</Link></li>
            <li><Link href="/gizlilik" className="hover:text-white">Gizlilik &amp; KVKK</Link></li>
          </ul>
          {/* Renkli ödeme bandı beyaz rozet içinde: lacivert footer üzerinde
              kart markalarının renkleri doğru görünsün. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/payment/logo_band_colored.svg"
            alt="Visa, MasterCard, Troy ve iyzico ile güvenli ödeme"
            className="h-7 w-auto rounded-md bg-white px-2 py-1"
          />
        </div>
      </div>

      <div className="border-t border-white/15 py-4 text-center text-xs text-white/60">
        © {new Date().getFullYear()} {COMPANY.name}. Tüm hakları saklıdır.
      </div>
    </footer>
  );
}
