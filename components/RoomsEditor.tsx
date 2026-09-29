"use client";

import {
  RoomPlan,
  AgeBand,
  ROOM_MAX_GUESTS,
  bandLabel,
  roomsTotal,
  assignRooms,
  roomIndexes,
  validateRooms,
} from "@/lib/shared";

// Toplam kişiyi ROOM_MAX_GUESTS'lik odalara böler.
export function packRooms(count: number): RoomPlan {
  const rooms: RoomPlan = [];
  let left = Math.max(1, count);
  while (left > 0) {
    const n = Math.min(ROOM_MAX_GUESTS, left);
    rooms.push(n);
    left -= n;
  }
  return rooms;
}

// Konaklamalı turlarda oda planı: her odaya KAÇ KİŞİ yerleşeceğini seçersiniz.
// Yaş grubu burada girilmez — her yolcunun yaşı, yolcu formundaki DOĞUM
// TARİHİNDEN otomatik hesaplanır. `bands` verilirse (yolcuların doğum
// tarihlerinden hesaplanmış yaş grupları) her odada kimin kaldığı gösterilir.
export default function RoomsEditor({
  value,
  onChange,
  totalGuests,
  bands,
  passengerNames,
  className = "",
}: {
  value: RoomPlan;
  onChange: (rooms: RoomPlan) => void;
  totalGuests: number;
  bands?: AgeBand[];
  passengerNames?: string[];
  className?: string;
}) {
  const rooms = value;
  const placed = roomsTotal(rooms);
  const remaining = totalGuests - placed;
  const error = validateRooms(rooms, bands);
  // Yolcular odalara her odaya bir yetişkin düşecek şekilde dağıtılır.
  const idx = bands ? assignRooms(rooms, bands) : roomIndexes(rooms);

  function move(i: number, delta: number) {
    const next = [...rooms];
    const target = next[i] + delta;
    if (target < 1 || target > ROOM_MAX_GUESTS) return;
    // Kişi sayısı sabittir: bir odaya eklenen kişi başka odadan alınır.
    if (delta > 0 && remaining <= 0) {
      const donor = next.findIndex((n, j) => j !== i && n > 1);
      if (donor === -1) return;
      next[donor] -= 1;
    }
    next[i] = target;
    onChange(next.filter((n) => n > 0));
  }

  function addRoom() {
    // Yeni oda, en kalabalık odadan bir kişi devralır (toplam değişmez).
    if (remaining > 0) {
      onChange([...rooms, Math.min(ROOM_MAX_GUESTS, remaining)]);
      return;
    }
    const donor = rooms.reduce((best, n, j) => (n > rooms[best] ? j : best), 0);
    if (rooms[donor] <= 1) return;
    const next = [...rooms];
    next[donor] -= 1;
    onChange([...next, 1]);
  }

  function removeRoom(i: number) {
    if (rooms.length <= 1) return;
    // Odadaki kişiler bir sonraki (yoksa önceki) odaya taşınır.
    const next = rooms.filter((_, j) => j !== i);
    let left = rooms[i];
    for (let j = 0; j < next.length && left > 0; j++) {
      const room = Math.min(ROOM_MAX_GUESTS, next[j] + left);
      left -= room - next[j];
      next[j] = room;
    }
    // Sığmayan kişi kalırsa yeni oda açılır.
    while (left > 0) {
      const n = Math.min(ROOM_MAX_GUESTS, left);
      next.push(n);
      left -= n;
    }
    onChange(next);
  }

  function guestLabel(passengerIndex: number): string {
    const name = passengerNames?.[passengerIndex]?.trim();
    const band = bands?.[passengerIndex];
    const who = name || `${passengerIndex + 1}. Yolcu`;
    return band && band !== "ADULT" ? `${who} (${bandLabel(band)})` : who;
  }

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-brand">Oda Dağılımı</h3>
        <span className="text-xs text-slate-400">
          {placed} / {totalGuests} kişi yerleştirildi
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">
        {totalGuests} kişiyi odalara dağıtın — bir odada en fazla {ROOM_MAX_GUESTS} kişi
        konaklayabilir. Yaş grubu girmeniz gerekmez; her yolcunun yaşı doğum tarihinden
        hesaplanır. Tek kişi kalan odaya tek kişi farkı eklenir.
      </p>

      <div className="mt-4 space-y-3">
        {rooms.map((count, i) => {
          const guests = idx
            .map((room, p) => (room === i ? p : -1))
            .filter((p) => p >= 0);
          return (
            <div key={i} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-md bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">
                  {i + 1}. Oda
                </span>
                <span className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={count <= 1}
                    aria-label="Kişi azalt"
                    className="h-8 w-8 rounded-lg border border-slate-200 text-lg font-bold leading-none text-brand transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-16 text-center text-sm font-bold text-slate-800">
                    {count} kişi
                  </span>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={count >= ROOM_MAX_GUESTS}
                    aria-label="Kişi artır"
                    title={
                      count >= ROOM_MAX_GUESTS
                        ? `Bu odada en fazla ${ROOM_MAX_GUESTS} kişi olabilir. Yeni oda ekleyin.`
                        : undefined
                    }
                    className="h-8 w-8 rounded-lg border border-slate-200 text-lg font-bold leading-none text-brand transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    +
                  </button>
                  {rooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRoom(i)}
                      className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Kaldır
                    </button>
                  )}
                </span>
              </div>

              {guests.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  {guests.map((p) => guestLabel(p)).join(" · ")}
                </p>
              )}
              {count >= ROOM_MAX_GUESTS && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Bu oda doldu. Daha fazla kişi için yeni oda ekleyin.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRoom}
        className="mt-3 w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-brand transition hover:bg-slate-50"
      >
        + Oda Ekle
      </button>

      {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
      {!error && remaining !== 0 && (
        <p className="mt-3 text-xs font-medium text-amber-700">
          {remaining > 0
            ? `${remaining} kişiyi daha odalara yerleştirin.`
            : `${-remaining} kişi fazla. Odalardan çıkarın.`}
        </p>
      )}
    </div>
  );
}
