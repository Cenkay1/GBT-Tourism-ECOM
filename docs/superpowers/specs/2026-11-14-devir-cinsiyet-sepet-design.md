# Rezervasyon Devri, Karşı Cins Uyarısı ve 15 Dakikalık Sepet — Tasarım

Tarih: 2026-11-14

Üç iş bir arada ele alınıyor, çünkü hepsi aynı iki kurala dokunuyor: koltuğun
kime kilitli olduğu ve yan yana cinsiyet kuralı. Devir bir koltuğun yolcusunu
değiştiriyor, sepet koltuğu rezervasyon olmadan kilitliyor, cinsiyet uyarısı da
ikisinin de müşteriye aynı dille anlatılmasını sağlıyor.

## 1. Rezervasyon Devri

### Kararlar

| Konu | Karar |
| --- | --- |
| Devir birimi | Yolcu bazında (4 kişilik rezervasyonda tek yolcu devredilebilir) |
| Sahiplik | Rezervasyonun bütün yolcuları devredilince sahiplik de yeni kişiye geçer |
| Uygunluk | Yalnız `ODENDI` ve bakiyesi 0 olan rezervasyonlar |
| Süre sınırı | Müşteri: kalkışa 24 saatten fazla. Admin: muaf (kalkışa kadar) |
| Açık bakiye | Devredilemez — adminde de. Önce kalan tahsil edilir |
| Yaş bandı | Her zaman aynı yaş bandı şartı. Farklıysa devir yok (iptal + yeni satış) |
| Cinsiyet çakışması | Engelle + o cinsiyete uygun boş koltuk öner, müşteri koltuk değiştirip devreder |
| Devir ücreti | Yok. Devirde hiçbir para hareketi olmaz |
| Onay adımı | Yok. Tek adımlı: devreden bilgileri girer, devir anında olur |

### Veri modeli

Yeni bir `Booking.status` değeri **eklenmiyor**. "DEVREDILDI" gibi bir durum
eklenseydi `status` filtreleyen her yerin (ciro, kontenjan, koltuk tahtası,
hatırlatmalar, Excel çıktısı, fatura akışı) onu öğrenmesi gerekirdi; devredilen
rezervasyon ise hâlâ geçerli ve ödenmiş bir rezervasyondur — sadece sahibi
değişir. Bu yüzden durum `ODENDI` kalır.

```prisma
model BookingTransfer {
  id          String  @id @default(cuid())
  bookingId   String
  booking     Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  passengerId String? // devredilen yolcu satırı
  seatCode    String? // devir anındaki koltuk (anlık kopya)

  // Devreden. Yolcu satırı artık yeni kişiyi tuttuğu için kimlik buraya kopyalanır.
  fromFirstName String
  fromLastName  String
  fromIdNumber  String?
  fromEmail     String
  fromUserId    String? // devredenin "Devredildi" kartı bununla listelenir
  fromUser      User?   @relation("TransfersOut", fields: [fromUserId], references: [id])

  // Devredilen
  toFirstName String
  toLastName  String
  toEmail     String
  toPhone     String
  toUserId    String?
  toUser      User?   @relation("TransfersIn", fields: [toUserId], references: [id])

  actor          String   // MUSTERI | ADMIN
  actorEmail     String
  ownershipMoved Boolean  @default(false)
  note           String   @default("")
  createdAt      DateTime @default(now())

  @@index([bookingId])
  @@index([fromUserId])
}
```

`Booking`'e bir alan: `ownerSince DateTime?` — sahipliğin bu kişiye geçtiği an
(oluşturulurken `createdAt`).

Yolcu satırı **yerinde güncellenir**: `firstName`, `lastName`, `idNumber`,
`birthDate`, `gender`, `nationality`, `country` yeni kişinin bilgileriyle
değişir; `idDocument` ve `ageVerified` sıfırlanır (eski kişinin belgesi yeni
kişiyi doğrulamaz). `ageBand` ve `roomIndex` değişmez; `seatCode` yalnız
cinsiyet nedeniyle koltuk değişmişse değişir.

