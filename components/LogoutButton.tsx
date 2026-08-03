// Çıkış butonu — logoutUser server action ile oturumu kapatır.
import { logoutUser } from "@/lib/auth-actions";
import { LogOutIcon } from "@/components/Icons";

export default function LogoutButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <form action={logoutUser}>
      <button
        type="submit"
        className={
          className ??
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        }
      >
        <LogOutIcon width={16} height={16} />
        {compact ? "Çıkış" : "Çıkış Yap"}
      </button>
    </form>
  );
}
