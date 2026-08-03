import Link from "next/link";

// Auth sayfaları için ortak kart düzeni (logo + başlık + içerik + alt bağlantı).
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-14">
      <div className="rounded-2xl bg-white p-7 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Gözdem Burak Turizm" className="mx-auto h-16 w-auto" />
          </Link>
          <h1 className="mt-4 text-xl font-extrabold text-brand">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
      </div>
      {footer && <div className="mt-5 text-center text-sm text-slate-500">{footer}</div>}
    </div>
  );
}

// "veya" ayıracı (Google butonu ile e-posta formu arasında).
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-medium text-slate-400">veya</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
