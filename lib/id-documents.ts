// Yaş doğrulama için yüklenen kimlik belgeleri.
//
// KVKK: TC kimlik görseli özel nitelikli kişisel veridir. Bu yüzden belgeler
// tur görsellerinden AYRI, public klasörün DIŞINDA bir dizinde tutulur ve
// yalnızca admin oturumuyla `/api/admin/kimlik/<yolcuId>` üzerinden okunur —
// bağlantıyı bilen üçüncü kişi erişemez. Silme elle yapılır: admin panelde
// yolcu satırındaki "Belgeyi sil" düğmesi dosyayı kalıcı olarak kaldırır
// (onay kaydı — ageVerified — dosya silinse de durur).
import path from "node:path";

// Belgelerin saklandığı dizin. UPLOAD_DIR verilmişse onun altındaki "kimlik"
// alt klasörü; verilmemişse proje kökündeki .private/kimlik (public DEĞİL).
export function idDocumentDir(): string {
  const custom = process.env.UPLOAD_DIR?.trim();
  if (custom) return path.join(custom, "kimlik");
  // Not: tur görsellerinin gittiği public/uploads'a KONMAZ.
  return path.join(process.cwd(), ".private", "kimlik");
}

export const ID_DOC_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const ID_DOC_ALLOWED = ["image/jpeg", "image/png", "image/webp"];
export const ID_DOC_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Dosya adı doğrulama: yalnız "<uuid>.<uzantı>" biçimi kabul edilir.
// Klasör geçişi (../), gizli dosya ve beklenmeyen uzantılar reddedilir.
export function isValidIdDocumentName(name: string): boolean {
  if (!name || name !== path.basename(name) || name.startsWith(".")) return false;
  if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(name)) return false;
  return true;
}

export function idDocumentPath(name: string): string | null {
  if (!isValidIdDocumentName(name)) return null;
  return path.join(idDocumentDir(), name);
}

// Admin panelde belgeyi görüntüleme yolu (yolcu id'si üzerinden, dosya adı gizli).
export function idDocumentViewUrl(passengerId: string): string {
  return `/api/admin/kimlik/${passengerId}`;
}
