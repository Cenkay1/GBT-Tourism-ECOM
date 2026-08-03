import Link from "next/link";
import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import ResetForm from "@/components/auth/ResetForm";

export const metadata: Metadata = { title: "Şifre Sıfırla" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      title="Yeni Şifre Belirle"
      footer={
        <Link href="/giris" className="font-semibold text-brand hover:text-accent">
          ← Giriş ekranına dön
        </Link>
      }
    >
      {token ? (
        <ResetForm token={token} />
      ) : (
        <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-600">
          Geçersiz bağlantı. Lütfen şifre sıfırlama isteğini yeniden başlatın.
        </p>
      )}
    </AuthShell>
  );
}
