import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { getPointsLedger } from "@/lib/account";
import { tierInfo } from "@/lib/loyalty";
import { StarIcon, GiftIcon } from "@/components/Icons";
import RedeemPointsCard from "@/components/account/RedeemPointsCard";
import { listUserCoupons, POINTS_PER_LIRA, pointsToLira } from "@/lib/coupons";

export const metadata: Metadata = { title: "Puanlarım" };

const reasonLabel: Record<string, string> = {
  KAZANIM: "Rezervasyon puanı",
  HOSGELDIN: "Hoşgeldin puanı",
  DUZELTME: "Puan düzeltmesi",
  IPTAL: "İptal — puan geri alındı",
  KUPON: "Kupona çevrildi",
  KUPON_IPTAL: "Kupon iptali — puan geri yüklendi",
};

const couponStatus: Record<string, { label: string; cls: string }> = {
  AKTIF: { label: "Kullanılabilir", cls: "bg-emerald-50 text-emerald-700" },
  KULLANILDI: { label: "Kullanıldı", cls: "bg-slate-100 text-slate-500" },
  IPTAL: { label: "İptal", cls: "bg-slate-100 text-slate-500" },
  SURE_DOLDU: { label: "Süresi geçti", cls: "bg-slate-100 text-slate-500" },
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export default async function MyPointsPage() {
  const user = (await getCurrentUser())!;
  const ledger = await getPointsLedger(user.id);
  const coupons = await listUserCoupons(user.id);
  const { current, next, toNext } = tierInfo(user.lifetimePoints);

  return (
    <div className="space-y-6">
      {/* Özet */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Güncel Puan</p>
          <p className="mt-0.5 flex items-center gap-1 text-xl font-extrabold text-brand">
            <StarIcon width={18} height={18} className="text-yellow-400" />
            {user.points.toLocaleString("tr-TR")}
          </p>
          {/* TL karşılığı AÇIKÇA yazılır: müşteri puan sayısını TL sanmasın. */}
          <p className="mt-0.5 text-xs text-slate-400">
            ≈ {pointsToLira(user.points).toLocaleString("tr-TR")} ₺ kupon (
            {POINTS_PER_LIRA} puan = 1 ₺)
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Kademe</p>
          <p className="mt-0.5 text-xl font-extrabold text-brand">{current.label}</p>
        </div>
        <div className="col-span-2 rounded-xl bg-white p-4 shadow-sm sm:col-span-1">
          <p className="text-xs text-slate-500">Sonraki Kademe</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">
            {next ? `${toNext.toLocaleString("tr-TR")} puan → ${next.label}` : "En üst kademe"}
          </p>
        </div>
      </div>

      {/* Kazanım kuralı */}
      <div className="flex items-center gap-3 rounded-xl bg-accent/5 px-4 py-3 text-sm text-accent">
        <GiftIcon width={20} height={20} />
        <span>
          Ödediğiniz her <strong>1&nbsp;₺</strong> hesabınıza <strong>1 puan</strong> olarak eklenir.
        </span>
      </div>

      {/* Puanı kupona çevir */}
      <RedeemPointsCard points={user.points} />

      {/* Kuponlarım */}
      {coupons.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold text-brand">Kuponlarım</h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm">
            {coupons.map((c) => {
              const st = couponStatus[c.status] ?? couponStatus.IPTAL;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-brand">{c.code}</p>
                    <p className="text-xs text-slate-400">
                      {fmtDate(c.createdAt)}
                      {c.note ? ` · ${c.note}` : ""}
                      {c.expiresAt ? ` · son kullanım ${fmtDate(c.expiresAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-accent">
                      {c.amount.toLocaleString("tr-TR")} ₺
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Kupon kodunu ödeme adımındaki &quot;İndirim Kuponu&quot; alanına girin.
          </p>
        </section>
      )}

      {/* Hareketler */}
      <section>
        <h2 className="mb-3 font-bold text-brand">Puan Hareketleri</h2>
        {ledger.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Henüz puan hareketiniz yok.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm">
            {ledger.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {reasonLabel[e.reason] ?? e.reason}
                  </p>
                  <p className="text-xs text-slate-400">
                    {fmtDate(e.createdAt)}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold ${
                    e.delta >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {e.delta >= 0 ? "+" : ""}
                  {e.delta.toLocaleString("tr-TR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
