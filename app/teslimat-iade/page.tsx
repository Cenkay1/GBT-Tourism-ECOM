import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import LegalLayout, { LegalHeading } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Teslimat ve İade Şartları — " + COMPANY.name,
  description:
    "Tur/koltuk satışlarında hizmetin teslimi, iptal ve iade koşulları.",
};

export default function DeliveryReturnPage() {
  return (
    <LegalLayout title="Teslimat ve İade Şartları" updatedAt="10.11.2026">
      <LegalHeading>1. Hizmetin Teslimi</LegalHeading>
      <p>
        {COMPANY.name} üzerinden satın alınan ürün, fiziki bir eşya değil; belirli bir tarih
        ve güzergâhta ifa edilen tur/seyahat hizmetidir. Ödemesi onaylanan rezervasyonun
        e-bileti/onayı, Alıcı&apos;nın rezervasyon sırasında bildirdiği e-posta adresine ve/veya
        SMS ile elektronik olarak iletilir. &quot;Teslim&quot;, bilet/onayın Alıcı&apos;ya
        iletilmesi ve hizmetin belirtilen tarihte ifa edilmesiyle gerçekleşir.
      </p>

      <LegalHeading>2. Rezervasyon ve Ön Ödeme Koşulları</LegalHeading>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Tur rezervasyonu sırasında koltuk numarasının ayrılması ve ön rezervasyonun
          oluşturulması için <strong>kişi başı toplam tur ücretinin %25&apos;i</strong>{" "}
          oranında ön ödeme alınır. Ön ödeme oranı tur bazında değişebilir; satın alma
          ekranında şimdi ödenecek tutar ve kalan tutar açıkça gösterilir.
        </li>
        <li>
          Kalan ödemenin, tur tarihinden <strong>en geç 5 (beş) gün önce</strong>,
          Alıcı&apos;ya bildirilen son ödeme tarihine kadar tamamlanması gerekir.
        </li>
        <li>
          Belirtilen son ödeme tarihine kadar ödemesi tamamlanmayan rezervasyonlar iptal
          edilerek sistemden silinebilir ve ilgili koltuk hakkı diğer misafirlerin
          rezervasyonuna açılabilir. Bu durumda aşağıdaki kesinti koşulları uygulanır.
        </li>
      </ul>

      <LegalHeading>3. İptal ve Ücret İadesi Koşulları</LegalHeading>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Tur hareket tarihine <strong>5 (beş) günden daha az</strong> süre kala yapılan
          iptallerde, ödenmiş olan tur ücretinin <strong>%50&apos;si</strong> iade edilir;
          kalan %50&apos;si kesinti olarak uygulanır.
        </li>
        <li>
          Tur hareket tarihine <strong>2 (iki) günden az</strong> süre kala yapılan
          iptallerde, ödenmiş olan tur ücretinin <strong>%100&apos;ü</strong> kesinti
          olarak uygulanır ve ücret iadesi yapılmaz.
        </li>
        <li>
          İptal taleplerinin <strong>yazılı olarak</strong> Satıcı&apos;ya iletilmesi
          gerekir. İptal ve iade işlemleri, geçerli mevzuat ve sözleşme hükümleri
          çerçevesinde değerlendirilir.
        </li>
        <li>
          Alıcı&apos;nın tura katılmaması (no-show) durumunda ücret iadesi yapılmaz.
        </li>
        <li>
          Turun Satıcı tarafından iptal edilmesi hâlinde ödenen tutarın tamamı Alıcı&apos;ya
          iade edilir.
        </li>
        <li>
          Mücbir sebep (doğal afet, resmî yasak vb.) hâllerinde ilgili mevzuat hükümleri
          uygulanır.
        </li>
      </ul>

      <LegalHeading>4. Rezervasyonun Başka Bir Misafire Devredilmesi</LegalHeading>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          İptal etmek isteyen misafirin yerine, aynı tur koşullarını kabul eden başka bir
          katılımcı bulunması ve yeni katılımcının tur ücretini eksiksiz ödemesi durumunda
          rezervasyon devri, acentenin onayıyla gerçekleştirilebilir.
        </li>
        <li>
          Devir işleminin tamamlanması hâlinde, iptal eden misafire yapılan ödeme,
          uygulanacak kesinti ve iade koşulları doğrultusunda değerlendirilir.
        </li>
      </ul>

      <LegalHeading>5. İade Süreci</LegalHeading>
      <p>
        İptal talepleri {COMPANY.emails[0]} veya {COMPANY.phones[0]} üzerinden iletilir. İadeye
        hak kazanılan durumlarda geri ödeme, iptalin onaylanmasını takiben{" "}
        <strong>14 (on dört) gün</strong> içinde, ödemenin yapıldığı karta iyzico altyapısı
        üzerinden gerçekleştirilir. Kartınıza yansıma süresi bankanıza göre değişebilir.
      </p>

      <LegalHeading>6. Cayma Hakkı</LegalHeading>
      <p>
        Belirli tarihte ifa edilen seyahat/boş zaman değerlendirme hizmetleri, Mesafeli
        Sözleşmeler Yönetmeliği md. 15 kapsamında cayma hakkının istisnasıdır. Ayrıntılı bilgi{" "}
        <Link href="/mesafeli-satis" className="text-accent underline">
          Mesafeli Satış Sözleşmesi
        </Link>{" "}
        sayfasındadır.
      </p>

      <LegalHeading>7. Tur Organizasyonu ve Genel Bilgilendirme</LegalHeading>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Ulaşım ve otel bilgileri, hizmet kategorileri aynı kalmak koşuluyla değişiklik
          gösterebilir.
        </li>
        <li>
          Hava muhalefeti nedeniyle oluşabilecek değişikliklerde, misafirlerin güvenliği ve
          organizasyonun koşulları dikkate alınarak gerekli düzenlemeler yapılır.
        </li>
        <li>
          Kalkıştan bir gün önce hareket saati, buluşma noktası ve diğer gerekli
          bilgilendirmeler misafirlerle paylaşılır.
        </li>
        <li>
          Yeterli katılımın sağlanamaması durumunda acente, tur tarihinden en geç 48 saat
          öncesine kadar misafirlerini bilgilendirmek kaydıyla turu ileri bir tarihe erteleme
          veya iptal etme hakkına sahiptir. Bu durumda uygulanacak işlemler ilgili mevzuat ve
          sözleşme hükümlerine uygun şekilde yürütülür.
        </li>
      </ul>
    </LegalLayout>
  );
}
