import { redirect } from "next/navigation";
import { getSessionEmail, logout } from "@/lib/auth";
import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

async function doLogout() {
  "use server";
  await logout();
  redirect("/admin/login");
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await getSessionEmail();
  if (!email) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col bg-brand p-5 text-white md:flex md:min-h-screen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Gözdem Burak Turizm" className="mb-6 h-16 w-auto rounded-lg bg-white p-2" />
          <AdminNav />
          <form action={doLogout} className="mt-auto pt-6">
            <button className="w-full rounded-lg bg-white/10 py-2 text-sm font-medium transition hover:bg-white/20">
              Çıkış Yap
            </button>
          </form>
        </aside>

        {/* İçerik */}
        <div className="flex-1">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
            <div className="md:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Logo" className="h-9 w-auto" />
            </div>
            <span className="ml-auto text-sm text-slate-500">{email}</span>
          </header>
          {/* Mobil nav */}
          <div className="border-b border-slate-200 bg-white px-4 py-2 md:hidden">
            <AdminNav mobile />
          </div>
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
