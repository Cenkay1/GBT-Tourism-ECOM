import Link from "next/link";
import type { Metadata } from "next";
import { confirmEmailVerification } from "@/lib/auth-actions";
import { getCurrentUser } from "@/lib/session";
import AuthShell from "@/components/auth/AuthShell";
import ResendVerification from "@/components/auth/ResendVerification";
import { CheckCircleIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "E-posta Doğrulama" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token
    ? await confirmEmailVerification(token)
    : { ok: false, error: "Doğrulama bağlantısı eksik." };

  const user = await getCurrentUser();

  return (
    <AuthShell
      title="E-posta Doğrulama"
      footer={
        <Link href="/hesabim" className="font-semibold text-brand hover:text-accent">
          Hesabıma git →
        </Link>
      }
    >
      {result.ok ? (
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircleIcon width={30} height={30} />
          </div>
          <p className="mt-4 text-sm text-slate-600">
            E-posta adresiniz başarıyla doğrulandı. Teşekkürler!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-600">{result.error}</p>
          {user && !user.emailVerified && (
            <div className="text-center">
              <p className="mb-3 text-sm text-slate-500">
                Yeni bir doğrulama bağlantısı gönderelim mi?
              </p>
              <ResendVerification variant="block" />
            </div>
          )}
        </div>
      )}
    </AuthShell>
  );
}
