"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Seat } from "@/lib/shared";
import { toggleSeatBlock } from "@/lib/admin-actions";

// Acente görevlisi koltukları online satışa kapatır (BLOKE) / açar (BOS).
// Satılı/kilitli koltuklara dokunulamaz.
export default function AdminSeatBlocker({
  tourId,
  rows,
}: {
  tourId: string;
  rows: Seat[][];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function onClick(code: string, status: string) {
    if (status === "SATILDI" || status === "KILITLI") return;
    const block = status === "BOS"; // BOS → kapat, BLOKE → aç
    setBusy(code);
    startTransition(async () => {
      await toggleSeatBlock(tourId, code, block);
      router.refresh();
      setBusy(null);
    });
  }

  function seatClass(status: string) {
    if (status === "SATILDI" || status === "KILITLI")
      return "cursor-not-allowed bg-slate-300 text-slate-500";
    if (status === "BLOKE") return "bg-red-500 text-white hover:bg-red-600";
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
  }

  return (
    <div>
      <div className="mx-auto w-fit rounded-xl border-2 border-slate-200 p-4">
        <div className="mb-3 text-right text-[10px] uppercase tracking-wide text-slate-400">
          Ön (şoför)
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((row, r) => (
            <div key={r} className="flex items-center gap-2">
              <span className="w-4 text-right text-[10px] text-slate-400">{r + 1}</span>
              {row.map((seat, c) =>
                seat.code === "aisle" ? (
                  <div key={c} className="w-4" />
                ) : (
                  <button
                    key={c}
                    type="button"
                    disabled={
                      seat.status === "SATILDI" ||
                      seat.status === "KILITLI" ||
                      busy === seat.code
                    }
                    onClick={() => onClick(seat.code, seat.status)}
                    title={
                      seat.status === "SATILDI" || seat.status === "KILITLI"
                        ? `${seat.code} — dolu`
                        : seat.status === "BLOKE"
                        ? `${seat.code} — kapalı (açmak için tıklayın)`
                        : `${seat.code} — açık (kapatmak için tıklayın)`
                    }
                    className={`h-9 w-9 rounded-md text-[10px] font-semibold transition disabled:opacity-60 ${seatClass(
                      seat.status
                    )}`}
                  >
                    {seat.code}
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded bg-emerald-100" /> Açık (satışta)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded bg-red-500" /> Kapalı (online satışa kapalı)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded bg-slate-300" /> Dolu (satılmış)
        </span>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">
        Kapalı koltuklar online müşteriye görünmez ama acente elden satışta seçilebilir.
      </p>
    </div>
  );
}
