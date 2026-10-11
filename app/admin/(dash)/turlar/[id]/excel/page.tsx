import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  EXCEL_COLUMNS,
  DEFAULT_COLUMN_KEYS,
  HOTEL_TEMPLATE_KEYS,
  decodeColumnKeys,
} from "@/lib/excel-columns";
import ExcelExportForm from "@/components/admin/ExcelExportForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { deleteExcelTemplate } from "@/lib/excel-template-actions";

export const dynamic = "force-dynamic";

export default async function ExcelExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tour, templates] = await Promise.all([
    prisma.tour.findUnique({
      where: { id },
      include: {
        bus: true,
        departures: {
          orderBy: { departureDate: "asc" },
          include: {
            bus: true,
            bookings: {
              where: { OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }] },
              include: { _count: { select: { passengers: true } } },
            },
          },
        },
      },
    }),
    prisma.excelTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!tour) notFound();

  const now = new Date();
  const departures = tour.departures.map((d) => ({
    id: d.id,
    label:
      d.departureDate.toLocaleString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) + (d.bus?.plate ? ` · ${d.bus.plate}` : ""),
    passengerCount: d.bookings.reduce((s, b) => s + b._count.passengers, 0),
    isPast: d.departureDate < now,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/turlar" className="text-sm text-slate-500 hover:text-brand">
        ← Turlar
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-brand">Excel Yolcu Listesi</h1>
      <p className="mt-1 text-sm text-slate-500">{tour.title}</p>

      <div className="mt-6">
        <ExcelExportForm
          tourId={tour.id}
          departures={departures}
          columns={EXCEL_COLUMNS.map((c) => ({
            key: c.key,
            label: c.label,
            group: c.group,
          }))}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            columns: decodeColumnKeys(t.columns),
          }))}
          defaultKeys={DEFAULT_COLUMN_KEYS}
          hotelKeys={HOTEL_TEMPLATE_KEYS}
        />
      </div>

      {templates.length > 0 && (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 font-bold text-brand">Kayıtlı şablonlar</h2>
          <p className="mb-4 text-xs text-slate-400">
            Şablonlar tüm turlarda kullanılabilir.
          </p>
          <ul className="divide-y divide-slate-100">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{t.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    {decodeColumnKeys(t.columns)
                      .map((k) => EXCEL_COLUMNS.find((c) => c.key === k)?.label ?? k)
                      .join(" · ")}
                  </p>
                </div>
                <span className="shrink-0">
                  <DeleteButton
                    action={async () => {
                      "use server";
                      await deleteExcelTemplate(t.id);
                    }}
                    label="Sil"
                    confirmText={`"${t.name}" şablonu silinsin mi?`}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
