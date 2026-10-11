# Aşama 1 — Dağıtım Notu

**Tarih:** 2026-10-11
**Kapsam:** Çoklu sefer 500 hatası + iptal edilen koltuğun boşalmaması

---

## Canlıya alırken yapılacaklar

### 1. Kodu dağıtın

Normal dağıtım akışınız. Bu adım tek başına **iptal hatasını** (koltuk dolu kalması) düzeltir.

### 2. Göç script'ini ÇALIŞTIRIN — bu adım atlanırsa 500 hatası sürer

```bash
DATABASE_URL="file:/var/www/gbt/data/prod.db" npx tsx scripts/deploy-migrate.ts
```

500 hatasının sebebi veritabanındaki eski bir indeks. Kod dağıtımı o indeksi kaldırmaz; yalnız bu script kaldırır.

**Çıktıda görmeniz gerekenler:**

```
== 6. İndeksler ==
  - eski benzersiz indeks düşürüldü: Seat_tourId_code_key
== 7. Koltuksuz seferler ==
  + <sefer-id>: NN koltuk üretildi        ← varsa
...
Tamamlandı ✅
```

**Son satıra mutlaka bakın.** Üç olasılık var:

| Son satır | Anlamı | Ne yapmalı |
|---|---|---|
| `Tamamlandı ✅` | Her şey yolunda | Bir şey yapmayın |
| `Tamamlandı — UYARI: N sefer onarılamadı ⚠️` | Geçici bir hata oldu | Script'i tekrar çalıştırın (güvenli, tekrar çalıştırılabilir) |
| `Tamamlandı — UYARI: N sefer ... atlandı ⚠️` | O seferlerin otobüs/koltuk düzeni tanımsız | Panelden o seferlere otobüs atayın, sonra script'i tekrar çalıştırın |

Script tekrar tekrar çalıştırılabilir; yarım iş bırakmaz (her seferin koltukları kendi işlemi içinde yazılır, hata olursa geri alınır).

### 3. `.env` ayarı — iptal e-postalarının göndereni

```
SMTP_FROM=info@gozdemburakturizm.com
```

Bu ayar yoksa `SMTP_USER` adresi gönderen olarak kullanılır.

---

## Neler değişti

### Düzeltilen hata 1 — çoklu seferde 500

**Sebep:** İlk migration `Seat(tourId, code)` üzerinde benzersiz indeks yaratmıştı. Şema sonradan `(departureId, code)`'a geçti ama canlı veritabanı elle yazılmış script ile güncellendiği ve o script eski indeksi hiç düşürmediği için, bir tur aynı koltuk kodunu yalnız bir kez tutabiliyordu. İkinci sefer eklenince koltuk üretimi çakışıyor ve istek 500 dönüyordu.

**Kanıt:** Üretim benzeri bir kopyada (eski indeks yerinde, koltuklar silinmiş) script çalıştırıldıktan sonra, çoklu seferli bir tura beşinci sefer eklenip kaydedildi: sefer 4→5, 220 koltuk, hata yok.

### Düzeltilen hata 2 — iptal edilen koltuk dolu kalıyordu

**Sebep:** `setBookingStatus` yalnız durum kolonunu yazıyor, koltuğa hiç dokunmuyordu.

**Şimdi:** Görevli iptal nedenini yazıyor; tek işlemde koltuk boşalıyor, sadakat puanı geri alınıyor ve müşteriye gerekçeli iptal e-postası gidiyor.

**Kanıt:** Ödenmiş rezervasyon iptal edildi → koltuklar `SATILDI`→`BOS` (cinsiyet işareti temizlendi), durum `IPTAL`, puan 3000→0, 1 adet iptal e-postası.

### Yan kazanım — iade akışı

`refundBooking` koltuk boşaltmayı kendi içinde kopyalıyordu; bu yüzden **iade edilen müşteriye ne e-posta gidiyordu ne de puanı geri alınıyordu.** Artık ortak iptal yolunu kullanıyor, ikisi de oluyor.

### Diğer iyileştirmeler

