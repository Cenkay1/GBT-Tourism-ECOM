import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteBus, toggleBus } from "@/lib/admin-actions";
import DeleteButton from "@/components/admin/DeleteButton";
import { VEHICLES, VehicleType, parseSeatMap, seatMapCodes } from "@/lib/shared";
import { BusIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

function seatCount(b: {
  vehicleType: string;
  seatRows: number;
  backRowFull: boolean;
  seatMap: string | null;
}): number {
  const map = parseSeatMap(b.seatMap);
  if (map) return seatMapCodes(map).length;
  const v = VEHICLES[b.vehicleType as VehicleType] ?? VEHICLES.OTOBUS;
  return b.seatRows * (v.left.length + v.right.length) + (b.backRowFull ? 1 : 0);
}

export default async function AdminBuses({
  searchParams,
}: {
  searchParams: Promise<{ hata?: string }>;
}) {
  const { hata } = await searchParams;
  const buses = await prisma.bus.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { tours: true, departures: true } },
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Otobüslerim</h1>
          <p className="mt-1 text-sm text-slate-500">
            Araç filonuz. Koltuk düzeni ve plaka burada tanımlanır; turlarda otobüsü
            seçtiğinizde koltuk şeması birebir oluşur ve hatırlatma mesajlarında plaka yazar.
          </p>
        </div>
        <Link
          href="/admin/otobusler/yeni"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          + Yeni Otobüs
        </Link>
      </div>

      {hata && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {buses.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-slate-400">
              Henüz otobüs eklenmemiş. Araçlarınızı ekleyin, sonra turlarda seçin.
            </p>
            <Link
              href="/admin/otobusler/yeni"
              className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark"
            >
              İlk Otobüsü Ekle
            </Link>
          </div>
        ) : (
          buses.map((b) => {
            const used = b._count.tours + b._count.departures;
            return (
              <div
                key={b.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <BusIcon width={22} height={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800">{b.plate}</p>
                  <p className="text-sm text-slate-500">{b.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {seatCount(b)} koltuk · {b.seatLayout} ·{" "}
                    {b.doorAfterRow ? `kapı ${b.doorAfterRow}. sıradan sonra` : "orta kapı yok"}
                    {b.backRowFull && " · son sıra tam"}
                    {used > 0 && ` · ${used} tur/seferde kullanılıyor`}
                  </p>
                  {b.notes && <p className="mt-0.5 text-xs text-slate-400">{b.notes}</p>}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    b.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {b.active ? "Aktif" : "Pasif"}
                </span>
                <Link
                  href={`/admin/otobusler/${b.id}`}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100"
                >
                  Düzenle
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await toggleBus(b.id, !b.active);
                  }}
                >
                  <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100">
                    {b.active ? "Pasife Al" : "Aktife Al"}
                  </button>
                </form>
                <DeleteButton
                  action={async () => {
                    "use server";
                    await deleteBus(b.id);
                  }}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
