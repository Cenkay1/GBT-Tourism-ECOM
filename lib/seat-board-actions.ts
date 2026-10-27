"use server";

// Admin koltuk tahtasının server action'ları. İş mantığı lib/seat-board.ts'te;
// burası yalnız yetki kontrolü, önbellek tazeleme ve FormState dönüşümü yapar.
//
// Neden ayrı dosya: lib/admin-actions.ts 1100 satırı aşmış durumda. Yeni bir
// konu oraya değil, lib/invoice-actions.ts / lib/payment-actions.ts deseniyle
// kendi dosyasına yazılıyor.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionEmail } from "@/lib/auth";
import { unseatPassenger, placePassenger, swapPassengers } from "@/lib/seat-board";
import type { FormState } from "@/lib/form-state";

async function requireAdmin() {
  const email = await getSessionEmail();
  if (!email) redirect("/admin/login");
}

// Koltuk değişen her yerde görünür: tahtanın kendisi, rezervasyon listesi ve
// detayı, müşteriye açık tur sayfaları (boş koltuk sayısı değişti).
function revalidateSeatViews(tourId: string) {
  revalidatePath(`/admin/turlar/${tourId}/koltuklar`);
  revalidatePath("/admin/rezervasyonlar");
  revalidatePath("/turlar", "layout");
  revalidatePath("/hesabim", "layout");
  revalidatePath("/");
}

export async function unseatPassengerAction(
  tourId: string,
  passengerId: string
): Promise<FormState> {
  await requireAdmin();
  const result = await unseatPassenger(passengerId);
  if (!result.ok) return { error: result.error };
  revalidateSeatViews(tourId);
  return { ok: true, message: "Yolcu koltuktan çıkarıldı." };
}

export async function placePassengerAction(
  tourId: string,
  passengerId: string,
  seatCode: string
): Promise<FormState> {
  await requireAdmin();
  const result = await placePassenger(passengerId, seatCode);
  if (!result.ok) return { error: result.error };
  revalidateSeatViews(tourId);
  return { ok: true, message: `Yolcu ${seatCode} koltuğuna yerleştirildi.` };
}

export async function swapPassengersAction(
  tourId: string,
  passengerAId: string,
  passengerBId: string
): Promise<FormState> {
  await requireAdmin();
  const result = await swapPassengers(passengerAId, passengerBId);
  if (!result.ok) return { error: result.error };
  revalidateSeatViews(tourId);
  return { ok: true, message: "Koltuklar takas edildi." };
}
