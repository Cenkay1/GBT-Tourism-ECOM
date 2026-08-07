import type { ReactNode } from "react";

/**
 * Yasal metin sayfaları (Mesafeli Satış, Gizlilik, Teslimat & İade) için ortak
 * başlık bandı + içerik kapsayıcısı. Mevcut Hakkımızda deseniyle uyumludur.
 */
export default function LegalLayout({
  title,
  subtitle,
  updatedAt,
  children,
}: {
  title: string;
  subtitle?: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="bg-brand">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="text-3xl font-extrabold text-white">{title}</h1>
          {subtitle ? <p className="mt-2 text-white/80">{subtitle}</p> : null}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10">
        {updatedAt ? (
          <p className="mb-6 text-sm text-slate-400">Son güncelleme: {updatedAt}</p>
        ) : null}
        <div className="legal-prose space-y-5 leading-relaxed text-slate-600">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Sözleşme başlığı (numaralı madde başlığı). */
export function LegalHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="pt-4 text-lg font-bold text-brand">{children}</h2>
  );
}
