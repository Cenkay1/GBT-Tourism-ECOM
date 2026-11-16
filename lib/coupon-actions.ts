"use server";

// Müşteri tarafı kupon işlemleri: puanı kupona çevirme ve ödemede kod
// doğrulama.
import { revalidatePath } from "next/cache";
import { requireUser, getCurrentUser } from "@/lib/session";
import {
  redeemPointsForCoupon,
  validateCoupon,
  pointsToLira,
  MIN_REDEEM_POINTS,
} from "@/lib/coupons";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form-state";

// Puanlarım sayfasındaki "Puanı kupona çevir" formu.
export async function redeemPointsAction(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const user = await requireUser("/hesabim/puanlarim");
  const points = Number(String(fd.get("points") ?? "0"));

  if (!Number.isInteger(points) || points < MIN_REDEEM_POINTS)
    return {
      ok: false,
      error: `En az ${MIN_REDEEM_POINTS} puan çevirebilirsiniz (${MIN_REDEEM_POINTS} puan = 1 ₺).`,
    };

  const res = await redeemPointsForCoupon(user.id, points);
  if (!res.ok) return { ok: false, error: res.error };

  const coupon = await prisma.coupon.findUnique({
    where: { id: res.couponId },
    select: { code: true, amount: true },
  });

  revalidatePath("/hesabim/puanlarim");
  revalidatePath("/hesabim");

  return {
    ok: true,
    message: `${points.toLocaleString("tr-TR")} puan ${pointsToLira(
      points
    )} ₺ kupona çevrildi. Kupon kodunuz: ${coupon?.code ?? ""} — ödeme adımında girebilirsiniz.`,
  };
}

// Ödeme formundaki "Kuponu uygula" kontrolü. Tutarı DÜŞÜRMEZ; yalnız kodun
// geçerliliğini ve indirim tutarını döndürür — gerçek düşme rezervasyon
// açılırken sunucuda yapılır (lib/booking.ts).
export async function checkCouponAction(
  code: string
): Promise<{ ok: boolean; amount?: number; error?: string }> {
  const user = await getCurrentUser().catch(() => null);
  const res = await validateCoupon(code, user?.id ?? null);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, amount: res.amount };
}
