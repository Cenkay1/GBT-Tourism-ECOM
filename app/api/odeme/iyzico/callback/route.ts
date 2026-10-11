// iyzico Checkout Form geri dönüş ucu.
//
// Müşteri iyzico'nun ödeme sayfasında işlemi bitirince iyzico tarayıcıyı
// buraya POST eder ve gövdede yalnızca bir `token` taşır.
//
// Bu uç herkese açıktır — gelen gövdeye GÜVENİLMEZ. Doğrulamanın tamamı
// verifyIyzicoCallback() içinde: iyzico'ya sunucu-sunucu sorgu, imza kontrolü,
// basketId eşlemesi ve tutar karşılaştırması. Bu dosya yalnızca token'ı çıkarıp
// sonucu müşteriye uygun sayfaya yönlendirir.

import { NextResponse } from "next/server";
import { verifyIyzicoCallback } from "@/lib/payment";
import { markBookingPaid } from "@/lib/booking";

// POST → GET dönüşümü için 303 gerekir. 307 kullanılsa tarayıcı hedef sayfaya
// da POST atar ve başarı sayfası 405 verir.
const SEE_OTHER = 303;

function seeOther(req: Request, path: string): Response {
  return NextResponse.redirect(new URL(path, req.url), SEE_OTHER);
}

export async function POST(req: Request): Promise<Response> {
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") ?? "").trim();
  } catch {
    // iyzico form-encoded gönderir; yine de JSON gövdeye karşı toleranslı ol.
    try {
      const body = (await req.json()) as { token?: unknown };
      token = String(body.token ?? "").trim();
    } catch {
      token = "";
    }
  }

  if (!token) {
    return seeOther(req, "/turlar?hata=Odeme+bilgisi+alinamadi");
  }

  const result = await verifyIyzicoCallback(token);

  if (!result.ok) {
    // Rezervasyonu biliyorsak ödeme sayfasına hatayla dön (koltuk hold'u hâlâ
    // geçerliyse müşteri tekrar deneyebilir), bilmiyorsak tur listesine.
    const target = result.bookingId
      ? `/odeme/${result.bookingId}?hata=${encodeURIComponent(result.error)}`
      : `/turlar?hata=${encodeURIComponent(result.error)}`;
    return seeOther(req, target);
  }

  // Ödeme doğrulandı. markBookingPaid koltukları SATILDI'ya çeker, onay
  // SMS/e-postasını ve sadakat puanını tetikler; ODENDI olan bir rezervasyonda
  // sessizce başarı döner, yani iyzico callback'i tekrar gönderirse zararsız.
  const paid = await markBookingPaid(result.bookingId, result.paymentId);
  if (!paid.ok) {
    console.error("[iyzico: ödeme alındı ama rezervasyon işlenemedi]", {
      bookingId: result.bookingId,
      paymentId: result.paymentId,
      error: paid.error,
    });
    // Para tahsil edildi ama rezervasyon kapatılamadı (ör. hold süresi doldu).
    // Müşteriye durumu bildir — acente iyzico panelinden iade edebilir.
    return seeOther(
      req,
      `/odeme/${result.bookingId}?hata=${encodeURIComponent(
        `${paid.error ?? "Rezervasyon tamamlanamadı."} Ödemeniz alındı, lütfen bizimle iletişime geçin.`
      )}`
    );
  }

  return seeOther(req, `/rezervasyon/basarili?no=${result.bookingId}`);
}

// iyzico bazı yapılandırmalarda GET ile de dönebilir.
export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!token) return seeOther(req, "/turlar");
  const result = await verifyIyzicoCallback(token);
  if (!result.ok) {
    const target = result.bookingId
      ? `/odeme/${result.bookingId}?hata=${encodeURIComponent(result.error)}`
      : `/turlar?hata=${encodeURIComponent(result.error)}`;
    return seeOther(req, target);
  }
  const paid = await markBookingPaid(result.bookingId, result.paymentId);
  if (!paid.ok) {
    return seeOther(
      req,
      `/odeme/${result.bookingId}?hata=${encodeURIComponent(
        paid.error ?? "Rezervasyon tamamlanamadı."
      )}`
    );
  }
  return seeOther(req, `/rezervasyon/basarili?no=${result.bookingId}`);
}
