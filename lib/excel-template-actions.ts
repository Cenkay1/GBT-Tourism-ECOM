"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSessionEmail } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { encodeColumnKeys, resolveColumns } from "@/lib/excel-columns";

async function requireAdmin() {
  const email = await getSessionEmail();
  if (!email) redirect("/admin/login");
}

// Sütun seçimini adlandırıp kaydeder. Aynı ada sahip şablon varsa ÜZERİNE
// yazar — görevli "otel listesi"ni güncellemek istediğinde ikinci bir kayıt
// değil, aynısının yenisini bekler.
export async function saveExcelTemplate(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  await requireAdmin();

  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Şablona bir ad verin." };
  if (name.length > 40) return { ok: false, error: "Şablon adı en fazla 40 karakter olabilir." };

  const keys = String(fd.get("columns") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (resolveColumns(keys).length === 0) {
    return { ok: false, error: "En az bir sütun seçin." };
  }

  await prisma.excelTemplate.upsert({
    where: { name },
    update: { columns: encodeColumnKeys(keys) },
    create: { name, columns: encodeColumnKeys(keys) },
  });

  revalidatePath("/admin/turlar", "layout");
  return { ok: true, message: `"${name}" şablonu kaydedildi.` };
}

export async function deleteExcelTemplate(id: string) {
  await requireAdmin();
  await prisma.excelTemplate.delete({ where: { id } });
  revalidatePath("/admin/turlar", "layout");
}
