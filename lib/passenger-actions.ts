"use server";

// Kayıtlı yolcular için server action'lar (Hesabım → Kişilerim).
//
// Her action oturumdaki kullanıcıyı SUNUCUDAN okur; userId istemciden
// alınmaz. Böylece form verisiyle başka bir müşterinin kaydına erişilemez.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import {
  saveSavedPassenger,
  updateSavedPassenger,
  deleteSavedPassenger,
  type SavedPassengerInput,
} from "@/lib/saved-passengers";
import type { FormState } from "@/lib/form-state";

function s(fd: FormData, k: string): string {
  return (fd.get(k) as string | null)?.trim() ?? "";
}

function inputFrom(fd: FormData): SavedPassengerInput {
  const nat = s(fd, "nationality") === "FOREIGN" ? "FOREIGN" : "TC";
  const g = s(fd, "gender");
  return {
    firstName: s(fd, "firstName"),
    lastName: s(fd, "lastName"),
    idNumber: s(fd, "idNumber") || undefined,
    birthDate: s(fd, "birthDate") || undefined,
    gender: g === "E" || g === "K" ? g : undefined,
    nationality: nat,
    country: s(fd, "country") || undefined,
    label: s(fd, "label") || undefined,
    isSelf: fd.get("isSelf") === "on",
  };
}

function refresh() {
  revalidatePath("/hesabim/kisilerim");
  revalidatePath("/hesabim");
}

export async function saveMyPassenger(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };

  const id = s(fd, "id");
  const input = inputFrom(fd);

  const res = id
    ? await updateSavedPassenger(user.id, id, input)
    : await saveSavedPassenger(user.id, input);

  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return {
    ok: true,
    message: id
      ? "Kişi güncellendi."
      : res.created
        ? "Kişi kaydedildi. Sonraki rezervasyonlarınızda listeden seçebilirsiniz."
        : "Bu kişi zaten kayıtlıydı; bilgileri güncellendi.",
  };
}

export async function deleteMyPassenger(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  const res = await deleteSavedPassenger(user.id, id);
  if (!res.ok) throw new Error(res.error ?? "Kayıt silinemedi.");
  refresh();
}