### Devredilen kişiden istenen bilgiler

Checkout'ta topladığımızın aynısı, aynı doğrulamalarla: ad, soyad, e-posta,
telefon, cinsiyet, doğum tarihi, uyruk (TC / yabancı) + ülke, TC kimlik no veya
pasaport no.

### Tek kapı: `lib/transfer.ts`

Hem müşteri hem admin aynı fonksiyonu çağırır. Kontroller sırayla:

1. Rezervasyon `ODENDI` ve `balanceOf(totalAmount, paidAmount) === 0`
2. Kalkışa 24 saatten fazla (`actor === "ADMIN"` ise atlanır)
3. Yolcu bu rezervasyona ait
4. Yeni kişinin doğum tarihinden hesaplanan yaş bandı, yolcunun `ageBand`'iyle
   aynı. Değilse devir yapılmaz — mesaj "fiyat farkı oluşuyor, iptal + yeni
   satış gerekiyor" der. Böylece devirde tutar hiç değişmez.
5. Cinsiyet × yan yana kuralı (`allowedGendersFor`, bkz. bölüm 2). Çakışırsa
   hata ile birlikte o cinsiyete uygun boş koltuk listesi döner.
6. Rate limit (`lib/rate-limit.ts`)

Tüm güncellemeler tek `$transaction` içinde: yolcu satırı, `Seat.gender`
(koltuk değiştiyse eski koltuk `BOS`, yeni koltuk `SATILDI`), `BookingTransfer`
satırı ve gerekiyorsa sahiplik alanları.

### Sahiplik geçişi

Devirden sonra "hâlâ mevcut sahibe bağlı" yolcu kalmadıysa sahiplik geçer.
Ölçüt: `BookingTransfer.createdAt > booking.ownerSince` olan bir devir satırı
bulunmayan yolcu sayısı sıfır. Strict `>` karşılaştırması zincirleme devirlerde
(A → B → C) de doğru sonuç verir.

Geçtiğinde güncellenenler: `userId` (devredilen kişinin e-postası doğrulanmış
bir hesaba aitse o hesap, değilse `null`), `contactName`, `contactEmail`,
`contactPhone`, `ownerSince`, `ownershipMoved = true`.

### Kasten dokunulmayanlar

- **Fatura.** Devir anında fatura zaten devredene kesilmiştir. Devir faturayı
  yenilemez, iptal etmez, yeni fatura kesmez.
- **Puan.** Ödeme anında devredene yazılmıştır, devirle geçmez.

### Ekranlar

- **Müşteri:** `/hesabim/rezervasyonlarim/[id]/devret` — yolcu seç, bilgi formu,
  özet, onay. `BookingRow`'da "Devret" butonu yalnız uygun rezervasyonlarda;
  uygun değilse sebebi yazılır ("kalkışa 24 saatten az kaldı").
- **Admin:** `/admin/rezervasyonlar/[id]` içinde `TransferPanel` ve o
  rezervasyonun devir geçmişi.
- **Devredenin listesi:** sahiplik geçtiyse rezervasyon `getUserBookings`'den
  gelmez; yerine `BookingTransfer`'dan üretilen salt-okunur kart görünür
  ("Devredildi → Can Y. · 14 Kas 2026"). Kısmi devirde rezervasyon normal
  görünür, kartta "1 yolcu devredildi" satırı eklenir.

### E-postalar

`lib/notifications.ts`'e, mevcut `email-layout.ts` kabuğuyla:

1. `sendTransferReceived` — devredilen kişiye: tur, kalkış tarihi/saati, biniş
   noktası, koltuk, rezervasyon no, devredenin adı, acente iletişim bilgileri.
