// Ödeme sağlayıcı soyutlaması — iş mantığı katmanı.
//
// - iyzico anahtarları (IYZICO_API_KEY / IYZICO_SECRET_KEY) tanımlıysa gerçek
//   iyzico Checkout Form akışı kullanılır: müşteri iyzico'nun barındırdığı
//   ödeme sayfasına yönlendirilir, kart verisi bizim sunucumuza hiç girmez.
// - Tanımlı değilse "simülasyon" modu devreye girer: /odeme/<bookingId> test
//   sayfası. Böylece yerel geliştirme ve testler anahtar olmadan da çalışır.
//
// Saf HTTP katmanı lib/iyzico.ts içinde; burada rezervasyonu iyzico isteğine
// çeviriyor ve dönen sonucu doğruluyoruz.

import { prisma } from "@/lib/db";
import { COMPANY } from "@/lib/company";
import {
  initializeCheckoutForm,
  retrieveCheckoutForm,
  verifyCheckoutFormSignature,
  iyzicoCredentials,
  IyzicoError,
  type CheckoutFormRetrieveResponse,
} from "@/lib/iyzico";

export function isIyzicoConfigured(): boolean {
  return iyzicoCredentials() !== null;
}

export interface StartPaymentInput {
  bookingId: string;
  amount: number;
  currency: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  tourTitle: string;
  baseUrl: string;
}

export const IYZICO_CALLBACK_PATH = "/api/odeme/iyzico/callback";

// Booking.totalAmount tam TL tutar (kuruş değil) — iyzico ondalıklı string
// bekliyor: 1500 → "1500.0".
function toIyzicoPrice(amount: number): string {
  return amount.toFixed(1);
}

// "Ahmet Yılmaz Demir" → { name: "Ahmet Yılmaz", surname: "Demir" }
// iyzico ad ve soyadı ayrı istiyor; tek kelimelik girişte soyad alanını boş
// bırakamayız, o yüzden adı tekrar ediyoruz.
function splitName(full: string): { name: string; surname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: "Müşteri", surname: "Müşteri" };
  if (parts.length === 1) return { name: parts[0], surname: parts[0] };
  return { name: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

// iyzico gsmNumber için +90XXXXXXXXXX biçimini bekliyor.
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("90")) return `+${digits}`;
  if (digits.startsWith("0")) return `+90${digits.slice(1)}`;
  if (digits.length === 10) return `+90${digits}`;
  return `+${digits}`;
}

// Ödeme başlat → müşterinin yönlendirileceği URL'i döndür.
export async function startPayment(
  input: StartPaymentInput
): Promise<{ redirectUrl: string }> {
  if (!isIyzicoConfigured()) {
    // Simülasyon: kendi test ödeme sayfamıza yönlendir.
    return { redirectUrl: `/odeme/${input.bookingId}` };
  }

  const { name, surname } = splitName(input.contactName);
  const price = toIyzicoPrice(input.amount);

  // Yolcunun TC kimlik numarası varsa kullan. iyzico bu alanı zorunlu tutuyor
  // ancak doğrulamıyor; yoksa dolgu değer gider.
  const firstPassenger = await prisma.passenger.findFirst({
    where: { bookingId: input.bookingId, idNumber: { not: null } },
    select: { idNumber: true },
  });
  const identityNumber = firstPassenger?.idNumber ?? "11111111111";

  // Ödeme denemesini kaydet — callback bu satırı güncelleyecek.
  const payment = await prisma.payment.create({
    data: {
      bookingId: input.bookingId,
      amount: input.amount,
      currency: input.currency,
      status: "BASLATILDI",
    },
  });

  try {
    const res = await initializeCheckoutForm({
      conversationId: input.bookingId,
      basketId: input.bookingId, // ← callback'te rezervasyonu bununla bulacağız
      price,
      paidPrice: price,
      currency: input.currency,
      callbackUrl: `${input.baseUrl}${IYZICO_CALLBACK_PATH}`,
      enabledInstallments: [1], // taksit kapalı — tek çekim
      buyer: {
        id: input.bookingId,
        name,
        surname,
        identityNumber,
        email: input.contactEmail,
        gsmNumber: normalizePhone(input.contactPhone),
        registrationAddress: COMPANY.address,
        city: "Zonguldak",
        country: "Turkey",
      },
      // Tur hizmeti fiziksel teslimat içermiyor; iyzico yine de adres zorunlu
      // tuttuğu için acentenin adresi gönderiliyor.
      shippingAddress: {
        contactName: input.contactName,
        address: COMPANY.address,
        city: "Zonguldak",
        country: "Turkey",
      },
      billingAddress: {
        contactName: input.contactName,
        address: COMPANY.address,
        city: "Zonguldak",
        country: "Turkey",
      },
      basketItems: [
        {
          id: input.bookingId,
          name: input.tourTitle.slice(0, 100),
          category1: "Tur",
          itemType: "VIRTUAL",
          price,
        },
      ],
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { token: res.token },
    });

    return { redirectUrl: res.paymentPageUrl };
  } catch (e) {
    const err = e instanceof IyzicoError ? e : null;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "BASARISIZ",
        errorCode: err?.errorCode ?? null,
        errorMessage: e instanceof Error ? e.message.slice(0, 500) : String(e),
      },
    });
    console.error("[iyzico başlatma hatası]", e);
    throw e;
  }
}

