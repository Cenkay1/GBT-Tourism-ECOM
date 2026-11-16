"use server";

// Müşterinin yedek listeye yazılma formu.
//
// Otobüs/kontenjan dolduğunda talep kaybedilmesin diye var. Para ALINMAZ,
// koltuk ayrılmaz — kayıt acenteye düşer, yerleştirme kararı acentenindir
// (bkz. lib/waitlist.ts).
//
// Talep hem veritabanına yazılır hem acenteye e-posta gider: e-posta sunucusu
// patlasa bile talep panelde durur ve kaybolmaz (otel talebiyle aynı yaklaşım,
// bkz. lib/inquiry-actions.ts).

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/consent";
import { isValidPhone, normalizePhone } from "@/lib/shared";
import { createWaitlistEntry } from "@/lib/waitlist";
import { WAITLIST_MAX_QUANTITY } from "@/lib/waitlist-limits";
import { getCurrentUser } from "@/lib/session";
import type { FormState } from "@/lib/form-state";

const NOTE_MAX = 500;

export async function submitWaitlist(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const tourId = String(fd.get("tourId") ?? "").trim();
  const departureId = String(fd.get("departureId") ?? "").trim() || null;
  const contactName = String(fd.get("contactName") ?? "").trim();
  const contactPhone = String(fd.get("contactPhone") ?? "").trim();
  const contactEmail = String(fd.get("contactEmail") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim().slice(0, NOTE_MAX);
  const quantity = Number(String(fd.get("quantity") ?? "1"));

  const fieldErrors: Record<string, string> = {};
  if (contactName.length < 2) fieldErrors.contactName = "Adınızı girin.";
  if (!isValidPhone(contactPhone))
    fieldErrors.contactPhone = "Geçerli bir cep telefonu girin: 0(5xx) xxx xx xx";
  if (!contactEmail.includes("@"))
    fieldErrors.contactEmail = "Geçerli bir e-posta adresi girin.";
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > WAITLIST_MAX_QUANTITY)
    fieldErrors.quantity = `1 ile ${WAITLIST_MAX_QUANTITY} arası olmalı.`;
  if (Object.keys(fieldErrors).length > 0)
    return { ok: false, error: "Lütfen işaretli alanları kontrol edin.", fieldErrors };

  // Form herkese açık: aynı IP'den kısa sürede gelen yığın talebi engelle.
  const ip = clientIpFrom(await headers()) ?? "bilinmiyor";
  if (!rateLimit(`yedek-liste:${ip}`, 5, 60 * 60 * 1000)) {
    return {
      ok: false,
      error:
        "Çok fazla talep gönderildi. Lütfen bir süre sonra tekrar deneyin ya da bizi telefonla arayın.",
    };
  }

  // Giriş yapmışsa kaydı hesabına bağla (zorunlu değil — misafir de yazılabilir).
  const user = await getCurrentUser().catch(() => null);

  const res = await createWaitlistEntry({
    tourId,
    departureId,
    contactName,
    contactPhone: normalizePhone(contactPhone),
    contactEmail,
    quantity,
    note,
    userId: user?.id ?? null,
  });
  if (!res.ok) return { ok: false, error: res.error };

  // Bildirimler best-effort: gitmezse kayıt yine durur, panelde görünür.
  try {
    const { sendWaitlistReceived, sendWaitlistAdminNotice } = await import(
      "@/lib/notifications"
    );
    await sendWaitlistReceived(res.id);
    await sendWaitlistAdminNotice(res.id);
  } catch (e) {
    console.error("[yedek liste bildirimi gönderilemedi]", { id: res.id, error: e });
  }

  revalidatePath("/admin/yedek-liste");

  return {
    ok: true,
    message:
      "Yedek listeye alındınız. Şu an ödeme alınmadı — yer açıldığında ya da ek araç ayarlandığında sizi arayacağız.",
  };
}
