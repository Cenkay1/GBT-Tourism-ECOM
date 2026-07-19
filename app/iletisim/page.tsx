import type { Metadata } from "next";
import { COMPANY, telHref } from "@/lib/company";
import { mapEmbedUrl, mapLinkUrl } from "@/lib/shared";
import { PhoneIcon, MailIcon, MapPinIcon } from "@/components/Icons";

export const metadata: Metadata = {
  title: "İletişim — Gözdem Burak Turizm",
  description: `${COMPANY.name} iletişim bilgileri, adres ve harita.`,
};

export default function ContactPage() {
  return (
    <div>
      <div className="bg-brand">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center">
          <h1 className="text-3xl font-extrabold text-white">İletişim</h1>
          <p className="mt-2 text-white/80">Size yardımcı olmaktan memnuniyet duyarız.</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Bilgiler */}
          <div className="space-y-4">
            <Card icon={<PhoneIcon width={20} height={20} />} title="Telefon">
              <ul className="space-y-1">
                {COMPANY.phones.map((p) => (
                  <li key={p}>
                    <a href={telHref(p)} className="text-slate-700 hover:text-accent">
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>

            <Card icon={<MailIcon width={20} height={20} />} title="E-posta">
              <ul className="space-y-1">
                {COMPANY.emails.map((e) => (
                  <li key={e}>
                    <a href={`mailto:${e}`} className="break-all text-slate-700 hover:text-accent">
                      {e}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>

            <Card icon={<MapPinIcon width={20} height={20} />} title="Adres">
              <p className="text-slate-700">{COMPANY.address}</p>
              <a
                href={mapLinkUrl(COMPANY.mapQuery)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-dark"
              >
                Yol Tarifi Al
              </a>
            </Card>

            {/* Sosyal medya */}
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <h3 className="mb-3 font-bold text-brand">Sosyal Medya</h3>
              <div className="flex flex-wrap gap-2">
                <Social href={COMPANY.social.instagram} label="Instagram" />
                <Social href={COMPANY.social.facebook} label="Facebook" />
                <Social href={COMPANY.social.youtube} label="YouTube" />
              </div>
            </div>
          </div>

          {/* Harita */}
          <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5">
            <iframe
              title={COMPANY.name}
              src={mapEmbedUrl(COMPANY.mapQuery)}
              className="h-full min-h-[420px] w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-2 flex items-center gap-2 text-brand">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10">
          {icon}
        </span>
        <h3 className="font-bold">{title}</h3>
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Social({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-brand transition hover:bg-slate-200"
    >
      {label}
    </a>
  );
}