// ── Callback doğrulama ──────────────────────────────────────────────────────

export type CallbackResult =
  | { ok: true; bookingId: string; paymentId: string }
  | { ok: false; bookingId?: string; error: string };

// iyzico'nun callback'ine gelen token'dan ödemeyi doğrular.
//
// GÜVENLİK: callback herkese açık bir URL. Gelen gövdenin SADECE token'ına
// bakıyoruz; "ödeme başarılı mı, ne kadar, hangi rezervasyon için" sorularının
// cevabını iyzico'ya ayrı bir sunucu-sunucu isteğiyle biz soruyoruz:
//   1. retrieveCheckoutForm → durumu iyzico söyler, istek sahibi değil
//   2. imza doğrulaması      → yanıtın gerçekten iyzico'dan geldiğini kanıtlar
//   3. basketId              → hangi rezervasyon olduğunu iyzico söyler (token takasını kapatır)
//   4. tutar karşılaştırma   → veritabanındaki tutarla ayrışmayı yakalar
export async function verifyIyzicoCallback(token: string): Promise<CallbackResult> {
  const creds = iyzicoCredentials();
  if (!creds) return { ok: false, error: "iyzico yapılandırılmamış." };
  if (!token) return { ok: false, error: "Ödeme belirteci eksik." };

  let res: CheckoutFormRetrieveResponse;
  try {
    res = await retrieveCheckoutForm(token);
  } catch (e) {
    console.error("[iyzico sorgulama hatası]", e);
    return { ok: false, error: "Ödeme sonucu doğrulanamadı." };
  }

  // 2. İmza — yanıtın sahiciliği.
  if (!verifyCheckoutFormSignature(res, creds.secretKey)) {
    console.error("[iyzico imza doğrulanamadı]", { token, basketId: res.basketId });
    return { ok: false, error: "Ödeme doğrulaması başarısız." };
  }

  // 3. Hangi rezervasyon? Cevabı iyzico veriyor.
  const bookingId = res.basketId;
  if (!bookingId) {
    return { ok: false, error: "Ödeme bir rezervasyonla eşleşmedi." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, totalAmount: true },
  });
  if (!booking) {
    console.error("[iyzico callback: rezervasyon yok]", bookingId);
    return { ok: false, error: "Rezervasyon bulunamadı." };
  }

  const paymentRecord = await prisma.payment.findUnique({ where: { token } });

  const failed = async (error: string, extra?: Record<string, unknown>) => {
    if (paymentRecord) {
      await prisma.payment.update({
        where: { id: paymentRecord.id },
        data: {
          status: "BASARISIZ",
          paymentId: res.paymentId ?? null,
          errorCode: res.errorCode ?? null,
          errorMessage: (res.errorMessage ?? error).slice(0, 500),
          ...extra,
        },
      });
    }
    return { ok: false as const, bookingId, error };
  };

  if (res.paymentStatus !== "SUCCESS") {
    return failed(res.errorMessage ?? "Ödeme tamamlanamadı.");
  }

  // 4. Tutar: iyzico'nun sepet toplamı (price) bizim beklediğimizle eşleşmeli.
  // paidPrice DEĞİL — taksitte komisyon müşteriye bindiğinde paidPrice > price olur.
  const reportedPrice = Number(res.price);
  if (!Number.isFinite(reportedPrice) || Math.round(reportedPrice) !== booking.totalAmount) {
    console.error("[iyzico tutar uyuşmazlığı]", {
      bookingId,
      beklenen: booking.totalAmount,
      gelen: res.price,
    });
    return failed("Ödeme tutarı rezervasyonla uyuşmuyor.");
  }

  if (!res.paymentId) {
    return failed("iyzico ödeme kimliği döndürmedi.");
  }

  // Başarılı — log satırını tamamla.
  const paidAmount = Number(res.paidPrice);
  if (paymentRecord) {
    await prisma.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status: "BASARILI",
        paymentId: res.paymentId,
        paidAmount: Number.isFinite(paidAmount) ? Math.round(paidAmount) : null,
        installment: res.installment ?? null,
        cardFamily: res.cardFamily ?? null,
        cardLastFour: res.lastFourDigits ?? null,
        fraudStatus: res.fraudStatus ?? null,
        errorCode: null,
        errorMessage: null,
      },
    });
  } else {
    // Payment satırı bulunamadı (örn. elle silinmiş) — ödemeyi reddetmek yerine
    // kaydı yeniden oluşturuyoruz: imza ve tutar zaten doğrulandı.
    await prisma.payment.create({
      data: {
        bookingId,
        token,
        paymentId: res.paymentId,
        status: "BASARILI",
        amount: booking.totalAmount,
        paidAmount: Number.isFinite(paidAmount) ? Math.round(paidAmount) : null,
        currency: res.currency ?? "TRY",
        installment: res.installment ?? null,
        cardFamily: res.cardFamily ?? null,
        cardLastFour: res.lastFourDigits ?? null,
        fraudStatus: res.fraudStatus ?? null,
      },
    });
  }

  return { ok: true, bookingId, paymentId: res.paymentId };
}