2. `sendTransferSent` — devredene devir özeti.
3. `sendTransferAdminNotice` — `adminNotifyEmail()`'e "yolcu listesi değişti"
   bildirimi (otel bildirimi / manifest güncellemesi gerekebilir).

## 2. Karşı Cins Uyarısı

Mevcut sorun: `conflictReason()` cinsiyet **seçildikten sonra** çalışıyor
(`components/SeatMap.tsx:92`), modal kapanıyor, uyarı panelin üstünde kalıyor
ama koltuk yine düz yeşil görünüyor — müşteri koltuğun boş olduğunu düşünüp
tekrar basıyor. Kural doğru çalışıyor; eksik olan kuralın seçimden **önce**
görünmesi.

### Yardımcı fonksiyon

`lib/shared.ts`:

```ts
allowedGendersFor(
  code: string,
  src: { seatMap?: SeatMapRows | null; layout: string },
  takenGenders: Record<string, Gender>,
  exclude?: Set<string>
): { E: boolean; K: boolean; blockedBy: { E: string[]; K: string[] } }
```

`blockedBy` hangi komşunun engellediğini döndürür; mesaj oradan kurulur.
`exclude` kendi sepetimdeki koltukları kuraldan düşer — "aynı rezervasyonda
seçilenler serbest" kuralı korunur (sepet koltukları `KILITLI` olduğu için
`seatGenders` içinde görünür, dışlanmazsa müşteri kendi seçimiyle çakışır).

### `SeatMap` değişiklikleri

1. Kısıtlı boş koltuk düz yeşil değil: yanında kadın yolcu varsa pembe
   kenarlık, erkek varsa mavi kenarlık; `title` sebebi yazar. Hiçbir cinsiyetin
   mümkün olmadığı koltuk (iki yanında farklı cinsiyetler) tamamen pasif.
2. Cinsiyet penceresinde yasaklı buton **pasif** ve sebebi pencerenin içinde —
   müşteri basıp reddedilmiyor, basmadan önce görüyor.
3. Uyarı metni kendiliğinden kaybolmuyor; başka bir koltuğa basılana kadar durur.
4. Açıklama şeridine "Sadece kadın" ve "Sadece erkek" rozetleri eklenir.
5. Aynı fonksiyon sunucuda da çağrılır (sepete ekleme ve devir), böylece istemci
   kandırılamaz ve iki yerde birebir aynı mesaj görünür.

## 3. Sepet ve 15 Dakikalık Tutma

Tutma artık koltuk seçiminde başlar (bugün rezervasyon oluşturulduğunda
başlıyor), süre 5 değil **15 dakika**.

### Şema

`Seat` modeline iki kolon: `holdToken String?`, `holdExpiresAt DateTime?`, artı
`@@index([holdToken])`. `lib/shared.ts`'teki `HOLD_MINUTES` 15 olur.

Kilit iki kaynaktan gelebilir ve ikisi `holdExpiresAt` ile ayrışır:

- **Sepet kilidi:** `status = KILITLI`, `holdToken` dolu, `holdExpiresAt` dolu.
- **Rezervasyon kilidi:** `status = KILITLI`, `holdToken = null`,
  `holdExpiresAt = null`; süre `booking.holdExpiresAt`'tadır.

### Sepet kimliği

httpOnly çerez `gbt_sepet` — 32 bayt rastgele anahtar, 1 gün ömür. Server
action içinde oluşturulur.

### Server action'lar (`lib/cart-actions.ts`)

- `addSeatToCart(departureId, code, gender)`
- `removeSeatFromCart(departureId, code)` — yalnız `holdToken` benimse
- `getCart()` — `holdToken` benim ve süresi dolmamış koltuklar + tur/sefer + tutar
- `clearCart()`

Ekleme tek sorguyla atomik:

```ts
prisma.seat.updateMany({
  where: { departureId, code, status: "BOS" },
  data: { status: "KILITLI", gender, holdToken, holdExpiresAt },
});
// count === 0  →  "bu koltuk az önce alındı"
```

