"use client";

import { useActionState } from "react";
import { changeBookingSeatAction } from "@/lib/admin-actions";
import type { FormState } from "@/lib/form-state";

export default function ChangeSeatForm({ bookingId, passengers, seats }: {
  bookingId: string;
  passengers: { id: string; name: string; seatCode: string }[];
  seats: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeBookingSeatAction, {});
  return (
    <form action={action} className="mt-5 space-y-3 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold text-brand">Koltuk Değişimi</h3>
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-600">Yolcu
          <select name="passengerId" required disabled={pending} className="mt-1 w-full rounded border border-slate-200 p-2">
            {passengers.map((passenger) => <option key={passenger.id} value={passenger.id}>{passenger.name} ({passenger.seatCode})</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-600">Yeni koltuk
          <select name="seatCode" required disabled={pending} defaultValue="" className="mt-1 w-full rounded border border-slate-200 p-2">
            <option value="" disabled>{seats.length ? "Koltuk seçin" : "Boş koltuk yok"}</option>
            {seats.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
      <button disabled={pending || !seats.length} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Değiştiriliyor..." : "Koltuğu Değiştir"}
      </button>
    </form>
  );
}