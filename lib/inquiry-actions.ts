"use server";

// "Tatil & Otel" bize ulaşın formu.
//
// Müşteriden yalnız ad, soyad ve telefon alınır; teklif süreci telefonla
// yürütülür. Talep hem veritabanına yazılır hem acenteye e-posta gider:
// e-posta sunucusu patlasa bile talep panelde durur ve kaybolmaz.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/consent";
import { isValidPhone, normalizePhone } from "@/lib/shared";
import type { FormState } from "@/lib/form-state";

const NOTE_MAX = 500;

export async function submitHotelInquiry(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const firstName = String(fd.get("firstName") ?? "").trim();
  const lastName = String(fd.get("lastName") ?? "").trim();
  const phone = String(fd.get("phone") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim().slice(0, NOTE_MAX);

  const fieldErrors: Record<string, string> = {};
  if (firstName.length < 2) fieldErrors.firstName = "Adınızı girin.";
  if (lastName.length < 2) fieldErrors.lastName = "Soyadınızı girin.";
  if (!isValidPhone(phone))
    fieldErrors.phone = "Geçerli bir cep telefonu girin: 0(5xx) xxx xx xx";
  if (Object.keys(fieldErrors).length > 0)
    return { ok: false, error: "Lütfen işaretli alanları kontrol edin.", fieldErrors };

  // Form herkese açık: aynı IP'den kısa sürede gelen yığın talebi engelle.
  const ip = clientIpFrom(await headers()) ?? "bilinmiyor";
  if (!rateLimit(`otel-talep:${ip}`, 5, 60 * 60 * 1000)) {
    return {
      ok: false,
      error:
        "Çok fazla talep gönderildi. Lütfen bir süre sonra tekrar deneyin ya da bizi telefonla arayın.",
    };
  }

  let inquiryId: string;
  try {
    const created = await prisma.hotelInquiry.create({
      data: { firstName, lastName, phone: normalizePhone(phone), note },
      select: { id: true },
    });
    inquiryId = created.id;
  } catch (e) {
    console.error("[tatil & otel talebi kaydedilemedi]", e);
    return {
      ok: false,
      error: "Talebiniz kaydedilemedi. Lütfen bizi telefonla aramayı deneyin.",
    };
  }

  // Bildirim best-effort: gitmezse talep yine kayıtlı, panelde görünür.
  try {
    const { sendHotelInquiryNotice } = await import("@/lib/notifications");
    const sent = await sendHotelInquiryNotice(inquiryId);
    if (sent) {
      await prisma.hotelInquiry.update({
        where: { id: inquiryId },
        data: { emailSent: true },
      });
    }
  } catch (e) {
    console.error("[tatil & otel bildirimi gönderilemedi]", { inquiryId, error: e });
  }

  revalidatePath("/admin/talepler");

  return {
    ok: true,
    message:
      "Talebiniz alındı. Ekibimiz en kısa sürede sizi arayarak size uygun tatil ve otel seçeneklerini paylaşacak.",
  };
}
