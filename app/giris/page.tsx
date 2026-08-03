import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, safeNext } from "@/lib/session";
import { isGoogleConfigured } from "@/auth";
import AuthShell, { OrDivider } from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";
import GoogleButton from "@/components/auth/GoogleButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Giriş Yap" };

// Auth.js hata kodlarını Türkçe mesaja çevir.
function errorMessage(code?: string): string | null {
  if (!code) return null;
  switch (code) {
    case "OAuthAccountNotLinked":
      return "Bu e-posta farklı bir yöntemle kayıtlı. Lütfen e-posta ve şifrenizle giriş yapın.";
    case "AccessDenied":
      return "Giriş izni verilmedi. Lütfen tekrar deneyin.";
    case "Verification":
      return "Bağlantının süresi dolmuş veya geçersiz.";
    default:
      return "Giriş sırasında bir sorun oluştu. Lütfen tekrar deneyin.";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; sifirlandi?: string }>;
}) {
  const { next, error, sifirlandi } = await searchParams;
  const safe = safeNext(next);

  if (await getCurrentUser()) redirect(safe);

  const err = errorMessage(error);

  return (
    <AuthShell
      title="Giriş Yap"
      subtitle="Hesabınıza girin, puanlarınızı ve rezervasyonlarınızı görün."
      footer={
        <>
          Hesabınız yok mu?{" "}
          <Link
            href={`/kayit${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-semibold text-brand hover:text-accent"
          >
            Kayıt olun
          </Link>
        </>
      }
    >
      {sifirlandi && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.
        </p>
      )}
      {err && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      {isGoogleConfigured() && (
        <>
          <GoogleButton next={safe} />
          <OrDivider />
        </>
      )}

      <LoginForm next={safe} />

      <div className="mt-5 border-t border-slate-100 pt-4 text-center">
        <Link href="/turlar" className="text-xs font-medium text-slate-500 hover:text-brand">
          Üye olmadan turlara göz at →
        </Link>
      </div>
    </AuthShell>
  );
}
