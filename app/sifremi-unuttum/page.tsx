import Link from "next/link";
import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import ForgotForm from "@/components/auth/ForgotForm";

export const metadata: Metadata = { title: "Şifremi Unuttum" };

export default function ForgotPage() {
  return (
    <AuthShell
      title="Şifremi Unuttum"
      footer={
        <Link href="/giris" className="font-semibold text-brand hover:text-accent">
          ← Giriş ekranına dön
        </Link>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