`Seat` zaten `@@unique([departureId, code])` taşıdığı için iki eşzamanlı istek
yarışmaz. Doğrulamalar: en çok 6 koltuk, cinsiyet kuralı, tek sefer kuralı.

### Süpürme

Mevcut `releaseExpiredHolds()` (`lib/booking.ts:145`) genişler ve süresi geçmiş
sepet kilitlerini de boşaltır:

```ts
prisma.seat.updateMany({
  where: { status: "KILITLI", holdExpiresAt: { lt: now } },
  data: { status: "BOS", gender: null, holdToken: null, holdExpiresAt: null },
});
```

Rezervasyona bağlı kilitlerde `Seat.holdExpiresAt = null` olduğundan bu süpürme
onlara dokunmaz. Fonksiyon `lib/tours.ts:405` ve `:530`'da her tur/sefer
okumasında çağrıldığı için ek cron gerekmez.

### Sepetten rezervasyona

`createPendingBooking`'in "satılabilir koltuk" tanımı değişir: `BOS`, **veya**
`KILITLI` olup `holdToken` benim sepetim ve süresi dolmamış. Rezervasyon
açılınca `holdToken` ve `Seat.holdExpiresAt` temizlenir, kilidi
`booking.holdExpiresAt` devralır.

`booking.holdExpiresAt` **sepetin kalan süresidir, 15 dakikaya sıfırlanmaz** —
tutma koltuk seçiminde başlar ve ödeme adımında yenilenmez. Sepette 4 dakika
kalmışsa rezervasyonun süresi de 4 dakikadır. Tek istisna aşağıdaki ödeme
penceresi korumasıdır.

`/rezervasyon` sayfası koltukları artık **sepetten** okur. URL'deki `koltuklar`
parametresi yalnız sepetle karşılaştırma için kullanılır: sepette olmayan bir
koltuk formda görünmez. Sepet boş ya da süresi dolmuşsa form açılmaz, "süre
doldu, koltukları yeniden seçin" ekranı ve tura dönüş bağlantısı gösterilir.
Böylece elle URL yazarak başkasının koltuğuyla forma girilemez.

Elden satıştaki `allowBlocked` davranışı (BLOKE koltuk satılabilir) aynen
korunur; admin satışları sepetten geçmez.

### Ödeme penceresi koruması

Tutma koltuk seçiminde başladığı için form doldurma ve iyzico 3D Secure aynı 15
dakikaya sığmak zorundadır. Süre iyzico ekranındayken dolarsa bugünkü kod
ödemeyi reddediyor (`lib/booking.ts:594`) — yani para çekilir, koltuk gider. Bu
yüzden:

- iyzico'ya yönlendirilirken (`startPayment`) kilit **+10 dakika** uzatılır
  (`PAYMENT_GRACE_MINUTES = 10`).
- Ödeme başarılı dönüp süre yine dolmuşsa ödeme **reddedilmez**: koltuk hâlâ bu
  rezervasyondaysa normal kabul edilir; başkasına verilmişse ödeme kabul edilir
  ve admine "elle çözülmesi gereken koltuk çakışması" bildirimi gider. Para
  hiçbir koşulda sessizce reddedilmez.

### Ekranlar

- Kök layout'ta `CartProvider`, sunucuda `getCart()` ile hidrasyon.
- Header'da `components/CartBadge.tsx`: rozet adet gösterir; açılan panelde
  koltuklar, kalan süre, tutar, "Devam Et". Son 2 dakikada rozet kırmızı.
- Koltuk şemasındaki mevcut "Seçim Özeti" panelinde de geri sayım yazar —
  müşteri seçim yaparken orada olduğu için.
- `SeatMap`'e `myHeldSeats: { code, gender }[]` prop'u (sunucuda çerezden
  okunur): sayfa yenilenince sepetteki koltuklar "dolu" değil "sizin" görünür.
  Her tıklama server action ile senkronlanır; yerel state tek doğru kaynak değil.
