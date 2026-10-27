"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { genderLabel, bandLabel, formatTime, type AgeBand, type Seat } from "@/lib/shared";
import type { SeatBoard, SeatOccupant } from "@/lib/seat-board";
import { toggleSeatBlock } from "@/lib/admin-actions";
import {
  unseatPassengerAction,
  placePassengerAction,
  swapPassengersAction,
} from "@/lib/seat-board-actions";
import CancelBookingButton from "@/components/admin/CancelBookingButton";

// Sefer koltuk tahtası: kim nerede oturuyor, kimi nereye alıyoruz.
//
// Tek bir durum makinesi:
//   boş     + dolu koltuk/bekleyen yolcu → o yolcu seçilir (taşıma modu)
//   boş     + boş/kapalı koltuk          → BLOKE aç/kapat (eski davranış)
//   seçili  + boş koltuk                 → yerleştir
//   seçili  + dolu koltuk                → takas onayı
//   seçili  + Esc / aynı yolcu           → seçim iptal
//
// Sürükle-bırak YOK: dokunmatikte kırılgan ve klavye için ayrı bir yol
// gerektirirdi. İki tık her girdi yöntemiyle aynı çalışıyor.
export default function AdminSeatBoard({
  tourId,
  departureId,
  rows,
  doorAfterRow,
  neighbors,
  board,
  isPast,
}: {
  tourId: string;
  departureId: string;
  rows: Seat[][];
  doorAfterRow?: number;
  neighbors: Record<string, string[]>;
  board: SeatBoard;
  isPast: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelSeat, setPanelSeat] = useState<string | null>(null);
  const [swapWith, setSwapWith] = useState<string | null>(null); // takas adayının passengerId'si
  const [feedback, setFeedback] = useState<{ error?: string; message?: string } | null>(null);

  const seatByCode = new Map<string, Seat>();
  for (const row of rows) for (const seat of row) if (seat.code !== "aisle") seatByCode.set(seat.code, seat);

  const everyone = [...Object.values(board.occupants), ...board.unseated];
  const byPassenger = new Map(everyone.map((o) => [o.passengerId, o]));
  const selected = selectedId ? byPassenger.get(selectedId) ?? null : null;
  const panelOccupant = panelSeat ? board.occupants[panelSeat] ?? null : null;
  const swapTarget = swapWith ? byPassenger.get(swapWith) ?? null : null;
  const issueBySeat = new Map(board.issues.map((i) => [i.seatCode, i]));

  function reset() {
    setSelectedId(null);
    setSwapWith(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") reset();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const state = await fn();
      setFeedback(state.error ? { error: state.error } : { message: state.message });
      if (!state.error) reset();
      router.refresh();
    });
  }

  // Seçili yolcu bu boş koltuğa oturabilir mi? Yan yana cinsiyet kuralı
  // sunucuda KESİN olarak uygulanıyor; burada aynı kuralı önceden gösterip
  // uygun olmayan koltuğu tıklanamaz yapıyoruz.
  function canPlace(code: string): boolean {
    if (!selected?.gender) return false;
    const seat = seatByCode.get(code);
    if (!seat || seat.status !== "BOS") return false;
    return (neighbors[code] ?? []).every((n) => {
      const other = seatByCode.get(n);
      if (!other || other.status === "BOS" || other.status === "BLOKE") return true;
      return !other.gender || other.gender === selected.gender;
    });
  }

  function onSeatClick(seat: Seat) {
    if (pending) return;
    const occupant = board.occupants[seat.code];

    if (selected) {
      if (occupant) {
        if (occupant.passengerId === selected.passengerId) {
          reset();
          return;
        }
        // Takas sorusu açılırken panel de tıklanan koltuğa geçer: görevli
        // kiminle takas ettiğini onaylamadan önce görür.
        setPanelSeat(seat.code);
        setSwapWith(occupant.passengerId);
        setFeedback(null);
        return;
      }
      if (!canPlace(seat.code)) {
        setFeedback({
          error:
            seat.status === "BLOKE"
              ? `${seat.code} satışa kapalı. Taşımak için önce koltuğu açın.`
              : `${seat.code} koltuğu yan yana cinsiyet kuralına uygun değil.`,
        });
        return;
      }
      run(() => placePassengerAction(tourId, selected.passengerId, seat.code));
      return;
    }

    if (occupant) {
      setPanelSeat(seat.code);
      setSelectedId(occupant.passengerId);
      setFeedback(null);
      return;
    }

    // Boş tahta: eski BLOKE aç/kapat davranışı korunuyor.
    setFeedback(null);
    startTransition(async () => {
      await toggleSeatBlock(tourId, departureId, seat.code, seat.status === "BOS");
      router.refresh();
    });
  }

  function seatClass(seat: Seat): string {
    const occupant = board.occupants[seat.code];
    const isSelected = occupant && occupant.passengerId === selectedId;
    const flagged = issueBySeat.has(seat.code);

    const base = flagged ? "ring-2 ring-orange-400 " : "";
    if (isSelected) return `${base}bg-brand text-white ring-2 ring-brand ring-offset-2`;

    if (selected) {
      // Taşıma modu: hedefler öne çıkar, uygun olmayan boşlar söner.
      if (occupant) return `${base}bg-slate-200 text-slate-700 hover:bg-slate-300`;
      if (canPlace(seat.code))
        return `${base}bg-emerald-200 text-emerald-900 ring-2 ring-emerald-500 hover:bg-emerald-300`;
      return `${base}bg-slate-100 text-slate-300`;
    }

    if (occupant)
      return occupant.bookingStatus === "ODENDI"
        ? `${base}bg-slate-700 text-white hover:bg-slate-800`
        : `${base}bg-amber-400 text-amber-950 hover:bg-amber-500`;
    if (seat.status === "BLOKE") return `${base}bg-red-500 text-white hover:bg-red-600`;
    if (seat.status !== "BOS")
      // Yolcusu olmayan dolu koltuk — sahipsiz, uyarı listesinde görünür.
      return `${base}bg-orange-200 text-orange-900`;
    return `${base}bg-emerald-100 text-emerald-800 hover:bg-emerald-200`;
  }

  function seatTitle(seat: Seat): string {
    const occupant = board.occupants[seat.code];
    if (occupant) return `${seat.code} — ${occupant.fullName}`;
    if (seat.status === "BLOKE") return `${seat.code} — satışa kapalı`;
    if (seat.status !== "BOS") return `${seat.code} — sahipsiz dolu koltuk`;
    return selected ? `${seat.code} — buraya taşı` : `${seat.code} — boş (kapatmak için tıklayın)`;
  }

  const partyHighlight = new Set(selected?.partySeats ?? []);

  return (
    <div>
      {isPast && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Bu sefer arşivde (tarihi geçmiş). Düzenleme yapabilirsiniz, ancak kayıt düzeltmesi
          dışında değişiklik yapmamanız önerilir.
        </p>
      )}

      {/* Taşıma modu duyurusu — ekran okuyucular da durumu bilsin. */}
      <div aria-live="polite" className="sr-only">
        {selected ? `${selected.fullName} taşınıyor. Hedef koltuğu seçin.` : ""}
      </div>

      {selected && !swapTarget && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">
          <span>
            <strong>{selected.fullName}</strong> taşınıyor — vurgulu bir koltuğa tıklayın
            {selected.seatCode ? ` (şu an ${selected.seatCode})` : " (şu an koltuksuz)"}.
          </span>
          <button type="button" onClick={reset} className="font-semibold underline">
            Vazgeç (Esc)
          </button>
        </div>
      )}

      {swapTarget && selected && (
        <div className="mb-4 rounded-lg border border-brand/30 bg-brand/5 px-3 py-3 text-xs">
          <p className="text-slate-700">
            <strong>{selected.fullName}</strong> ({selected.seatCode}) ile{" "}
            <strong>{swapTarget.fullName}</strong> ({swapTarget.seatCode}) koltuklarını
            değiştirmek istiyor musunuz?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => swapPassengersAction(tourId, selected.passengerId, swapTarget.passengerId))
              }
              className="rounded bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Takas ediliyor…" : "Takas et"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={reset}
              className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-600 disabled:opacity-60"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {feedback?.error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {feedback.error}
        </p>
      )}
      {feedback?.message && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {feedback.message}
        </p>
      )}

      <div className="mx-auto w-fit rounded-xl border-2 border-slate-200 p-4">
        <div className="mb-3 text-left text-[10px] uppercase tracking-wide text-slate-400">Şoför</div>
        <div className="flex flex-col gap-2">
          {rows.map((row, r) => (
            <div key={r}>
              <div className="flex items-center gap-2">
                <span className="w-4 text-right text-[10px] text-slate-400">{r + 1}</span>
                {row.map((seat, c) =>
                  seat.code === "aisle" ? (
                    <div key={c} className="w-9" />
                  ) : (
                    <button
                      key={c}
                      type="button"
                      disabled={
                        pending ||
                        // Kurala takılan BOŞ koltuk tıklanamaz. BLOKE koltuk
                        // tıklanabilir kalır: tıklayınca "önce koltuğu açın"
                        // açıklaması çıksın, sessizce ölü görünmesin.
                        Boolean(
                          selected &&
                            !board.occupants[seat.code] &&
                            seat.status === "BOS" &&
                            !canPlace(seat.code)
                        )
                      }
                      aria-pressed={board.occupants[seat.code]?.passengerId === selectedId}
                      onClick={() => onSeatClick(seat)}
                      title={seatTitle(seat)}
                      className={`h-9 w-9 rounded-md text-[10px] font-semibold transition disabled:cursor-not-allowed ${
                        partyHighlight.has(seat.code) ? "outline-dashed outline-2 outline-offset-1 outline-brand/60 " : ""
                      }${seatClass(seat)}`}
                    >
                      {seat.code}
                    </button>
                  )
                )}
              </div>
              {doorAfterRow === r + 1 && (
                <div className="my-2 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />Kapı<span className="h-px flex-1 bg-slate-200" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {panelOccupant && (
        <OccupantPanel
          occupant={panelOccupant}
          pending={pending}
          isMoving={selected?.passengerId === panelOccupant.passengerId}
          onClose={() => {
            setPanelSeat(null);
            reset();
          }}
          onMove={() => {
            setSelectedId(panelOccupant.passengerId);
            setSwapWith(null);
          }}
          onUnseat={() => run(() => unseatPassengerAction(tourId, panelOccupant.passengerId))}
        />
      )}

      {board.unseated.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">
            ⚠ Koltuğu olmayan {board.unseated.length} yolcu
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {board.unseated.map((o) => (
              <button
                key={o.passengerId}
                type="button"
                disabled={pending}
                aria-pressed={o.passengerId === selectedId}
                onClick={() => {
                  setPanelSeat(null);
                  setSwapWith(null);
                  setSelectedId(o.passengerId === selectedId ? null : o.passengerId);
                  setFeedback(null);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                  o.passengerId === selectedId
                    ? "bg-brand text-white"
                    : "bg-white text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
                }`}
              >
                {o.fullName}
                {o.gender && ` (${o.gender})`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-amber-800">
            Yolcuyu seçip şemadaki boş bir koltuğa tıklayın.
          </p>
        </div>
      )}

      {board.issues.length > 0 && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3">
          <p className="text-xs font-semibold text-orange-900">
            ⚠ {board.issues.length} tutarsız kayıt
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-orange-900">
            {board.issues.map((issue, i) => (
              <li key={`${issue.seatCode}-${i}`}>• {issue.message}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-orange-800">
            Bu koltuklar şemada turuncu çerçeveyle işaretli. Yolcuyu koltuktan çıkarıp yeniden
            yerleştirmek çoğu durumda kaydı düzeltir.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-slate-500">
        <Chip className="bg-emerald-100" label="Boş (satışta)" />
        <Chip className="bg-red-500" label="Kapalı (online satışa kapalı)" />
        <Chip className="bg-slate-700" label="Dolu — ödenmiş" />
        <Chip className="bg-amber-400" label="Dolu — bekliyor" />
        <Chip className="bg-orange-200 ring-2 ring-orange-400" label="Tutarsız kayıt" />
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">
        Dolu koltuğa tıklayın: yolcuyu görün, taşıyın ya da koltuktan çıkarın. Boş koltuğa
        tıklamak onu online satışa kapatır/açar.
      </p>
    </div>
  );
}

function Chip({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-4 w-4 rounded ${className}`} /> {label}
    </span>
  );
}

function OccupantPanel({
  occupant,
  pending,
  isMoving,
  onClose,
  onMove,
  onUnseat,
}: {
  occupant: SeatOccupant;
  pending: boolean;
  isMoving: boolean;
  onClose: () => void;
  onMove: () => void;
  onUnseat: () => void;
}) {
  const waiting = occupant.bookingStatus === "BEKLIYOR";
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-brand">
            {occupant.seatCode} · {occupant.fullName}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {[
              genderLabel(occupant.gender),
              occupant.ageBand ? bandLabel(occupant.ageBand as AgeBand) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white"
        >
          Kapat
        </button>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        <Row label="Rezervasyon">
          <span className={waiting ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>
            {waiting ? "Bekliyor" : "Ödendi"}
          </span>
          {waiting && occupant.holdExpiresAt && (
            <span className="text-slate-500"> · {formatTime(occupant.holdExpiresAt)}&apos;e kadar</span>
          )}
        </Row>
        <Row label="İletişim">
          {occupant.contactName} · {occupant.contactPhone}
        </Row>
        <Row label="Rezervasyondaki kişi">{occupant.partySize} yolcu</Row>
        <Row label="Diğer koltukları">
          {occupant.partySeats.length ? occupant.partySeats.join(", ") : "—"}
        </Row>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onMove}
          className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {isMoving ? "Hedef koltuğu seçin…" : "Taşı"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onUnseat}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
        >
          Koltuktan çıkar
        </button>
        <Link
          href={`/admin/rezervasyonlar/${occupant.bookingId}`}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white"
        >
          Rezervasyon detayı
        </Link>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="mb-2 text-[11px] text-slate-500">
          İptal, bu rezervasyonun <strong>{occupant.partySize} yolcusunun tümünü</strong> kapsar ve{" "}
          {occupant.partySeats.length + 1} koltuğu birden boşaltır
          {occupant.seatCode && ` (${[occupant.seatCode, ...occupant.partySeats].join(", ")})`}.
          Müşteriye gerekçeli e-posta gönderilir.
        </p>
        {/* İptal akışı tek yerde: rezervasyon detayındaki düğmenin aynısı. */}
        <CancelBookingButton key={occupant.bookingId} bookingId={occupant.bookingId} />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-slate-400">{label}:</dt>
      <dd className="text-slate-700">{children}</dd>
    </div>
  );
}
