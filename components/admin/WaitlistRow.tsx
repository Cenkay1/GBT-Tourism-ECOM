"use client";

// Yedek liste satırı — görevlinin üç işlemi: rezervasyona çevir, başka sefere
// taşı, iptal et.
//
// "Rezervasyona çevir" iki adımlıdır ve bu KASITLI: önce elden satış formu
// müşterinin bilgileriyle önden dolu açılır (koltuk, yaş, oda ve tahsilat
// kararları orada veriliyor — yedek kayıt bunların hiçbirini taşımıyor), satış
// bittikten sonra oluşan rezervasyonun numarası buraya girilerek kayıt bağlanır.
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  convertWaitlistAction,
  moveWaitlistAction,
  cancelWaitlistAction,
} from "@/lib/admin-actions";
import type { FormState } from "@/lib/form-state";

export interface WaitlistRowData {
  id: string;
  contactName: string;
  contactPhone: string;
  rawPhone: string;
  contactEmail: string;
  quantity: number;
  note: string;
  status: string;
  bookingId: string | null;
  handledNote: string;
  createdAt: string;
}

const statusStyle: Record<string, { label: string; cls: string }> = {
  BEKLIYOR: { label: "Bekliyor", cls: "bg-amber-50 text-amber-700" },
  DONUSTURULDU: { label: "Rezervasyona Çevrildi", cls: "bg-emerald-50 text-emerald-700" },
  IPTAL: { label: "İptal", cls: "bg-slate-100 text-slate-500" },
};

export default function WaitlistRow({
  row,
  tourId,
  otherDepartures,
}: {
  row: WaitlistRowData;
  // Elden satış sayfası turu ID ile açıyor (getTourById), slug ile değil.
  tourId: string;
  otherDepartures: { id: string; label: string }[];
}) {
  const [panel, setPanel] = useState<"none" | "convert" | "move" | "cancel">("none");
  const [convertState, convertAction, converting] = useActionState<FormState, FormData>(
    convertWaitlistAction,
    {}
  );
  const [moveState, moveAction, moving] = useActionState<FormState, FormData>(
    moveWaitlistAction,
    {}
  );
  const [cancelState, cancelAction, cancelling] = useActionState<FormState, FormData>(
    cancelWaitlistAction,
    {}
  );

  const st = statusStyle[row.status] ?? statusStyle.IPTAL;
  const waiting = row.status === "BEKLIYOR";
  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";
  const state = convertState.error
    ? convertState
    : moveState.error
    ? moveState
    : cancelState;

  // Elden satış formu müşterinin bilgileriyle önden dolu açılır.
  const saleUrl =
    `/admin/rezervasyonlar/yeni?tur=${encodeURIComponent(tourId)}` +
    `&ad=${encodeURIComponent(row.contactName)}` +
    `&telefon=${encodeURIComponent(row.rawPhone)}` +
    `&eposta=${encodeURIComponent(row.contactEmail)}` +
    `&adet=${row.quantity}&yedek=${row.id}`;

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-800">
            {row.contactName}
            <span className="ml-2 text-xs font-semibold text-slate-500">
              {row.quantity} kişi
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            <a href={`tel:${row.rawPhone}`} className="hover:text-brand">
              {row.contactPhone}
            </a>
            {" · "}
            <a href={`mailto:${row.contactEmail}`} className="hover:text-brand">
              {row.contactEmail}
            </a>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">Kayıt: {row.createdAt}</p>
          {row.note && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {row.note}
            </p>
          )}
          {row.handledNote && (
            <p className="mt-2 text-xs text-slate-500">
              <strong>Görevli notu:</strong> {row.handledNote}
            </p>
          )}
          {row.bookingId && (
            <Link
              href={`/admin/rezervasyonlar/${row.bookingId}`}
              className="mt-2 inline-block text-xs font-semibold text-brand hover:text-accent"
            >
              Rezervasyonu aç →
            </Link>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.cls}`}>
            {st.label}
          </span>
          {waiting && panel === "none" && (
            <div className="flex flex-wrap justify-end gap-1">
              <Link
                href={saleUrl}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-accent-dark"
              >
                Satış Aç
              </Link>
              <button
                onClick={() => setPanel("convert")}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-100"
              >
                Rezervasyona Bağla
              </button>
              {otherDepartures.length > 0 && (
                <button
                  onClick={() => setPanel("move")}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Sefere Taşı
                </button>
              )}
              <button
                onClick={() => setPanel("cancel")}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                İptal
              </button>
            </div>
          )}
        </div>
      </div>

      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.message}
        </p>
      )}

      {panel === "convert" && (
        <form action={convertAction} className="mt-3 rounded-xl bg-slate-50 p-3">
          <input type="hidden" name="id" value={row.id} />
          <p className="text-xs text-slate-600">
            Önce <strong>Satış Aç</strong> ile rezervasyonu oluşturun, sonra oluşan
            rezervasyonun kimliğini buraya yapıştırın — kayıt o rezervasyona bağlanır.
          </p>
          <label className="block text-xs font-medium text-slate-600">
            Rezervasyon kimliği
            <input name="bookingId" required className={input} placeholder="cuid…" />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              disabled={converting}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {converting ? "Bağlanıyor…" : "Bağla"}
            </button>
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="px-3 py-1.5 text-xs text-slate-500"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}

      {panel === "move" && (
        <form action={moveAction} className="mt-3 rounded-xl bg-slate-50 p-3">
          <input type="hidden" name="id" value={row.id} />
          <label className="block text-xs font-medium text-slate-600">
            Hedef sefer
            <select name="departureId" required className={input}>
              {otherDepartures.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-xs text-slate-400">
            2. araç yeni bir sefer olarak açıldıysa bekleyenleri oraya taşıyın.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              disabled={moving}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {moving ? "Taşınıyor…" : "Taşı"}
            </button>
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="px-3 py-1.5 text-xs text-slate-500"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}

      {panel === "cancel" && (
        <form action={cancelAction} className="mt-3 rounded-xl bg-red-50/50 p-3">
          <input type="hidden" name="id" value={row.id} />
          <label className="block text-xs font-medium text-slate-600">
            İptal notu (yalnız panelde görünür)
            <input name="note" className={input} placeholder="Örn. müşteri vazgeçti" />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              disabled={cancelling}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {cancelling ? "İptal ediliyor…" : "İptal Et"}
            </button>
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="px-3 py-1.5 text-xs text-slate-500"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
