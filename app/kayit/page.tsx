import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, safeNext } from "@/lib/session";
import { isGoogleConfigured } from "@/auth";
import AuthShell, { OrDivider } from "@/components/auth/AuthShell";
import RegisterForm from "@/components/auth/RegisterForm";
import GoogleButton from "@/components/auth/GoogleButton";
import { GiftIcon } from "@/components/Icons";
import { WELCOME_POINTS } from "@/lib/loyalty";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kayıt Ol" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safe = safeNext(next);
  if (await getCurrentUser()) redirect(safe);

  return (
    <AuthShell
      title="Hesap Oluştur"
      footer={
        <>
          Zaten üye misiniz?{" "}
          <Link
            href={`/giris${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-semibold text-brand hover:text-accent"
          >
            Giriş yapın
          </Link>
        </>
      }
    >
      <div className="mb-5 flex items-center gap-3 rounded-xl bg-accent/5 px-4 py-3 text-sm text-accent">
        <GiftIcon width={20} height={20} />
        <span>
          Hemen üye olun, <strong>{WELCOME_POINTS.toLocaleString("tr-TR")} hoşgeldin puanı</strong>{" "}
          kazanın. Ödediğiniz her <strong>1&nbsp;₺</strong> hesabınıza <strong>1 puan</strong> olarak
          eklenir.
        </span>
      </div>

      {isGoogleConfigured() && (
        <>
          <GoogleButton next={safe} />
          <OrDivider />
        </>
      )}

      <RegisterForm next={safe} />
    </AuthShell>
  );
}
