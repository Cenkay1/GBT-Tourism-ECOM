import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/tours";
import { bandLabel as bandLabelOf, decodeRooms, paymentMethodLabel, type AgeBand } from "@/lib/shared";
import {
  setBookingStatus,
  deleteBooking,
  setPassengerAgeVerified,
  deletePassengerDocument,
} from "@/lib/admin-actions";
import { idDocumentViewUrl } from "@/lib/id-documents";
import DeleteButton from "@/components/admin/DeleteButton";
import RefundButton from "@/components/admin/RefundButton";
import CancelBookingButton from "@/components/admin/CancelBookingButton";
import {
  UsersIcon,
  PhoneIcon,
  MailIcon,
  CalendarIcon,
  WalletIcon,
} from "@/components/Icons";

export const dynamic = "force-dynamic";

function bandLabel(band: string): string {
  return bandLabelOf(band as AgeBand);
}

// "3|2" → "2 oda — 3 kişi / 2 kişi" gibi okunur bir özet. Yolcuların yaş
// grupları ayrı kolonda görünür (doğum tarihinden hesaplanır).
function roomsSummary(raw: string): string {
  const rooms = decodeRooms(raw);
  if (rooms.length === 0) return "—";
  const single = rooms.filter((n) => n === 1).length;
  return `${rooms.length} oda — ${rooms.map((n) => `${n} kişi`).join(" / ")}${
    single > 0 ? ` (${single} tek kişilik)` : ""
  }`;
}

const paymentStatusLabel: Record<string, string> = {
  BASLATILDI: "Başlatıldı",
  BASARILI: "Başarılı",
  BASARISIZ: "Başarısız",
  IADE: "İade edildi",
};

const paymentStatusStyle: Record<string, string> = {
  BASLATILDI: "bg-amber-50 text-amber-700",
  BASARILI: "bg-emerald-50 text-emerald-700",
  BASARISIZ: "bg-red-50 text-red-600",
  IADE: "bg-slate-100 text-slate-600",
};

const statusLabel: Record<string, string> = {
  ODENDI: "Ödendi",
  BEKLIYOR: "Bekliyor",
  IPTAL: "İptal",
  SURE_DOLDU: "Süre Doldu",
};

