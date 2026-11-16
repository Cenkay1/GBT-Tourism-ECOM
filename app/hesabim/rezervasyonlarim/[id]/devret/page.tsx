import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canTransferBooking, TRANSFER_CUTOFF_HOURS } from "@/lib/transfer";
import { submitTransfer } from "@/lib/transfer-actions";
import { bandLabel, formatDate, type AgeBand } from "@/lib/shared";
import TransferForm from "@/components/TransferForm";

export const metadata: Metadata = { title: "Rezervasyon Devri" };
export const dynamic = "force-dynamic";

// Müşterinin kendi rezervasyonunu devrettiği sayfa.
//
// Müşteri AYNI turda devir yapabilir. Başka tura devir fiyat farkı
// doğurduğu için yalnız admin panelinden yapılıyor — müşteri tarafında
// "bizimle iletişime geçin" yönlendirmesi var.
export default async function TransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/hesabim/rezervasyonlarim/${id}/devret`);

  const booking = await prisma.booking.findFirst({
    where: { id, userId: user.id },
    include: {
      passengers: { orderBy: { seatCode: "asc" } },
      tour: { select: { title: true, slug: true, departureDate: true, bookingType: true } },
      departure: { select: { departureDate: true } },
    },
  });
  if (!booking) notFound();

  const eligibility = await canTransferBooking(id);
  const departureDate = booking.departure?.departureDate ?? booking.tour.departureDate;

  return (
    <div className="space-y-5">
      <nav className="text-sm text-slate-500">
        <Link href="/hesabim/rezervasyonlarim" className="hover:text-brand">
          ← Rezervasyonlarım
        </Link>
      </nav>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h1 className="font-bold text-brand">{booking.tour.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kalkış: {formatDate(departureDate.toISOString())} · Rez. No:{" "}
          {booking.id.slice(-8).toUpperCase()}
        </p>
      </div>

      {!eligibility.ok ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">Bu rezervasyon devredilemez</p>
          <p className="mt-1 text-sm text-amber-800">{eligibility.error}</p>
        </div>
      ) : (
        <>
          <TransferForm
            bookingId={booking.id}
            action={submitTransfer}
            passengers={booking.passengers.map((p) => ({
              id: p.id,
              label: `${p.seatCode ? p.seatCode + " · " : ""}${p.firstName} ${p.lastName}`,
              seatCode: p.seatCode,
              ageBandLabel: bandLabel((p.ageBand as AgeBand | null) ?? "ADULT"),
            }))}
          />

          <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">Devir koşulları</p>
            <ul className="mt-2 space-y-1">
              <li>• Devir yalnız ödemesi tamamlanmış rezervasyonlarda yapılabilir.</li>
              <li>
                • Kalkışa {TRANSFER_CUTOFF_HOURS} saatten az kaldıysa devir yapılamaz.
              </li>
              <li>
                • Devredilen kişinin yaş grubu mevcut yolcuyla aynı olmalıdır (fiyat
                değişmemeli).
              </li>
              <li>
                • Yan koltukta karşı cinsten yolcu varsa koltuk değişikliği
                gerekebilir; form size uygun koltukları önerir.
              </li>
              <li>
                • <strong>Başka bir tura</strong> devir yapmak isterseniz fiyat farkı
                oluşabileceği için acentemizle iletişime geçin.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
