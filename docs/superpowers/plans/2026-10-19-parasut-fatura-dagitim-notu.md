# Paraşüt Fatura Entegrasyonu — Dağıtım Notu

**Tarih:** 2026-10-19
**Kapsam:** Tur kalkışı geçmiş, ödenmiş online rezervasyonlara otomatik e-Arşiv faturası
**Plan:** `docs/superpowers/plans/2026-10-13-parasut-fatura-entegrasyonu.md`
**Tasarım:** `docs/superpowers/specs/2026-10-13-parasut-fatura-entegrasyonu-design.md`

## Durum

10 görev tamamlandı, her biri ayrı ayrı incelendi, bulguları düzeltildi. Tüm dal
bütüncül olarak da incelendi. **246 test geçiyor, `tsc` temiz.**

**Duman testi henüz çalıştırılmadı** — staging anahtarları `.env.local`'e girilmedi.
Bu, aşağıdaki 3. adımın ön koşulu.

---

## Sıra önemli

Cron, 3. ve 4. adım bitmeden **açılmamalı**.

### 1. Göç

```bash
DATABASE_URL="file:/var/www/gbt/data/prod.db" npx tsx scripts/deploy-migrate.ts
```

Çıktıda şunları gör:

```
+ Invoice tablosu
+ Booking.invoicePassengerIndex
```

Bu adım atlanırsa canlıda 500 alınır (ExcelTemplate'te yaşandı).

Öncesinde yedek:

```bash
cp /var/www/gbt/data/prod.db /var/www/gbt/data/prod.db.$(date +%F-%H%M)
```

### 2. Ortam değişkenleri

Sunucudaki `.env` dosyasına:

```
PARASUT_BASE_URL=https://api.parasut.com
PARASUT_CLIENT_ID=...
PARASUT_CLIENT_SECRET=...
PARASUT_USERNAME=...
PARASUT_PASSWORD=...
PARASUT_COMPANY_ID=...
PARASUT_KDV_ORANI=0
```

- `PARASUT_COMPANY_ID` bir kez `GET /v4/me` ile öğrenilir.
- **`CRON_SECRET` zorunlu.** Fatura ucu fail-closed: tanımsızsa 503 döner ve hiç
  çalışmaz. (Hatırlatma ucundan farklı; o uç yalnız mail atıyor, bu uç yasal belge
  kesiyor.)
- `.env.example` bu dalda güncellenmedi — `PARASUT_*` değişkenlerinin oraya
  eklenmesi iyi olur.
- Sunucuda `.env.local` **bulunmamalı**; varsa `.env`'i ezer ve staging anahtarları
  canlıda devreye girer.

### 3. Duman testi (staging) — atlanmamalı

Yerelde, `.env.local` staging anahtarlarıyla:

```bash
npx tsx scripts/parasut-duman-testi.ts
```

Script üretim adresinde çalışmayı reddeder. Çıktısındaki **"DOĞRULAMA SONUÇLARI"**
bloğunda dört sorudan hiçbiri `BİLİNMİYOR` kalmamalı:

1. `unit_price` KDV hariç net mi, dahil brüt mü?
2. `sales_invoice_details` ürün ilişkisi olmadan kabul ediliyor mu?
3. `/e_archives/{id}/pdf` adres mi, binary mi döndürüyor?
4. Bireysel müşteride TCKN `tax_number` + `contact_type: "person"` doğru mu?

**1. soru NET semantiği çıkarsa `lib/parasut-invoice.ts` düzeltilmeli** — boru hattı
şu an `Booking.totalAmount`'ı (brüt tahsil edilen tutar) doğrudan `unitPrice` olarak
gönderiyor.

### 4. KDV kapısı — en kritik adım

`PARASUT_KDV_ORANI`, **mali müşavire teyit ettirilmeden ve 3. adımın net/brüt yanıtı
alınmadan** 0'dan farklı yapılmamalı.

Ama dikkat: **0 ile bırakmak da masum değil.** Cron açıldığı an GİB'e %0 KDV'li yasal
belgeler iletilmeye başlar. Yani bu adım cron'u açmanın ön koşulu, sonradan yapılacak
bir iyileştirme değil.

### 5. SMTP

`sendEmail` artık ek alıyor. SMTP yapılandırılmamışsa simülasyona düşer ve
`sendInvoiceEmail` **`true` döner** — yani fatura `GONDERILDI` işaretlenir ama
müşteriye hiçbir şey gitmez. Canlıda `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`'in gerçekten
ayarlı olduğunu doğrula.

### 6. Cron kaydı

```cron
0 6 * * * curl -s --max-time 1200 -H "Authorization: Bearer $CRON_SECRET" https://gozdemburakturizm.com/api/cron/faturalar
```

- Bir çalışma **4–7 dakika** sürebilir (50 rezervasyon × 4–5 istek × 1100 ms throttle).
  `--max-time` bunu karşılamalı.
- Ters vekil varsa `proxy_read_timeout` (nginx varsayılanı 60 sn) bağlantıyı koparır.
  Node işi tamamlar, ama platform süreci öldürürse o partinin kayıtları `ISLENIYOR`'da
  kalır — cron bir sonraki gün bayatlamış olarak toplar (10 dk eşik).
- **İlk gün cron'u elle tetikleyip çıktıyı izle**, otomatiğe sonra bağla.

### 7. İlk koşudan sonra doğrulama

Üçü tutmalı:
- Cron yanıtındaki sayılar (`islenen`, `basarili`, `hatali`, `elle`, `takili`)
- Paraşüt panelindeki fatura sayısı
- `Invoice` tablosundaki `GONDERILDI` sayısı

Bir rezervasyon detayını açıp PDF'li maili uçtan uca gör.

---

## Bilinen ve kabul edilmiş kısıtlar

- **İki çökme penceresi kapatılamıyor.** `createSalesInvoice` / `createEArchive`
  Paraşüt'te başarılı olup id veritabanına yazılmadan süreç ölürse mükerrer kayıt
  oluşabilir. Paraşüt idempotency anahtarı kabul etmiyor ve HTTP çağrısıyla DB yazısı
  tek işlemde olamıyor. Kodda dürüstçe belgelendi; kurtarma yolu panelden elle
  kontrol.
- **Döviz turlar ve yabancı uyruklu alıcılar** v1 kapsamı dışı — `ELLE` işaretlenir,
  Paraşüt panelinden elle kesilir. Panelde görünür, cron özetinde ayrı sayılır.
- **Elden satış** (`NAKIT`/`HAVALE`) kapsam dışı.
- **`escapeHtml`**: e-posta şablonlarında müşteri adı ve tur başlığı kaçırılmıyor.
  Bu proje geneli bir desen (`lib/notifications.ts` içinde altı yer), bu dalın
  regresyonu değil. Ayrı bir commit'te toplu düzeltilmeli.

## Geri dönüş

SQLite tek dosya:

```bash
<stop komutu>
cp /var/www/gbt/data/prod.db.<timestamp> /var/www/gbt/data/prod.db
<start komutu>
```

Cron'u devre dışı bırakmak tek başına yeterli: entegrasyon yalnız cron ucundan
tetikleniyor, mevcut rezervasyon ve ödeme akışlarına dokunmuyor.
