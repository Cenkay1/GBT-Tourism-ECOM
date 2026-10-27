// Satın alma öncesi alınan rızalar (KVKK + mesafeli satış / iptal-iade).
//
// Neden kayıt tutuyoruz: KVKK'da rızanın alınmış olması yetmez, uyuşmazlıkta
// ALINDIĞININ İSPATI gerekir. Bu yüzden rızanın anı, hangi metin sürümü için
// verildiği ve isteğin IP'si Booking üzerinde saklanır.
//
// Sözleşme metinleri (/gizlilik, /mesafeli-satis, /teslimat-iade) güncellendiğinde
// AŞAĞIDAKİ SÜRÜM ELLE YÜKSELTİLMELİ — yoksa eski metne verilmiş rıza yeni metne
// verilmiş gibi görünür.
export const CONSENT_VERSION = "2026-10-28";

// Formdan gelen iki onay kutusunun alan adları. İstemci ve sunucu aynı adı
// kullansın diye tek yerde tutuluyor.
export const CONSENT_FIELDS = {
  terms: "onayMesafeliSatis", // Mesafeli Satış Sözleşmesi + İptal/İade Koşulları
  privacy: "onayKvkk", // Gizlilik Politikası + KVKK Aydınlatma Metni
} as const;

export interface ConsentRecord {
  consentAcceptedAt: Date;
  consentVersion: string;
  consentIp: string | null;
}

// Bir onay kutusu değeri "işaretli" sayılır mı?
// Tarayıcı işaretli kutuyu "on" olarak gönderir; istemci atlanırsa başka bir
// değer gelebilir, bu yüzden bilinen doğruluk değerlerini açıkça sayıyoruz.
export function isChecked(value: FormDataEntryValue | null): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "on" || v === "true" || v === "1" || v === "evet";
}

export type ConsentCheck =
  | { ok: true; consent: ConsentRecord }
  | { ok: false; error: string };

// Sunucu tarafı rıza doğrulaması. İstemcideki `required` niteliği tek başına
// kanıt değildir: elle hazırlanmış bir istek onu atlar. Rıza alınmadan satış
// yapılmamalı, bu yüzden eksik onayda istek REDDEDİLİR.
export function checkConsent(fd: FormData, ip: string | null): ConsentCheck {
  const terms = isChecked(fd.get(CONSENT_FIELDS.terms));
  const privacy = isChecked(fd.get(CONSENT_FIELDS.privacy));

  if (!terms && !privacy) {
    return {
      ok: false,
      error:
        "Devam edebilmek için Mesafeli Satış Sözleşmesi, İptal/İade Koşulları ve KVKK Aydınlatma Metni'ni onaylamanız gerekir.",
    };
  }
  if (!terms) {
    return {
      ok: false,
      error:
        "Mesafeli Satış Sözleşmesi ve İptal/İade Koşulları onaylanmadan satış tamamlanamaz.",
    };
  }
  if (!privacy) {
    return {
      ok: false,
      error:
        "KVKK Aydınlatma Metni ve Gizlilik Politikası onaylanmadan satış tamamlanamaz.",
    };
  }

  return {
    ok: true,
    consent: {
      consentAcceptedAt: new Date(),
      consentVersion: CONSENT_VERSION,
      consentIp: ip,
    },
  };
}

// İstemci IP'si. Vekil sunucu (Cloudflare/nginx) arkasında gerçek IP
// x-forwarded-for listesinin İLK öğesidir; sonrakiler aradaki vekillerdir.
export function clientIpFrom(headers: {
  get(name: string): string | null;
}): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : null;
}
