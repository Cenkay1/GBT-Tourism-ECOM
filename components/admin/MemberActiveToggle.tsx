"use client";

// Üyeyi pasife al / tekrar aktif et. Pasif üye giriş yapamaz ve açık oturumu
// da düşer, ama rezervasyon geçmişi ve puanı korunur (kalıcı silme ayrı iştir).
import { setMemberActiveAction } from "@/lib/admin-actions";

export default function MemberActiveToggle({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const action = setMemberActiveAction.bind(null, id, !active);
  return (
    <form action={action} className="inline">
      <button
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
          active
            ? "text-amber-700 hover:bg-amber-50"
            : "text-emerald-700 hover:bg-emerald-50"
        }`}
      >
        {active ? "Pasife Al" : "Aktif Et"}
      </button>
    </form>
  );
}
