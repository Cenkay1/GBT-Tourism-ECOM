"use client";

// Rezervasyon detayındaki devir paneli.
//
// Müşteri tarafıyla aynı TransferForm'u kullanıyor; farkı "başka tura devret"
// seçeneği ve görevli notu. Altında bu rezervasyonun devir geçmişi ve varsa
// kapatılmamış fiyat farkı duruyor.
import { useState } from "react";
import TransferForm, {
  type TransferPassengerOption,
  type TransferTourOption,
} from "@/components/TransferForm";
import { adminTransferAction } from "@/lib/admin-actions";
import TransferSettleForm from "@/components/admin/TransferSettleForm";

export interface TransferHistoryRow {
  id: string;
  fromName: string;
  toName: string;
  toPhone: string;
  seatCode: string | null;
  priceDifference: number;
  differenceStatus: string;
  actor: string;
  createdAt: string;
  targetBookingId: string | null;
  currency: string;
}

const diffStatusLabel: Record<string, { label: string; cls: string }> = {
  YOK: { label: "Fark yok", cls: "bg-slate-100 text-slate-500" },
  BEKLIYOR: { label: "Fark tahsil edilmeli", cls: "bg-amber-50 text-amber-800" },
  ODENDI: { label: "Fark tahsil edildi", cls: "bg-emerald-50 text-emerald-700" },
  IADE_BEKLIYOR: { label: "İade edilmeli", cls: "bg-amber-50 text-amber-800" },
  IADE_EDILDI: { label: "İade edildi", cls: "bg-emerald-50 text-emerald-700" },
};

export default function TransferPanel({
  bookingId,
  passengers,
  tours,
  history,
  canTransfer,
  blockReason,
}: {
  bookingId: string;
  passengers: TransferPassengerOption[];
  tours: TransferTourOption[];
  history: TransferHistoryRow[];
  canTransfer: boolean;
  blockReason?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-brand">Devir</h2>
        {canTransfer && passengers.length > 0 && !open && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:bg-accent-dark"
          >
            Yolcu Devret
          </button>
        )}
      </div>

      {!canTransfer && (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Devir yapılamıyor: {blockReason ?? "rezervasyon uygun değil"}.
        </p>
      )}

      {open && (
        <div className="mt-4">
          <TransferForm
            bookingId={bookingId}
            passengers={passengers}
            action={adminTransferAction}
            tours={tours}
            showNote
          />
          <button
            onClick={() => setOpen(false)}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600"
          >
            Formu kapat
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Devir Geçmişi</p>
          {history.map((h) => {
            const st = diffStatusLabel[h.differenceStatus] ?? diffStatusLabel.YOK;
            const needsSettle =
              h.differenceStatus === "BEKLIYOR" || h.differenceStatus === "IADE_BEKLIYOR";
            return (
              <div key={h.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <p className="text-slate-700">
                      <strong>{h.fromName}</strong> → <strong>{h.toName}</strong>
                      {h.seatCode && (
                        <span className="ml-2 text-xs text-slate-500">
                          koltuk {h.seatCode}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {h.createdAt} · {h.actor === "ADMIN" ? "görevli" : "müşteri"} ·{" "}
                      {h.toPhone}
                      {h.targetBookingId && " · başka tura devredildi"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${st.cls}`}
                  >
                    {st.label}
                    {h.priceDifference !== 0 &&
                      ` (${h.priceDifference > 0 ? "+" : ""}${h.priceDifference.toLocaleString(
                        "tr-TR"
                      )} ₺)`}
                  </span>
                </div>

                {needsSettle && (
                  <TransferSettleForm
                    transferId={h.id}
                    amount={h.priceDifference}
                    isRefund={h.priceDifference < 0}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
