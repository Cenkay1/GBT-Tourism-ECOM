import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import ProfileForm from "@/components/account/ProfileForm";
import ChangePasswordForm from "@/components/account/ChangePasswordForm";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = (await getCurrentUser())!;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">Profil Bilgileri</h2>
        <ProfileForm
          name={user.name ?? ""}
          phone={user.phone ?? ""}
          email={user.email}
        />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-brand">
          {user.hasPassword ? "Şifre Değiştir" : "Şifre Belirle"}
        </h2>
        <ChangePasswordForm hasPassword={user.hasPassword} />
      </section>
    </div>
  );
}
