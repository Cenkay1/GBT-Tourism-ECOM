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
import { prisma } from "@/lib/db";

// POST → GET dönüşümü için 303 gerekir. 307 kullanılsa tarayıcı hedef sayfaya
// da POST atar ve başarı sayfası 405 verir.
const SEE_OTHER = 303;

// Yönlendirme adresi İSTEK BAŞLIKLARINDAN kurulur, req.url'den DEĞİL.
//
// Next.js'te route handler'ın req.url'i vekil sunucunun ilettiği Host başlığını
// yansıtmaz; sunucunun kendi bağlanma adresini (localhost:3000) verir. Bununla
// kurulan mutlak adres canlıda "https://localhost:3000/..." çıkar ve müşteri
// ödeme sonrası kendi makinesine yönlendirilerek hiçbir sayfaya ulaşamaz —
// ödeme alınmış olsa bile. Host başlığını nginx doğru geçiriyor, o yüzden
// kaynak olarak onu alıyoruz; yoksa req.url'e düşüyoruz.
function seeOther(req: Request, path: string): Response {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host");
  const base = host ? `${proto}://${host}` : req.url;
  return NextResponse.redirect(new URL(path, base), SEE_OTHER);
}

// Elden satışta görevli kartı iyzico sayfasında girdiyse (paymentMethod KREDI_KARTI,
// yalnız admin akışı yazar) sonuç müşteri sayfasına değil, yönetim paneline döner.
async function isAdminCardBooking(bookingId: string): Promise<boolean> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { paymentMethod: true },
  });
  return b?.paymentMethod === "KREDI_KARTI";
}

// POST ve GET aynı doğrulama/yönlendirme akışını paylaşır.
async function handleToken(req: Request, token: string): Promise<Response> {
  if (!token) {
    return seeOther(req, "/turlar?hata=Odeme+bilgisi+alinamadi");
  }

  let bookingId: string | undefined;
  let adminCard = false;
  try {
    const payment = await prisma.payment.findUnique({
      where: { token },
      select: { bookingId: true },
    });
    bookingId = payment?.bookingId;

    const result = await verifyIyzicoCallback(token);
    bookingId = result.bookingId ?? bookingId;

    adminCard = bookingId ? await isAdminCardBooking(bookingId) : false;

    if (!result.ok) {
      if (adminCard) {
        return seeOther(
          req,
          `/admin/rezervasyonlar/yeni?hata=${encodeURIComponent(
            `Kart ödemesi tamamlanamadı: ${result.error} Rezervasyon süre dolunca koltuklar otomatik serbest kalır; yeniden deneyebilirsiniz.`
          )}`
        );
      }
      // Rezervasyon biliniyorsa ödeme sayfasına, değilse belirsiz sonucu göster.
      if (bookingId) {
        return seeOther(req, `/odeme/${bookingId}?hata=${encodeURIComponent(result.error)}`);
      }
      return new Response("Ödeme sonucu doğrulanamadı. Lütfen acentemizle iletişime geçin.", {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
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
      if (adminCard) {
        return seeOther(
          req,
          `/admin/rezervasyonlar/yeni?hata=${encodeURIComponent(
            `Kart çekildi ama rezervasyon tamamlanamadı (${paid.error ?? "bilinmeyen hata"}). iyzico panelinden iade edin. No: ${result.bookingId.slice(-8).toUpperCase()}`
          )}`
        );
      }
      return seeOther(
        req,
        `/odeme/${result.bookingId}?hata=${encodeURIComponent(
          `${paid.error ?? "Rezervasyon tamamlanamadı."} Ödemeniz alındı, lütfen bizimle iletişime geçin.`
        )}`
      );
    }

    if (adminCard) {
      return seeOther(req, `/admin/rezervasyonlar/${result.bookingId}?odeme=ok`);
    }
    return seeOther(
      req,
      `/rezervasyon/basarili?no=${result.bookingId}`
    );
  } catch (error) {
    console.error("[iyzico callback işleme hatası]", { bookingId, error });
    if (adminCard) {
      return seeOther(
        req,
        `/admin/rezervasyonlar/yeni?hata=${encodeURIComponent(
          "Ödeme sonucu işlenemedi. Ödeme alındıysa lütfen iyzico panelinden kontrol edin."
        )}`
      );
    }
    const message = bookingId
      ? "Ödeme durumunuz doğrulanamadı. Yeniden ödeme yapmadan önce lütfen acentemizle iletişime geçin."
      : "Ödeme sonucu alınamadı. Lütfen acentemizle iletişime geçin.";
    const target = bookingId
      ? `/odeme/${bookingId}?hata=${encodeURIComponent(message)}`
      : null;
    if (!target) {
      return new Response(message, {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return seeOther(req, target);
  }
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
  return handleToken(req, token);
}

// iyzico bazı yapılandırmalarda GET ile de dönebilir.
export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  return handleToken(req, token);
}