- `MobileBookingBar` sepetle birleşir (kalan süre orada da görünür).
- Admin koltuk tahtasında sepet kilitleri "Sepette · 12:40" olarak etiketlenir
  (`lib/seat-board.ts` bugün yalnız `BEKLIYOR` rezervasyonun süresini biliyor).
- Sepet **tek seferin** koltuklarını tutar. Başka seferden koltuk seçilirse
  "Sepetinizde başka bir sefere ait 2 koltuk var, bırakılsın mı?" onayı sorulur.
- Süre istemcide 0'a inince panel "Koltuklarınız serbest bırakıldı" olur ve
  `router.refresh()` ile şema tazelenir.

## Testler

- `lib/__tests__/transfer.test.ts` — uygunluk kuralları, 24 saat sınırı, yaş
  bandı reddi, cinsiyet çakışması + koltuk önerisi, sahiplik geçişi, zincirleme
  devir (A→B→C), aynı formun iki kez gönderilmesi.
- `lib/__tests__/seat-gender.test.ts` — `allowedGendersFor`: 2+2, 2+1, serbest
  plan, son sıra, koridor komşuluğu, kendi sepetinin dışlanması.
- `lib/__tests__/cart.test.ts` — atomik ekleme (iki eşzamanlı istek), cinsiyet
  reddi, 6 koltuk sınırı, süresi dolmuş kilidin süpürülmesi, sepetten
  rezervasyona dönüşüm, başka sefere geçiş, ödeme penceresi uzatması.

## Riskler

- **`createPendingBooking` koltuk kabulü.** "Satılabilir" tanımı genişliyor;
  yanlış yazılırsa başkasının sepetindeki koltuk satılabilir. Testte
  "başka sepetin koltuğu satılamaz" senaryosu zorunlu.
- **Sepet kilidi ile rezervasyon kilidinin karışması.** Süpürme yalnız
  `holdExpiresAt != null` satırlara dokunmalı; aksi halde ödeme bekleyen
  rezervasyonların koltukları boşalır.
- **Yerel SQLite.** `prisma db push` yerel `dev.db` üzerinde çalışır; `.env`
  içindeki `DATABASE_URL` canlı yolu gösterdiği için yerelde
  `DATABASE_URL="file:./dev.db"` ile çalıştırılmalı. Yeni model eklendiğinde
  `prisma generate` sonrası dev sunucusu yeniden başlatılmalı.

---

# Ek Özellikler (2026-11-14, aynı oturumda eklendi)

## 4. Kalkışa 5 Günden Az Kaldıysa Ön Ödeme Kapanır

### Karar
Global sabit: `DEPOSIT_CUTOFF_DAYS = 5` (`lib/shared.ts`). Tur bazında
ayarlanabilir alan EKLENMEZ.

### Kural
Seferin kalkış tarihine 5 günden az kaldıysa ön ödeme (kapora) seçeneği
kapanır; müşteri yalnız peşin ödeyebilir. Gerekçe: kalan ödemenin son tarihi
(`balanceDueDays`) kalkıştan önceye düşemeyeceği için kapora alınırsa tahsil
edilemeyen bakiye ile otobüse binilir.

Sınır **seferin** kalkış tarihinden hesaplanır (turun değil) — bir tur birden
çok sefer taşıyor ve her seferin tarihi farklı.

### Uygulama noktaları
- `lib/shared.ts` → `depositAvailableFor(departureDate: Date | string, now?: Date): boolean`
  ve `DEPOSIT_CUTOFF_DAYS` sabiti.
- `components/CheckoutForm.tsx:216` → `depositEnabled`, `depositPercent > 0`
  koşuluna **ek olarak** `depositAvailableFor(...)` koşulunu da taşır. Seçenek
  gösterilmez; yerine "Kalkışa 5 günden az kaldığı için ön ödeme kapalı,
  rezervasyon peşin tamamlanır" notu çıkar.
