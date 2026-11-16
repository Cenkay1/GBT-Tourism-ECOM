"use client";

import { cancelCouponAction } from "@/lib/admin-actions";

export default function CouponCancelButton({ id }: { id: string }) {
  const action = cancelCouponAction.bind(null, id);
  return (
    <form
      action={action}
      className="inline"
      onSubmit={(e) => {
        if (!confirm("Kupon iptal edilsin mi? Müşteri bu kuponu kullanamayacak.")) {
          e.preventDefault();
        }
      }}
    >
      <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50">
        İptal Et
      </button>
    </form>
  );
}
