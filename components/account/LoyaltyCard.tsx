// Sadakat kartı — puan bakiyesi, kademe rozeti ve sonraki kademeye ilerleme.
// Server component (lib/loyalty tierInfo'yu kullanır).
import { tierInfo } from "@/lib/loyalty";
import { StarIcon, AwardIcon } from "@/components/Icons";

// Kademe → rozet renk sınıfları.
const badgeColor: Record<string, string> = {
  BRONZE: "bg-amber-100 text-amber-800",
  SILVER: "bg-slate-200 text-slate-700",
  GOLD: "bg-yellow-100 text-yellow-800",
  PLATINUM: "bg-indigo-100 text-indigo-800",
};

export default function LoyaltyCard({
  points,
  lifetimePoints,
}: {
  points: number;
  lifetimePoints: number;
}) {
  const { current, next, toNext, progress } = tierInfo(lifetimePoints);

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">
            Puan Bakiyesi
          </p>
          <div className="mt-1 flex items-center gap-2">
            <StarIcon width={26} height={26} className="text-yellow-300" />
            <span className="text-4xl font-extrabold leading-none">
              {points.toLocaleString("tr-TR")}
            </span>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
            badgeColor[current.key] ?? badgeColor.BRONZE
          }`}
        >
          <AwardIcon width={16} height={16} />
          {current.label} Üye
        </span>
      </div>

      {/* İlerleme */}
      <div className="mt-6">
        {next ? (
          <>
            <div className="mb-1.5 flex justify-between text-xs text-white/70">
              <span>{current.label}</span>
              <span>{next.label}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-yellow-300 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-white/80">
              <strong className="text-white">{toNext.toLocaleString("tr-TR")} puan</strong> sonra{" "}
              <strong className="text-white">{next.label}</strong> kademesine
              yükseleceksiniz.
            </p>
          </>
        ) : (
          <p className="text-sm text-white/85">
            🎉 En yüksek kademedesiniz — <strong>{current.label}</strong>. Tüm ayrıcalıklar aktif.
          </p>
        )}
      </div>

      {/* Kademe avantajı */}
      <div className="mt-5 rounded-xl bg-white/10 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">
          Kademe Avantajınız
        </p>
        <p className="mt-0.5 text-sm font-medium">{current.perk}</p>
      </div>
    </div>
  );
}
