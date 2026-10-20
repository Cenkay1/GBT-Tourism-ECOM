"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSessionEmail } from "@/lib/auth";
import { issueInvoiceForBooking, STALE_ISLENIYOR_MS } from "@/lib/parasut-invoice";
import type { FormState } from "@/lib/form-state";

// ISLENIYOR'un "bayat" sayılacağı eşik, boru hattıyla ORTAK tek kaynaktan
// (lib/parasut-invoice.ts) geliyor. Burada kopya bir sabit tutulursa ikisi
// ayrışabilir: tarayıcı kaydı bayat sayıp seçerken claim onu taze sayıp
// reddeder (ya da tersi) ve kayıt kalıcı olarak takılı kalır.

// Deneme sınırına takılmış ya da hata almış faturayı görevli elle tetikler.
// Sınır olmadan sonsuz döngü olur; sınır olup elle tetikleme olmazsa takılan
// fatura kalıcı olarak ölü kalır.
//
// DİKKAT — mükerrer fatura kilidi: issueInvoiceForBooking atomik bir claim
// ile aynı kaydın eşzamanlı işlenmesini engelliyor (status → ISLENIYOR). Bu
// fonksiyon "yeniden dene" için attempts/status sıfırlarken o kilidi hiçe
// sayıp KOŞULSUZ sıfırlama YAPMAMALI:
//   - GONDERILDI'yi sıfırlamak: invoiceId/eArchiveId dolu olduğu için
//     fatura ve e-Arşiv adımları atlanır ama PDF+mail adımı TEKRAR çalışır
//     → müşteriye fatura maili ikinci kez gider.
//   - Aktif (taze) ISLENIYOR'u sıfırlamak: sürmekte olan bir çalışmanın
//     claim'ini ezer, paralel bir Paraşüt isteği başlar → GİB'e çift
//     e-Arşiv.
// Bu yüzden önce mevcut kaydı okuyup durumuna göre karar veriyoruz; sıfırlama
// yalnızca güvenli olduğu kanıtlanan durumlarda ve DB seviyesinde yeniden
// doğrulanan bir koşulla yapılır.
export async function retryInvoice(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const email = await getSessionEmail();
  if (!email) return { ok: false, error: "Yetkisiz." };

  const bookingId = String(fd.get("bookingId") ?? "").trim();
  if (!bookingId) return { ok: false, error: "Rezervasyon belirtilmedi." };

  const existing = await prisma.invoice.findUnique({ where: { bookingId } });
  if (!existing) {
    return {
      ok: false,
      error: "Bu rezervasyon için fatura kaydı yok — henüz hiç denenmemiş.",
    };
  }

  if (existing.status === "GONDERILDI") {
    return {
      ok: false,
      error: "Bu rezervasyonun faturası zaten kesilmiş ve gönderilmiş.",
    };
  }

  if (existing.status === "ISLENIYOR") {
    const bayatMi = Date.now() - existing.updatedAt.getTime() >= STALE_ISLENIYOR_MS;
    if (!bayatMi) {
      return {
        ok: false,
        error: "Bu fatura şu anda işleniyor, birkaç dakika sonra tekrar deneyin.",
      };
    }
    // Bayatlamış: büyük olasılıkla çökmüş bir çalışmanın kalıntısı, elle
    // kurtarılabilir — aşağıdaki koşullu sıfırlamaya devam edilir.
  }

  // Koşullu sıfırlama: yukarıda GONDERILDI ve taze ISLENIYOR elendi; buraya
  // ancak BEKLIYOR, KESILDI, BASARISIZ, ELLE ya da bayat ISLENIYOR ile
  // gelinir. `where` koşulu DB seviyesinde yeniden doğrular — findUnique ile
  // bu satır arasındaki aralıkta durum değişmişse (örn. başka bir çalışma
  // faturayı az önce GONDERILDI yaptı ya da ISLENIYOR'u yeniden claim etti)
  // count 0 döner ve biz yanlışlıkla sıfırlamayız.
  const resetWhere =
    existing.status === "ISLENIYOR"
      ? {
          bookingId,
          status: "ISLENIYOR",
          updatedAt: { lt: new Date(Date.now() - STALE_ISLENIYOR_MS) },
        }
      : { bookingId, status: { not: "GONDERILDI" } };

  const reset = await prisma.invoice.updateMany({
    where: resetWhere,
    data: { attempts: 0, status: "BEKLIYOR", errorMessage: null },
  });

  if (reset.count === 0) {
    // Nadir yarış: findUnique'den buraya kadarki aralıkta durum değişti.
    // Boru hattını ÇAĞIRMADAN çıkıyoruz — görevli sayfayı yenileyip güncel
    // durumu görebilir.
    return {
      ok: false,
      error: "Fatura durumu az önce değişti, sayfayı yenileyip tekrar deneyin.",
    };
  }

  const res = await issueInvoiceForBooking(bookingId);
  revalidatePath(`/admin/rezervasyonlar/${bookingId}`);

  if (!res.ok) return { ok: false, error: res.error ?? "Fatura kesilemedi." };
  return { ok: true, message: "Fatura kesildi ve müşteriye gönderildi." };
}
