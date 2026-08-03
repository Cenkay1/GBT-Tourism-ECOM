import { redirect } from "next/navigation";
import { login, getSessionEmail } from "@/lib/auth";
import PasswordInput from "@/components/PasswordInput";

async function doLogin(fd: FormData) {
  "use server";
  const email = (fd.get("email") as string)?.trim() ?? "";
  const password = (fd.get("password") as string) ?? "";
  const ok = await login(email, password);
  if (!ok) redirect("/admin/login?hata=1");
  redirect("/admin");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ hata?: string }>;
}) {
  if (await getSessionEmail()) redirect("/admin");
  const { hata } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Gözdem Burak Turizm"
            className="mx-auto block h-auto w-40"
          />
          <h1 className="mt-4 text-lg font-bold text-brand">Yönetim Paneli</h1>
        </div>

        {hata && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            E-posta veya şifre hatalı.
          </p>
        )}

        <form action={doLogin} className="space-y-4">
          <label className="block text-sm font-medium text-slate-600">
            E-posta
            <input
              name="email"
              type="email"
              required
              placeholder="E-posta adresiniz"
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="block text-sm font-medium text-slate-600">
            Şifre
            <PasswordInput
              name="password"
              required
              autoComplete="current-password"
              placeholder="Şifreniz"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </label>
          <button className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white transition hover:bg-accent-dark">
            Giriş Yap
          </button>
        </form>
      </div>
    </div>
  );
}
