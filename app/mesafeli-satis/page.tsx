import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import LegalLayout, { LegalHeading } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Mesafeli Satış Sözleşmesi — " + COMPANY.name,
  description:
    "Gözdem Burak Turizm tur ve koltuk satışlarına ilişkin Mesafeli Satış Sözleşmesi.",
};

const L = COMPANY.legal;
const dash = (v: string | null) => v ?? "—";

export default function DistanceSalesPage() {
  return (
    <LegalLayout title="Mesafeli Satış Sözleşmesi" updatedAt="06.08.2026">
      <p>
        İşbu Mesafeli Satış Sözleşmesi (&quot;Sözleşme&quot;), 6502 sayılı Tüketicinin
        Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümlerine uygun
        olarak, aşağıda bilgileri yer alan Satıcı ile Alıcı arasında elektronik ortamda
        kurulmuştur.
      </p>

      <LegalHeading>1. Taraflar</LegalHeading>
      <p>
        <strong>SATICI</strong>
        <br />
        Unvan: {L.title}
        <br />
        Adres: {COMPANY.address}
        <br />
        Vergi Dairesi / No: {L.taxOffice} / {L.taxNo}
        <br />
        MERSİS No: {dash(L.mersis)}
        <br />
        TURSAB Belge No: {dash(L.tursab)}
        <br />
        Telefon: {COMPANY.phones[0]}
        <br />
        E-posta: {COMPANY.emails[0]}
        <br />
        KEP: {dash(L.kep)}
      </p>
      <p>
        <strong>ALICI</strong>
        <br />
        Rezervasyon sırasında bildirilen ad-soyad, adres, telefon ve e-posta bilgilerine
        sahip tüketici.
      </p>

      <LegalHeading>2. Sözleşmenin Konusu</LegalHeading>
      <p>
        İşbu Sözleşme&apos;nin konusu, Alıcı&apos;nın Satıcı&apos;ya ait{" "}
        <Link href="/turlar" className="text-accent underline">
          web sitesi
        </Link>{" "}
        üzerinden elektronik ortamda siparişini verdiği; nitelikleri ve satış fiyatı
        aşağıda ve sipariş özetinde belirtilen tur/seyahat hizmetinin satışı ve ifası ile
        ilgili olarak tarafların hak ve yükümlülüklerinin belirlenmesidir.
      </p>

      <LegalHeading>3. Hizmetin Temel Nitelikleri ve Fiyatı</LegalHeading>
      <p>
        Satışa konu hizmetin türü, tarihi, kalkış/varış noktaları, konaklama ve kapsam
        bilgileri ile KDV dâhil toplam satış bedeli, Alıcı tarafından onaylanan sipariş/
        rezervasyon özetinde gösterilir. Sipariş özetinde belirtilen fiyatlar, aksi
        belirtilmedikçe kişi başı ve Türk Lirası&apos;dır.
      </p>

      <LegalHeading>4. Ödeme</LegalHeading>
      <p>
        Ödemeler, iyzico altyapısı üzerinden kredi/banka kartı (Visa, MasterCard, Troy)
        ile güvenli biçimde tahsil edilir. Kart bilgileri Satıcı tarafından saklanmaz.
        Ödemenin onaylanmasıyla rezervasyon kesinleşir.
      </p>

      <LegalHeading>5. Cayma Hakkı ve İstisnası</LegalHeading>
      <p>
        Mesafeli Sözleşmeler Yönetmeliği md. 15 uyarınca; belirli bir tarihte veya
        dönemde ifa edilmesi kararlaştırılan konaklama, eşya taşıma, araba kiralama,
        yiyecek-içecek tedariki ve eğlence veya dinlenme amacıyla yapılan boş zamanın
        değerlendirilmesine ilişkin hizmetlerde <strong>cayma hakkı bulunmamaktadır</strong>.
        Tur hizmetleri bu kapsamda olduğundan Alıcı&apos;nın 14 günlük cayma hakkı yoktur.
        İptal ve iade koşulları 6. maddede düzenlenmiştir.
      </p>

      <LegalHeading>6. İptal ve İade Koşulları</LegalHeading>
      <p>
        İptal ve iade koşulları, ayrıntısı{" "}
        <Link href="/teslimat-iade" className="text-accent underline">
          Teslimat ve İade Şartları
        </Link>{" "}
        sayfasında yer almak üzere aşağıdaki gibidir:
      </p>
      <ul className="list-disc space-y-1 pl-6">
        <li>Hareket tarihinden 7 (yedi) gün ve öncesinde yapılan iptallerde ücretin tamamı iade edilir.</li>
        <li>Hareket tarihine 7 (yedi) günden az süre kala yapılan iptallerde iade yapılmaz; ancak koltuk/rezervasyon üçüncü bir kişiye devredilebilir.</li>
        <li>Mücbir sebep hâllerinde ilgili mevzuat hükümleri uygulanır.</li>
        <li>Onaylanan iadeler, ödemenin yapıldığı karta/iyzico üzerinden 14 gün içinde gerçekleştirilir.</li>
      </ul>

      <LegalHeading>7. Genel Hükümler</LegalHeading>
      <p>
        Alıcı, sipariş öncesinde işbu Sözleşme&apos;yi ve ön bilgilendirmeyi okuyup kabul
        ettiğini beyan eder. Uyuşmazlıklarda, Ticaret Bakanlığı&apos;nca ilan edilen
        parasal sınırlar dâhilinde Alıcı&apos;nın yerleşim yerindeki Tüketici Hakem
        Heyetleri ile Tüketici Mahkemeleri yetkilidir.
      </p>
    </LegalLayout>
  );
}
