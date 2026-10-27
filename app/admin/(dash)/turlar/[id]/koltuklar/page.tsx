import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTourById,
  buildSeatGrid,
  vehicleLabel,
  seatStateOf,
  resolveDeparture,
} from "@/lib/tours";
import { formatDateTime, seatLayoutOf, seatNeighbors } from "@/lib/shared";
import { getSeatBoard } from "@/lib/seat-board";
import AdminSeatBoard from "@/components/admin/AdminSeatBoard";

export const dynamic = "force-dynamic";

function depLabel(iso: string, ret?: string): string {
  return ret ? `${formatDateTime(iso)} → ${formatDateTime(ret)}` : formatDateTime(iso);
}

export default async function SeatManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sefer?: string }>;
}) {
  const { id } = await params;
  const { sefer } = await searchParams;
  const tour = await getTourById(id);
  if (!tour) notFound();

  const departures = tour.departures ?? [];
  // Admin geçmiş (arşiv) seferin şemasını da görebilmeli: seçim yoksa satışa
  // açık sefere, o da yoksa en son sefere düşülür.
  const active =
    resolveDeparture(tour, sefer) ?? departures[departures.length - 1];
  const rows = buildSeatGrid(tour, seatStateOf(active));

  // Kim nerede oturuyor + veri uyuşmazlıkları. Koltuk şeması buildSeatGrid'den
  // geliyor; tahta bunları koltuk koduyla eşler.
  const board =
    active && tour.bookingType === "KOLTUK"
      ? await getSeatBoard(tour.id, active.id)
      : { occupants: {}, unseated: [], issues: [] };

  // Yan yana cinsiyet kuralını istemci de gösterebilsin diye komşuluk haritası
  // SUNUCUDA, kuralın tek kaynağı olan seatNeighbors ile üretilir.
  const layout = seatLayoutOf(tour, active);
  const neighbors: Record<string, string[]> = {};
  for (const row of rows)
    for (const seat of row)
      if (seat.code !== "aisle")
        neighbors[seat.code] = seatNeighbors(seat.code, {
          seatMap: layout.seatMap,
          layout: layout.seatLayout,
        });

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-4 text-sm text-slate-500">
        <Link href="/admin/turlar" className="hover:text-brand">Turlar</Link>
        <span className="mx-2">/</span>
        <Link href={`/admin/turlar/${id}`} className="hover:text-brand">{tour.title}</Link>
        <span className="mx-2">/</span>
        <span className="text-brand">Koltuk Yönetimi</span>
      </nav>

      <h1 className="text-2xl font-bold text-brand">Koltuk Yönetimi</h1>
      <p className="mt-1 text-sm text-slate-500">
        {tour.title}
        {/* Araç sefere göre değişebilir: gösterilen düzen seçili seferin aracıdır. */}
        {tour.bookingType === "KOLTUK" && active && (
          <>
            {" "}· {vehicleLabel(active.vehicleType ?? tour.vehicleType)} ·{" "}
            {active.seatLayout ?? tour.seatLayout}
            {active.bus && <> · {active.bus.plate}</>}
          </>
        )}
      </p>

      {/* Koltuklar sefer bazlıdır: hangi seferin şemasını yönettiğinizi seçin. */}
      {departures.length > 1 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-500">Sefer seçin</p>
          <div className="flex flex-wrap gap-2">
            {departures.map((d) => {
              const isActive = d.id === active?.id;
              return (
                <Link
                  key={d.id}
                  href={`/admin/turlar/${id}/koltuklar?sefer=${d.id}`}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? "bg-brand text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {depLabel(d.departureDate, d.returnDate)}
                  {d.status === "KAPALI" && " · kapalı"}
                  {d.isPast && " · arşiv"}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        {tour.bookingType !== "KOLTUK" ? (
          <p className="text-sm text-slate-400">
            Bu tur kontenjanlı; koltuk yönetimi yalnızca koltuk seçimli turlar içindir.
          </p>
        ) : !active ? (
          <p className="text-sm text-slate-400">
            Bu tur için henüz sefer tanımlanmamış. Turu düzenleyip en az bir sefer ekleyin.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">
            Bu sefer için henüz koltuk oluşturulmamış. Turu düzenleyip araç tipi ve sıra sayısını kaydedin.
          </p>
        ) : (
          <>
            {departures.length > 1 && (
              <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Yönetilen sefer: <strong>{depLabel(active.departureDate, active.returnDate)}</strong>
                {active.bus && <> · Araç: {active.bus.plate}</>}
              </p>
            )}
            <AdminSeatBoard
              tourId={tour.id}
              departureId={active.id}
              rows={rows}
              doorAfterRow={active.doorAfterRow ?? tour.doorAfterRow}
              neighbors={neighbors}
              board={board}
              isPast={Boolean(active.isPast)}
            />
          </>
        )}
      </div>
    </div>
  );
}
