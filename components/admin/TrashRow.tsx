"use client";

// Çöp kutusu satırı — geri yükle veya kalıcı sil.
//
// Kalıcı silme geri alınamaz, o yüzden ayrı bir onay adımı var; geri yükleme
// zararsız olduğu için tek tuş.
import { useActionState, useState } from "react";
import { restoreTrashAction, purgeTrashAction } from "@/lib/admin-actions";
import type { FormState } from "@/lib/form-state";

export interface TrashRowData {
  model: string;
  modelLabel: string;
  id: string;
  label: string;
  detail: string;
  deletedAt: string;
  daysLeft: number;
}

export default function TrashRow({ item }: { item: TrashRowData }) {
  const [restoreState, restoreAction, restoring] = useActionState<FormState, FormData>(
    restoreTrashAction,
    {}
  );
  const [purgeState, purgeAction, purging] = useActionState<FormState, FormData>(
    purgeTrashAction,
    {}
  );
  const [confirmPurge, setConfirmPurge] = useState(false);
  const state = restoreState.error ? restoreState : purgeState;

  // Son 3 gün: kayıt kendiliğinden silinmek üzere.
  const urgent = item.daysLeft <= 3;

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {item.modelLabel}
            </span>
            <p className="truncate font-medium text-slate-800">{item.label}</p>
          </div>
          {item.detail && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{item.detail}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {item.deletedAt} tarihinde silindi ·{" "}
            <span className={urgent ? "font-semibold text-red-600" : "text-slate-500"}>
              {item.daysLeft === 0
                ? "bugün kalıcı silinecek"
                : `${item.daysLeft} gün sonra kalıcı silinecek`}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <form action={restoreAction} className="inline">
            <input type="hidden" name="model" value={item.model} />
            <input type="hidden" name="id" value={item.id} />
            <button
              disabled={restoring}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white transition enabled:hover:bg-brand/90 disabled:opacity-50"
            >
              {restoring ? "Yükleniyor…" : "Geri Yükle"}
            </button>
          </form>

          {!confirmPurge ? (
            <button
              onClick={() => setConfirmPurge(true)}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
            >
              Kalıcı Sil
            </button>
          ) : (
            <form action={purgeAction} className="flex items-center gap-1">
              <input type="hidden" name="model" value={item.model} />
              <input type="hidden" name="id" value={item.id} />
              <span className="text-xs text-red-700">Emin misiniz?</span>
              <button
                disabled={purging}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition enabled:hover:bg-red-700 disabled:opacity-50"
              >
                {purging ? "Siliniyor…" : "Evet, sil"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmPurge(false)}
                className="px-2 py-1.5 text-xs text-slate-500"
              >
                Vazgeç
              </button>
            </form>
          )}
        </div>
      </div>

      {state.error && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-600">
          {state.error}
        </p>
      )}
    </div>
  );
}
