import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/tours";
import { simulateSuccess, simulateCancel } from "@/lib/payment-actions";

export const dynamic = "force-dynamic";

export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hata?: string }>;
}) {
  const { id } = await params;
  const { hata } = await searchParams;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tour: true, passengers: true },
  });
  if (!booking) notFound();

  const paid = booking.status === "ODENDI";
  const expired =
    booking.status !== "BEKLIYOR" ||
    (booking.holdExpiresAt != null && booking.holdExpiresAt < new Date());

  const success = simulateSuccess.bind(null, id);
  const cancel = simulateCancel.bind(null, id);

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      {/* Simülasyon uyarısı */}
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Test / Simülasyon Ödeme Ekranı.</strong> Gerçek iyzico ödeme sayfası, üye işyeri
        anahtarlarınız tanımlandığında burada açılacaktır. Şimdilik akışı test etmek için aşağıdaki
        butonları kullanın.
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-brand">Ödeme</h1>
        <div className="mt-4 space-y-2 border-y border-slate-100 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Tur</span>
            <span className="font-medium text-slate-800">{booking.tour.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">
              {booking.tour.bookingType === "KOLTUK" ? "Koltuklar" : "Kişi"}
            </span>
            <span className="font-medium text-slate-800">
              {booking.tour.bookingType === "KOLTUK"
                ? booking.passengers.map((p) => p.seatCode).filter(Boolean).join(", ")
                : `${booking.quantity} kişi`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Ad Soyad</span>
            <span className="font-medium text-slate-800">{booking.contactName}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-500">Ödenecek Tutar</span>
          <span className="text-2xl font-extrabold text-accent">
            {formatPrice(booking.totalAmount, booking.tour.currency)}
          </span>
        </div>

        {hata && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{hata}</p>
        )}

        {paid ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-3 text-center text-sm font-semibold text-emerald-700">
            Bu rezervasyonun ödemesi zaten alınmış.
          </p>
        ) : expired ? (
          <p className="mt-6 rounded-lg bg-slate-100 px-3 py-3 text-center text-sm text-slate-500">
            Ödeme süresi doldu. Lütfen turdan yeniden rezervasyon yapın.
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            <form action={success}>
              <button className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700">
                Ödemeyi Tamamla (Başarılı)
              </button>
            </form>
            <form action={cancel}>
              <button className="w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Ödemeden Vazgeç
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
