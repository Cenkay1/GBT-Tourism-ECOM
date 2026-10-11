import { notFound } from "next/navigation";
import BusForm, { BusFormValues } from "@/components/admin/BusForm";
import { updateBus } from "@/lib/admin-actions";
import { prisma } from "@/lib/db";
import { parseSeatMap } from "@/lib/shared";

export const dynamic = "force-dynamic";

export default async function EditBusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hata?: string }>;
}) {
  const { id } = await params;
  const { hata } = await searchParams;
  const [bus, usage] = await Promise.all([
    prisma.bus.findUnique({ where: { id } }),
    prisma.tourDeparture.count({
      where: {
        OR: [{ busId: id }, { busId: null, tour: { busId: id } }],
        bookings: { some: {} },
      },
    }),
  ]);
  if (!bus) notFound();

  const initial: BusFormValues = {
    name: bus.name,
    plate: bus.plate,
    vehicleType: bus.vehicleType,
    seatRows: bus.seatRows,
    doorAfterRow: bus.doorAfterRow ?? undefined,
    backRowFull: bus.backRowFull,
    seatMap: parseSeatMap(bus.seatMap) ?? undefined,
    notes: bus.notes,
    active: bus.active,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-brand">Otobüsü Düzenle</h1>
      <p className="mb-6 text-sm text-slate-500">
        {bus.plate} — {bus.name}
      </p>

      {hata && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}

      {usage > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bu otobüsün kullanıldığı {usage} seferde satış var. Koltuk düzenini
          değiştirirseniz o seferlerin şeması <strong>korunur</strong> — yalnız satışı
          olmayan seferler yeni düzene geçer.
        </div>
      )}

      <BusForm action={updateBus.bind(null, id)} initial={initial} submitLabel="Değişiklikleri Kaydet" />
    </div>
  );
}