- Tur kaydında hata olursa çıplak 500 yerine okunur Türkçe mesaj; tanınmayan hatalarda kısa bir **referans kodu** veriliyor ve aynı kod sunucu günlüğüne yazılıyor — görevli size o kodu iletebilir.
- İptal edilmiş bir rezervasyonda "Ödendi olarak işaretle" düğmesi artık görünmüyor (hem arayüzde hem sunucuda engelli). Görünseydi: rezervasyon ödenmiş, koltuk boş kalır ve aynı koltuk ikinci bir müşteriye satılabilirdi.
- Rezervasyon detayında yeni bir kırmızı uyarı: **ödeme iade edilmiş ama rezervasyon iptale alınmamışsa** görevli bunu görüyor. Bu uyarı veritabanı durumundan türetiliyor, yani süreç çökse bile kaybolmuyor.

---

## Bilinmesi gerekenler

**Tarayıcıda elle doğrulama yapılamadı.** Chrome, `localhost:3000` adresinde uygulama yerine ilgisiz bir sayfa gösterdi (başlık: "GateBear - Secure Integration Platform", boş koyu ekran). Sunucunun kendisi doğru içeriği veriyor — `curl` ile doğrulandı. Bu, tarayıcı tarafındaki bir eklenti/vekil sunucu kaynaklı görünüyor ve bu projeyle ilgisi yok. Ayrıntı aşağıda.

Bunun sonucu: aşağıdaki iki ekran **kod ve Next.js dokümanlarıyla** doğrulandı, gözle görülmedi:
- İptal düğmesinin başarı mesajı (işlev değil, yalnız görsel teyit)
- Yeni kırmızı iade uyarısının ekranda nasıl durduğu

Mantığı doğrulanmış durumda; ilk fırsatta gözle bakmakta fayda var.

**İade iki aşamalı bir işlem.** Önce iyzico'dan para çıkıyor, sonra rezervasyon iptale alınıyor. Arada bir hata olursa para iade edilmiş ama rezervasyon açık kalır. Bu durum artık **görünür** (yukarıdaki kırmızı uyarı) ve "İptal et" düğmesiyle elle tamamlanabilir — ama otomatik değil. iyzico ile çalışırken bunun atomik olması mümkün değil.

**Dört ayrı iptal yolu var** ve isim benzerliği tuzak olabilir:

| Fonksiyon | Ne zaman | Koltuk |
|---|---|---|
| `cancelBooking` | Ödeme akışı iptali | Yalnız `KILITLI` |
| `releaseExpiredHolds` | Süre dolması | Yalnız `KILITLI` |
| `cancelBookingByAdmin` | **Görevli iptali / iade** | Hepsi (`SATILDI` dahil) + puan + e-posta |
| `refundBooking` | Para iadesi | `cancelBookingByAdmin`'e devreder |

Görevli iptali için **`cancelBookingByAdmin`** kullanılmalı. Yanlışı seçilirse ödenmiş koltuk dolu kalır — yani düzeltilen hata geri gelir. `cancelBooking`'in üstüne bu uyarı yorum olarak eklendi.

---

## Doğrulama özeti

| Kapı | Sonuç |
|---|---|
| `npm test` | 98 test geçti (7 dosya) |
| `npx tsc --noEmit` | Temiz |
| `npm run lint` | 5 hata — hepsi bu çalışmadan önce vardı, dokunulmayan dosyalarda |
| `npm run build` | Başarılı |
| `dev.db` | Değişmedi (testler kendi geçici kopyalarını kullanıyor) |

> **Build notu:** `npm run build` ilk denemede `.venv/bin/python` bozuk sembolik bağı yüzünden kırılıyor (bu çalışmayla ilgisiz, eski bir sorun). `.venv` geçici olarak kenara alınınca build tamamlanıyor; sonra geri konuyor.

---

## Sonraki aşamalar

Spec'teki kalan üç aşama planlanmayı bekliyor:

- **Aşama 2** — Otobüs koltuk düzeni: önizlemeden emojilerin kaldırılması, A/B/C/D yerine özel koltuk numaralandırma
- **Aşama 3** — Aylık ciro grafiği + tarih aralığı filtresi, yönetim panelinde hızlı işlem düğmeleri
- **Aşama 4** — Elden satışta gömülü iyzico kart ödemesi, e-posta eşleşince sadakat puanı, KVKK ve iptal/iade rızası
