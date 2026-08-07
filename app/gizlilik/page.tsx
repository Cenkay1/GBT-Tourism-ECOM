import type { Metadata } from "next";
import { COMPANY } from "@/lib/company";
import LegalLayout, { LegalHeading } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Gizlilik ve KVKK Aydınlatma Metni — " + COMPANY.name,
  description:
    "Kişisel verilerin işlenmesine ilişkin gizlilik politikası ve KVKK aydınlatma metni.",
};

const L = COMPANY.legal;
const dash = (v: string | null) => v ?? "—";

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Gizlilik Sözleşmesi ve KVKK Aydınlatma Metni"
      updatedAt="06.08.2026"
    >
      <p>
        {L.title} (&quot;{COMPANY.name}&quot; / &quot;Şirket&quot;) olarak, 6698 sayılı
        Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında veri sorumlusu
        sıfatıyla, kişisel verilerinizin gizliliğine önem veriyoruz. İşbu metin, verilerinizin
        hangi amaçlarla işlendiği ve haklarınız konusunda sizi bilgilendirmek için hazırlanmıştır.
      </p>

      <LegalHeading>1. Veri Sorumlusu</LegalHeading>
      <p>
        Unvan: {L.title}
        <br />
        Adres: {COMPANY.address}
        <br />
        Vergi Dairesi / No: {L.taxOffice} / {L.taxNo}
        <br />
        MERSİS No: {dash(L.mersis)}
        <br />
        E-posta: {COMPANY.emails[0]} &nbsp;|&nbsp; Telefon: {COMPANY.phones[0]}
      </p>

      <LegalHeading>2. İşlenen Kişisel Veriler</LegalHeading>
      <ul className="list-disc space-y-1 pl-6">
        <li>Kimlik bilgileri (ad, soyad, T.C. kimlik no — bilet/rezervasyon zorunluluğu gereği)</li>
        <li>İletişim bilgileri (telefon, e-posta, adres)</li>
        <li>Rezervasyon ve seyahat bilgileri (tur, tarih, koltuk, kalkış/iniş noktası)</li>
        <li>Ödeme işlem bilgileri (ödeme, iyzico altyapısı üzerinden alınır; kart bilgileri Şirket tarafından saklanmaz)</li>
      </ul>

      <LegalHeading>3. İşleme Amaçları</LegalHeading>
      <ul className="list-disc space-y-1 pl-6">
        <li>Rezervasyon ve satış sözleşmesinin kurulması ve ifası</li>
        <li>Tur öncesi/sonrası bilgilendirme ve müşteri iletişimi</li>
        <li>Yasal yükümlülüklerin (mevzuat, muhasebe, vergi) yerine getirilmesi</li>
        <li>Ödeme işlemlerinin gerçekleştirilmesi ve dolandırıcılığın önlenmesi</li>
      </ul>

      <LegalHeading>4. Hukuki Sebep</LegalHeading>
      <p>
        Kişisel verileriniz KVKK md. 5 kapsamında; sözleşmenin kurulması/ifası, hukuki
        yükümlülüğün yerine getirilmesi ve meşru menfaat hukuki sebeplerine dayanılarak işlenir.
      </p>

      <LegalHeading>5. Verilerin Aktarılması</LegalHeading>
      <p>
        Verileriniz; ödeme hizmet sağlayıcısı (iyzico), tur ifası için çalışılan taşıma ve
        konaklama tedarikçileri ile yetkili kamu kurum ve kuruluşlarına, yalnızca ilgili amaçla
        sınırlı olarak aktarılabilir. Verileriniz pazarlama amacıyla üçüncü kişilere satılmaz.
      </p>

      <LegalHeading>6. Çerezler (Cookies)</LegalHeading>
      <p>
        Web sitemizde, oturum yönetimi ve site işlevselliği için zorunlu çerezler kullanılır.
        Tarayıcı ayarlarınızdan çerez tercihlerinizi yönetebilirsiniz.
      </p>

      <LegalHeading>7. İlgili Kişinin Hakları</LegalHeading>
      <p>
        KVKK md. 11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini veya
        silinmesini isteme, işleme itiraz etme ve zararın giderilmesini talep etme haklarına
        sahipsiniz. Taleplerinizi {COMPANY.emails[0]} adresine iletebilir; KEP adresimiz{" "}
        {dash(L.kep)} üzerinden başvurabilirsiniz.
      </p>
    </LegalLayout>
  );
}
