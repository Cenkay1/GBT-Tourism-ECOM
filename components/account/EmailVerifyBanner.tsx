// Doğrulanmamış e-posta için yumuşak uyarı şeridi (girişi engellemez).
import ResendVerification from "@/components/auth/ResendVerification";
import { MailIcon } from "@/components/Icons";

export default function EmailVerifyBanner({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <MailIcon width={18} height={18} />
        <span>
          <strong>{email}</strong> adresi henüz doğrulanmadı. Gelen kutunuzdaki bağlantıya tıklayın.
        </span>
      </div>
      <ResendVerification variant="banner" />
    </div>
  );
}