- `lib/booking.ts:280` → `depositEnabled` aynı kontrolü sunucuda yapar.
  İstemci kandırılsa bile `paymentPlan: "DEPOSIT"` peşine düşer (mevcut davranış:
  geçersiz plan sessizce FULL'e düşüyor — korunur).

### Etkilenmeyenler
Hâlihazırda açık bakiyesi olan rezervasyonlar. Kural yalnız YENİ rezervasyonun
ödeme planını belirler; mevcut bakiyeler ve `/kalan-odeme/<token>` akışı aynen
çalışır.

## 5. Admin Üye Yönetimi (Ekle / Pasife Al / Kalıcı Sil)

### Karar
Pasife alma varsayılan, kalıcı silme ayrı onaylı buton.

### Şema
`User`'a bir alan: `active Boolean @default(true)`.

Pasif üye giriş yapamaz. Kontrol iki yerde: kimlik doğrulama (`auth.ts` /
`lib/auth-actions.ts` giriş akışı) ve oturum çözümleme (`lib/session.ts`) —
ikincisi, pasife alındığı anda açık oturumu olan üyenin de düşmesini sağlar.

### Üye ekleme
Admin formu: ad, e-posta (zorunlu, `User.email` unique), telefon. Şifre
verilmez — `passwordHash` null kalır, üye "şifremi unuttum" akışıyla kendi
şifresini kurar (mevcut `lib/verification.ts` + `sendPasswordResetEmail`).

`emailVerified` admin eklediğinde **dolu** işaretlenir: acente üyeyi tanıyor.
Bunun bilinen yan etkisi var ve kasıtlıdır — `linkGuestBookings` yalnız
doğrulanmış e-postalarda çalıştığı için (`app/hesabim/rezervasyonlarim/page.tsx`),
o e-postayla yapılmış misafir rezervasyonları otomatik olarak bu hesaba bağlanır.
İstenen davranış budur; ama admin yanlış e-posta girerse başkasının
rezervasyonlarını bu hesaba bağlar. Bu yüzden form e-postayı iki kez sormaz,
onun yerine kaydetmeden önce "bu e-postayla N misafir rezervasyonu var, bu
hesaba bağlanacak" uyarısını gösterir.

### Kalıcı silme
`prisma.user.delete`. İlişkili kayıtların akıbeti:
- `Booking.userId` opsiyonel → `SetNull`: rezervasyonlar MİSAFİR rezervasyonuna
  döner, yolcu listesi/fatura/koltuk etkilenmez.
- `Account`, `Session`, `PointsLedger`, `SavedPassenger` → Cascade (şemadaki
  tanım), yani puan geçmişi ve kayıtlı kişiler silinir.

Silme ekranı, silmeden önce bu sonucu sayılarla yazar ("3 rezervasyon misafire
dönecek, 1.250 puan ve 4 kayıtlı kişi silinecek").

### Ekranlar
`app/admin/(dash)/uyeler/page.tsx` — tabloya "Durum" kolonu ve satır başına
pasife al / aktif et butonu; üstte "Üye Ekle" formu. Kalıcı silme üye detay
sayfasında (`uyeler/[id]`), çift onaylı.

## 6. Yedek Liste (Otobüs Dolduğunda Koltuksuz Kayıt)

### Karar
Para alınmaz. Yedek kayıt bir REZERVASYON DEĞİLDİR: koltuk ayrılmaz, tahsilat
yapılmaz, kontenjan/ciro sayımına girmez. Bu yüzden `Booking` üzerinde yeni bir
durum değeri değil, ayrı bir model kullanılır.

### Amaç (kullanıcının tarifi)
Otobüs dolduğunda talep kaybedilmesin; yeterli talep birikirse 2. otobüs temin
edilir, ya da 1. otobüsten bir iptal çıkınca bekleyen oraya yerleştirilir, ya da
bekleyen farklı bir sefere taşınır.

### Şema
```prisma
model Waitlist {
  id          String   @id @default(cuid())
  tourId      String
  tour        Tour     @relation(fields: [tourId], references: [id], onDelete: Cascade)
  departureId String?  // hangi sefer için bekliyor (sefersiz tur için null)
  departure   TourDeparture? @relation(fields: [departureId], references: [id], onDelete: Cascade)

  contactName  String
  contactPhone String
  contactEmail String
  quantity     Int     @default(1) // kaç kişi
  note         String  @default("") // müşterinin notu / admin notu
  userId       String? // giriş yapmış müşteriyse hesabı
  user         User?   @relation(fields: [userId], references: [id])

  status      String    @default("BEKLIYOR") // BEKLIYOR | DONUSTURULDU | IPTAL
  bookingId   String?   // DONUSTURULDU ise oluşan rezervasyon
  handledAt   DateTime?
  handledNote String    @default("")
  createdAt   DateTime  @default(now())

  @@index([departureId, status])
  @@index([tourId])
}
```

### Müşteri tarafı
Sefer dolduğunda (KOLTUK: boş koltuk yok; KONTENJAN: `departureSeatsLeft === 0`)
tur sayfasındaki pasif "tükendi" durumunun yerine **"Yedek Listeye Yazıl"**
formu çıkar: ad, telefon, e-posta, kişi sayısı, not. Koltuk seçimi YOK.

Form gönderilince müşteriye "yedek listeye alındınız — yer açılırsa sizi
arayacağız, ödeme şimdi alınmaz" e-postası, admine bildirim gider. Form
`lib/rate-limit.ts` ile sınırlanır.

### Admin tarafı
`/admin/yedek-liste` — seferlere göre gruplanmış liste; her satırda kişi sayısı,
iletişim, not, bekleme süresi. Sefer başlığında "N kişi bekliyor" toplamı
(2. otobüs kararı bu sayıyla veriliyor).

Satır işlemleri:
1. **Rezervasyona çevir** — mevcut elden satış formunu (`/admin/rezervasyonlar/yeni`)
   ad/telefon/e-posta/kişi sayısı önden doldurulmuş açar. Satış tamamlanınca
   yedek kayıt `DONUSTURULDU` olur ve `bookingId` bağlanır. Dönüşüm elle
   tetiklenir; otomatik bildirim/otomatik yerleştirme YOK — yerleştirme kararı
   acentenin.
2. **Başka sefere taşı** — `departureId` değiştirilir (2. otobüs yeni bir sefer
   olarak açıldığında tüm bekleyenler oraya taşınır).
3. **İptal / not ekle** — `status = IPTAL`, `handledNote` serbest metin.

### Kontenjan sayımına etkisi
Hiç. `Waitlist` satırları `sold`, `soldSeats`, ciro ve koltuk tahtası
sorgularının hiçbirine girmez. Tur sayfasındaki "tükendi" durumu da değişmez —
yedek liste yalnız o durumda EK bir giriş yolu açar.

### Testler
- `lib/__tests__/deposit-cutoff.test.ts` — 5 gün kuralı: 6 gün kaldı → açık,
  5 gün → kapalı, 4 gün → kapalı, kalkış geçmiş → kapalı; sunucu tarafının
  istemciyi ezmesi.
- `lib/__tests__/waitlist.test.ts` — dolu seferde kayıt açılır, boş seferde
  açılmaz; rezervasyona dönüşüm `DONUSTURULDU` + `bookingId` yazar; iki kez
  dönüştürme ikinci kez rezervasyon açmaz; sefere taşıma; kontenjan sayımının
  etkilenmediği.
- `lib/__tests__/admin-members.test.ts` — pasif üye giriş yapamaz; pasife alma
  geri alınabilir; kalıcı silme `Booking.userId`'yi null'a çeker ve
  rezervasyonu silmez.
