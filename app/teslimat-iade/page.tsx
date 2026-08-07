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
    <LegalLayout title="Teslimat ve İade Şartları" updatedAt="06.08.2026">
      <LegalHeading>1. Hizmetin Teslimi</LegalHeading>
      <p>
        {COMPANY.name} üzerinden satın alınan ürün, fiziki bir eşya değil; belirli bir tarih
        ve güzergâhta ifa edilen tur/seyahat hizmetidir. Ödemesi onaylanan rezervasyonun
        e-bileti/onayı, Alıcı&apos;nın rezervasyon sırasında bildirdiği e-posta adresine ve/veya
        SMS ile elektronik olarak iletilir. &quot;Teslim&quot;, bilet/onayın Alıcı&apos;ya
        iletilmesi ve hizmetin belirtilen tarihte ifa edilmesiyle gerçekleşir.
      </p>

      <LegalHeading>2. İptal Koşulları</LegalHeading>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Hareket tarihinden <strong>7 (yedi) gün ve öncesinde</strong> yapılan iptallerde
          ödenen ücretin tamamı iade edilir.
        </li>
        <li>
          Hareket tarihine <strong>7 (yedi) günden az</strong> süre kala yapılan iptallerde
          iade yapılmaz; ancak rezervasyon/koltuk, Alıcı&apos;nın bildireceği üçüncü bir kişiye
          devredilebilir.
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

      <LegalHeading>3. İade Süreci</LegalHeading>
      <p>
        İptal talepleri {COMPANY.emails[0]} veya {COMPANY.phones[0]} üzerinden iletilir. İadeye
        hak kazanılan durumlarda geri ödeme, iptalin onaylanmasını takiben{" "}
        <strong>14 (on dört) gün</strong> içinde, ödemenin yapıldığı karta iyzico altyapısı
        üzerinden gerçekleştirilir. Kartınıza yansıma süresi bankanıza göre değişebilir.
      </p>

      <LegalHeading>4. Cayma Hakkı</LegalHeading>
      <p>
        Belirli tarihte ifa edilen seyahat/boş zaman değerlendirme hizmetleri, Mesafeli
        Sözleşmeler Yönetmeliği md. 15 kapsamında cayma hakkının istisnasıdır. Ayrıntılı bilgi{" "}
        <Link href="/mesafeli-satis" className="text-accent underline">
          Mesafeli Satış Sözleşmesi
        </Link>{" "}
        sayfasındadır.
      </p>
    </LegalLayout>
  );
}