export default async function BookingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ odeme?: string }>;
}) {
  const { id } = await params;
  const { odeme } = await searchParams;
  const b = await prisma.booking.findUnique({
    where: { id },
    include: {
      tour: { include: { bus: true } },
      departure: { include: { bus: true } },
      boardingPlace: true,
      passengers: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!b) notFound();

  // iyzico'dan iade edilebilecek ödeme: başarılı, paymentId'si olan ve henüz
  // iade edilmemiş son kayıt. Elden satışta (NAKIT) böyle bir kayıt olmaz.
  const refundablePayment = b.payments.find(
    (p) => p.status === "BASARILI" && p.paymentId && !p.refundedAt
  );

  // Para iade edilmiş ama rezervasyon iptale alınmamış: koltuklar hâlâ dolu,
  // müşteriye bildirim gitmemiş. Bu uyarı veritabanı durumundan türetilir —
  // bileşen durumundan değil — çünkü iade sonrası RefundButton ağaçtan çıkıyor
  // ve kendi uyarısını ekrana basamadan kayboluyor. Elle iptal edilince
  // (status IPTAL) kendiliğinden kaybolur.
  const iadeliAmaIptalsiz =
    b.status !== "IPTAL" && b.payments.some((p) => p.status === "IADE");

  // Yaş onayı bekleyen çocuk/bebek yolcular.
  const pendingAge = b.passengers.filter(
    (p) => p.ageBand && p.ageBand !== "ADULT" && !p.ageVerified
  );

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

      {odeme === "ok" && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Kart ödemesi iyzico üzerinden alındı, rezervasyon “Ödendi” olarak kaydedildi.
        </div>
      )}

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
              <Field
                icon={<WalletIcon width={16} height={16} />}
                label="Ödeme Yöntemi"
                value={paymentMethodLabel(b.paymentMethod)}
              />
            </dl>
          </section>

          {/* Yolcular */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-1 font-bold text-brand">
              Yolcular ({b.passengers.length})
            </h2>
            {pendingAge.length > 0 && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                ⚠ {pendingAge.length} yolcunun yaşı onay bekliyor. Kimlik belgesini görüp
                aşağıdan onaylayın.
              </p>
            )}
            {pendingAge.length === 0 && <div className="mb-4" />}
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
                      <th className="pb-2">Yaş Grubu</th>
                      <th className="pb-2">Oda</th>
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
                        <td className="py-2.5 text-slate-600">
                          {p.ageBand ? (
                            <span className="flex flex-col gap-1">
                              <span>{bandLabel(p.ageBand)}</span>
                              {p.birthDate && (
                                <span className="text-xs text-slate-400">
                                  {p.birthDate.toLocaleDateString("tr-TR")}
                                </span>
                              )}
                              {p.ageBand !== "ADULT" && (
                                <AgeVerification
                                  id={p.id}
                                  verified={p.ageVerified}
                                  hasDocument={Boolean(p.idDocument)}
                                />
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {p.roomIndex != null ? `${p.roomIndex + 1}. Oda` : "—"}
                        </td>
                        <td className="py-2.5 text-slate-600">{p.seatCode ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* iyzico ödeme kayıtları — mutabakat ve uyuşmazlık takibi için.
              Kart verisi tutulmaz; yalnızca iyzico'nun döndürdüğü maskeli özet. */}
          {b.payments.length > 0 && (
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-bold text-brand">Ödeme Kayıtları</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-left text-xs uppercase text-slate-400">
                    <tr>
                      <th className="pb-2">Tarih</th>
                      <th className="pb-2">Durum</th>
                      <th className="pb-2">Tutar</th>
                      <th className="pb-2">Kart</th>
                      <th className="pb-2">iyzico No</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {b.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 text-slate-600">
                          {p.createdAt.toLocaleString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                              paymentStatusStyle[p.status] ?? "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {paymentStatusLabel[p.status] ?? p.status}
                          </span>
                          {p.errorMessage && (
                            <span className="mt-1 block text-xs text-red-500">
                              {p.errorMessage}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {formatPrice(p.paidAmount ?? p.amount, p.currency)}
                          {p.installment != null && p.installment > 1 && (
                            <span className="block text-xs text-slate-400">
                              {p.installment} taksit
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {p.cardLastFour ? (
                            <>
                              **** {p.cardLastFour}
                              {p.cardFamily && (
                                <span className="block text-xs text-slate-400">
                                  {p.cardFamily}
                                </span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 font-mono text-xs text-slate-500">
                          {p.paymentId ?? "—"}
                          {p.refundedAt && (
                            <span className="block font-sans text-xs text-slate-400">
                              İade: {p.refundedAt.toLocaleDateString("tr-TR")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* Özet + işlemler */}
        <aside className="h-fit space-y-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-bold text-brand">Tur & Tutar</h2>
            <p className="font-medium text-slate-800">{b.tour.title}</p>
            <p className="text-sm text-slate-400">{b.tour.destination}</p>
            <p className="mt-1 text-sm text-slate-500">
              Kalkış:{" "}
              {formatDate(
                (b.departure?.departureDate ?? b.tour.departureDate).toISOString()
              )}
              {b.departure?.returnDate &&
                ` → ${formatDate(b.departure.returnDate.toISOString())}`}
            </p>
            {(b.departure?.bus ?? b.tour.bus) && (
              <p className="mt-1 text-sm text-slate-500">
                Araç: {(b.departure?.bus ?? b.tour.bus)!.plate}
                {" · "}
                {(b.departure?.bus ?? b.tour.bus)!.name}
              </p>
            )}
            {(b.boardingPlace?.name ?? b.boardingName) && (
              <p className="mt-1 text-sm text-slate-500">
                Biniş: {b.boardingPlace?.name ?? b.boardingName}
                {b.boardingPlace?.boardingTime && ` · ${b.boardingPlace.boardingTime}`}
              </p>
            )}
            {b.rooms && (
              <p className="mt-1 text-sm text-slate-500">
                Konaklama: {roomsSummary(b.rooms)}
              </p>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-500">Toplam</span>
              <span className="text-lg font-extrabold text-accent">
                {formatPrice(b.totalAmount, b.tour.currency)}
              </span>
            </div>
          </div>

          {iadeliAmaIptalsiz && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              ÖNEMLİ: Bu rezervasyonun ödemesi iade edilmiş ama rezervasyon
              iptale alınmamış. Koltuklar hâlâ dolu görünüyor ve müşteriye
              iptal bildirimi gitmedi. Aşağıdaki &quot;İptal et&quot; düğmesiyle
              rezervasyonu elle iptal edin.
            </div>
          )}

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 font-bold text-brand">İşlemler</h2>
            <div className="space-y-2">
              {/* İptal edilmiş bir rezervasyon "ödendi" yapılamaz: setBookingStatus
                  yalnız durum kolonunu yazar, koltuğa dokunmaz — koltuk IPTAL'de
                  zaten BOS'tur ve ikinci bir müşteriye satılmış olabilir. */}
              {b.status !== "ODENDI" && b.status !== "IPTAL" && (
                <StatusForm id={b.id} status="ODENDI" label="Ödendi olarak işaretle" primary />
              )}
              {b.status !== "IPTAL" && <CancelBookingButton bookingId={b.id} />}
              {/* Online tahsil edilmiş ve henüz iade edilmemiş ödeme varsa
                  parayı iyzico üzerinden geri verebiliriz. */}
              {b.status === "ODENDI" && refundablePayment && (
                <RefundButton
                  bookingId={b.id}
                  amountLabel={formatPrice(
                    refundablePayment.paidAmount ?? refundablePayment.amount,
                    refundablePayment.currency
                  )}
                />
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

// Yolcu satırındaki yaş onay kutusu: belgeyi görüntüle, onayla/geri al, belgeyi sil.
function AgeVerification({
  id,
  verified,
  hasDocument,
}: {
  id: string;
  verified: boolean;
  hasDocument: boolean;
}) {
  return (
    <span className="mt-0.5 flex flex-col items-start gap-1">
      {verified ? (
        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          ✓ Yaş onaylı
        </span>
      ) : (
        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
          Onay bekliyor
        </span>
      )}

      {hasDocument ? (
        <a
          href={idDocumentViewUrl(id)}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-brand underline hover:text-accent"
        >
          Kimlik belgesini gör
        </a>
      ) : (
        <span className="text-xs text-slate-400">Belge yok — tam ücret alındı</span>
      )}

      <span className="flex flex-wrap gap-1.5">
        <form
          action={async () => {
            "use server";
            await setPassengerAgeVerified(id, !verified);
          }}
        >
          <button
            className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
              verified
                ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {verified ? "Onayı geri al" : "Yaşı Onayla"}
          </button>
        </form>
        {hasDocument && (
          <form
            action={async () => {
              "use server";
              await deletePassengerDocument(id);
            }}
          >
            <button className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
              Belgeyi sil
            </button>
          </form>
        )}
      </span>
    </span>
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
