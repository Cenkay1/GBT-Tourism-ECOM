// Ödeme sağlayıcı soyutlaması.
// - iyzico anahtarları (IYZICO_API_KEY / IYZICO_SECRET_KEY) tanımlıysa gerçek iyzico kullanılır.
// - Tanımlı değilse "simülasyon" modu devreye girer: /odeme/<bookingId> test sayfası.
//   Böylece satış akışı anahtarlar gelmeden de uçtan uca test edilebilir.

export function isIyzicoConfigured(): boolean {
  return Boolean(process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY);
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

// Ödeme başlat → müşterinin yönlendirileceği URL'i döndür.
export async function startPayment(
  input: StartPaymentInput
): Promise<{ redirectUrl: string }> {
  if (!isIyzicoConfigured()) {
    // Simülasyon: kendi test ödeme sayfamıza yönlendir.
    return { redirectUrl: `/odeme/${input.bookingId}` };
  }

  // Gerçek iyzico entegrasyonu — anahtarlar tanımlandığında `iyzipay` paketi ile.
  // Kurulum: npm i iyzipay ; ardından aşağıdaki blok etkinleşir.
  // (Anahtarlarınız gelince bu bölümü canlıya alacağız.)
  throw new Error(
    "iyzico anahtarları tanımlı ama entegrasyon henüz etkin değil. Lütfen kurulum adımını tamamlayın."
  );
}
