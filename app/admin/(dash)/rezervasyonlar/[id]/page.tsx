import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/tours";
import { setBookingStatus, deleteBooking } from "@/lib/admin-actions";
import DeleteButton from "@/components/admin/DeleteButton";
import {
  UsersIcon,
  PhoneIcon,
  MailIcon,
  CalendarIcon,
} from "@/components/Icons";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  ODENDI: "Ödendi",
  BEKLIYOR: "Bekliyor",
  IPTAL: "İptal",
  SURE_DOLDU: "Süre Doldu",
};

export default async function BookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const b = await prisma.booking.findUnique({
    where: { id },
    include: { tour: true, passengers: true },
  });
  if (!b) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/rezervasyonlar"
        className="text-sm text-slate-500 hover:text-brand"
      >
        ← Rezervasyonlar
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Rezervasyon Detayı</h1>
          <p className="mt-1 text-sm text-slate-500">
            No: <span className="font-mono">{b.id.slice(-8).toUpperCase()}</span> •{" "}
            {formatDate(b.createdAt.toISOString())}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            b.status === "ODENDI"
              ? "bg-emerald-50 text-emerald-700"
              : b.status === "BEKLIYOR"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {statusLabel[b.status] ?? b.status}
        </span>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {/* İletişim bilgileri */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-bold text-brand">İletişim Bilgileri</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field icon={<UsersIcon width={16} height={16} />} label="Ad Soyad" value={b.contactName} />
              <Field icon={<PhoneIcon width={16} height={16} />} label="Telefon" value={b.contactPhone} />
              <Field icon={<MailIcon width={16} height={16} />} label="E-posta" value={b.contactEmail} />
              <Field
                icon={<CalendarIcon width={16} height={16} />}
                label="Rezervasyon Tarihi"
                value={formatDate(b.createdAt.toISOString())}
              />
            </dl>
          </section>

          {/* Yolcular */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-bold text-brand">
              Yolcular ({b.passengers.length})
            </h2>
            {b.passengers.length === 0 ? (
              <p className="text-sm text-slate-400">Yolcu bilgisi girilmemiş.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="text-left text-xs uppercase text-slate-400">
                    <tr>
                      <th className="pb-2">#</th>
                      <th className="pb-2">Ad</th>
                      <th className="pb-2">Soyad</th>
                      <th className="pb-2">TC / Pasaport</th>
                      <th className="pb-2">Koltuk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {b.passengers.map((p, i) => (
                      <tr key={p.id}>
                        <td className="py-2.5 text-slate-400">{i + 1}</td>
                        <td className="py-2.5 font-medium text-slate-800">{p.firstName}</td>
                        <td className="py-2.5 font-medium text-slate-800">{p.lastName}</td>
                        <td className="py-2.5 text-slate-600">{p.idNumber ?? "—"}</td>
                        <td className="py-2.5 text-slate-600">{p.seatCode ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Özet + işlemler */}
        <aside className="h-fit space-y-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-bold text-brand">Tur & Tutar</h2>
            <p className="font-medium text-slate-800">{b.tour.title}</p>
            <p className="text-sm text-slate-400">{b.tour.destination}</p>
            <p className="mt-1 text-sm text-slate-500">
              Kalkış: {formatDate(b.tour.departureDate.toISOString())}
            </p>
            {b.boardingName && (
              <p className="mt-1 text-sm text-slate-500">
                Güzergâh:{" "}
                <span className="font-medium text-slate-700">
                  {b.boardingName}
                  {b.dropoffName ? ` → ${b.dropoffName}` : ""}
                </span>
              </p>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-500">Toplam</span>
              <span className="text-lg font-extrabold text-accent">
                {formatPrice(b.totalAmount, b.tour.currency)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 font-bold text-brand">İşlemler</h2>
            <div className="space-y-2">
              {b.status !== "ODENDI" && (
                <StatusForm id={b.id} status="ODENDI" label="Ödendi olarak işaretle" primary />
              )}
              {b.status !== "IPTAL" && (
                <StatusForm id={b.id} status="IPTAL" label="İptal et" />
              )}
              <DeleteButton
                action={async () => {
                  "use server";
                  await deleteBooking(b.id);
                }}
                label="Kaydı sil"
                confirmText="Bu rezervasyon kaydını silmek istediğinize emin misiniz?"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function StatusForm({
  id,
  status,
  label,
  primary,
}: {
  id: string;
  status: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await setBookingStatus(id, status);
      }}
    >
      <button
        className={`w-full rounded-lg py-2 text-sm font-semibold transition ${
          primary
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "border border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
