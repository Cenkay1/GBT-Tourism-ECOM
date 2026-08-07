# iyzico Onay Kriterleri — Tasarım Dokümanı

Tarih: 2026-08-06
Kapsam: iyzico başvurusu öncesi web sitesinin karşılaması gereken kriterlerin tamamlanması.

## Amaç

iyzico "İşyeri" başvurusu için sitede bulunması zorunlu yasal sayfaları ve ödeme
markası logolarını eklemek. Ödeme entegrasyonunun kendisi (API) bu kapsamın DIŞINDA;
bu iş yalnızca onay ön-koşullarını hazırlar.

## Kriter → Durum

| Kriter | Durum | Aksiyon |
|---|---|---|
| Hakkımızda | ✅ Var (`app/hakkimizda`) | — |
| SSL Sertifikası | ⚠️ Hosting işi | Kod dışı; kullanıcıya not |
| Teslimat ve İade Şartları | ❌ | Yeni sayfa |
| Gizlilik Sözleşmesi (KVKK) | ❌ | Yeni sayfa |
| Mesafeli Satış Sözleşmesi | ❌ | Yeni sayfa |
| Visa / MasterCard logoları | ❌ | Footer ödeme bandı |
| iyzico ile Öde logosu | ❌ | Footer ödeme bandı |

Not: `iyzico-logo-pack/footer_iyzico_ile_ode/logo_band` tek görselde Visa + MasterCard +
Troy + AmEx + iyzico logolarını içerir; "Visa/MasterCard" ve "iyzico ile Öde" kriterlerini
tek başına karşılar.

## Şirket yasal bilgileri (tek kaynak: lib/company.ts → COMPANY.legal)

- Ticari unvan: BURAK TOUR SEYAHAT ACENTASI TURİZM LOJİSTİK TİCARET LİMİTED ŞİRKETİ
- Vergi Dairesi: Karadeniz Ereğli Vergi Dairesi Müdürlüğü
- VKN: 1900661898
- MERSİS No: [YER TUTUCU — sonra]
- TURSAB Belge No: [YER TUTUCU — sonra]
- KEP Adresi: [YER TUTUCU — sonra]

## Mimari / Dosyalar

1. **lib/company.ts** — `COMPANY.legal` nesnesi eklenir (üstteki alanlar). Yer tutucular
   `null` olarak tutulur; sayfalar `null` ise "—" veya gizleme ile davranır.
2. **public/payment/** — logo pack'ten kopyalanan ödeme bandı SVG'leri.
3. **components/LegalLayout.tsx** — 3 yasal sayfa için ortak başlık bandı + prose kapsayıcı
   (mevcut `hakkimizda` desenine uygun: `bg-brand` başlık + `max-w-4xl` içerik).
4. **app/mesafeli-satis/page.tsx** — Mesafeli Satış Sözleşmesi.
5. **app/gizlilik/page.tsx** — Gizlilik Sözleşmesi / KVKK Aydınlatma.
6. **app/teslimat-iade/page.tsx** — Teslimat ve İade Şartları.
7. **components/Footer.tsx** — alt bölüme ödeme bandı (beyaz rozet içinde renkli band) +
   yasal sayfa linkleri.

Her sayfa statik server component; `export const metadata` ile başlık/açıklama.

## İptal / İade politikası (standart taslak — ileride değişebilir)

- Hareket tarihinden **7 gün ve öncesi** iptalde ücretin tamamı iade edilir.
- **7 günden kısa** süre kala iptalde iade yapılmaz (koltuk devri / mücbir sebep hariç).
- Belirli tarihli tur + boş zamanın değerlendirilmesine ilişkin hizmet olduğundan
  Mesafeli Sözleşmeler Yönetmeliği md. 15/(g,h) uyarınca **cayma hakkı istisnası** belirtilir.
- İade, iptalin onayından sonra ödeme yapılan karta/iyzico üzerinden yapılır.

## Kapsam dışı (YAGNI)

- iyzico ödeme API entegrasyonu / checkout akışı.
- Checkout'a ayrı "iyzico ile Öde" butonu (kullanıcı: şimdilik sadece footer).
- SSL kurulumu (hosting tarafı).

## Doğrulama

- `npm run typecheck` temiz.
- localhost'ta `/mesafeli-satis`, `/gizlilik`, `/teslimat-iade` → HTTP 200.
- Footer'da ödeme bandı ve 3 yasal link görünür; linkler doğru route'lara gider.
