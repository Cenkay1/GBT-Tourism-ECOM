import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import AccountNav from "@/components/account/AccountNav";
import EmailVerifyBanner from "@/components/account/EmailVerifyBanner";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">Hesabım</h1>
          <p className="text-sm text-slate-500">
            Merhaba{user.name ? `, ${user.name}` : ""} 👋
          </p>
        </div>
        <div className="hidden sm:block">
          <LogoutButton />
        </div>
      </div>

      {!user.emailVerified && (
        <div className="mb-5">
          <EmailVerifyBanner email={user.email} />
        </div>
      )}

      <AccountNav />

      <div className="mt-6">{children}</div>

      <div className="mt-8 sm:hidden">
        <LogoutButton />
      </div>
    </div>
  );
}
