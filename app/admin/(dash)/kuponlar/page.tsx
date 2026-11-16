import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/shared";
import { POINTS_PER_LIRA } from "@/lib/coupons";
import CouponForm from "@/components/admin/CouponForm";
import CouponCancelButton from "@/components/admin/CouponCancelButton";
import { GiftIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

const statusStyle: Record<string, { label: string; cls: string }> = {
  AKTIF: { label: "Kullanılabilir", cls: "bg-emerald-50 text-emerald-700" },
  KULLANILDI: { label: "Kullanıldı", cls: "bg-slate-100 text-slate-500" },
  IPTAL: { label: "İptal", cls: "bg-red-50 text-red-600" },
  SURE_DOLDU: { label: "Süresi geçti", cls: "bg-slate-100 text-slate-500" },
};

// Kuponlar — müşterinin puanını çevirdiği ve adminin kampanya için
// oluşturduğu indirim kuponları.
export default async function AdminCoupons() {
  const coupons = await prisma.coupon.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      booking: { select: { id: true } },
    },
  });

  const aktif = coupons.filter((c) => c.status === "AKTIF");
  const aktifTutar = aktif.reduce((t, c) => t + c.amount, 0);
  const kullanilan = coupons.filter((c) => c.status === "KULLANILDI");
  const kullanilanTutar = kullanilan.reduce((t, c) => t + c.amount, 0);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-brand">Kuponlar</h1>
        <p className="mt-1 text-sm text-slate-500">
          İndirim kuponları. Müşteriler puanlarını kupona çevirebilir (
          {POINTS_PER_LIRA} puan = 1 ₺); buradan kampanya kuponu da
          oluşturabilirsiniz. Kupon tek kullanımlıktır.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Kullanılabilir Kupon" value={`${aktif.length} adet`} detail={`${aktifTutar.toLocaleString("tr-TR")} ₺ açık yükümlülük`} />
        <Stat label="Kullanılmış" value={`${kullanilan.length} adet`} detail={`${kullanilanTutar.toLocaleString("tr-TR")} ₺ indirim verildi`} />
        <Stat label="Toplam Kupon" value={`${coupons.length} adet`} detail="tüm zamanlar" />
      </div>

      <div className="mt-6">
        <CouponForm />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Kod</th>
                <th className="px-4 py-3">Tutar</th>
                <th className="px-4 py-3">Sahibi</th>
                <th className="px-4 py-3">Kaynak</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Henüz kupon yok. Yukarıdaki formla kampanya kuponu
                    oluşturabilirsiniz.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => {
                  const st = statusStyle[c.status] ?? statusStyle.IPTAL;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold text-brand">
                        {c.code}
                      </td>
                      <td className="px-4 py-3 font-semibold text-accent">
                        {c.amount.toLocaleString("tr-TR")} ₺
                      </td>
                      <td className="px-4 py-3">
                        {c.user ? (
                          <span className="text-slate-600">
                            {c.user.name ?? c.user.email}
                          </span>
                        ) : (
                          <span className="text-slate-400">herkes</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {c.createdBy === "ADMIN" ? (
                          <span className="flex items-center gap-1 text-xs">
                            <GiftIcon width={13} height={13} /> Kampanya
                          </span>
                        ) : (
                          <span className="text-xs">
                            {c.pointsSpent.toLocaleString("tr-TR")} puan
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDate(c.createdAt.toISOString())}
                        {c.expiresAt && (
                          <span className="block text-slate-400">
                            son: {formatDate(c.expiresAt.toISOString())}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.status === "AKTIF" && <CouponCancelButton id={c.id} />}
                        {c.status === "KULLANILDI" && c.booking && (
                          <a
                            href={`/admin/rezervasyonlar/${c.booking.id}`}
                            className="text-xs font-semibold text-brand hover:underline"
                          >
                            Rezervasyon
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-brand">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
    </div>
  );
}
