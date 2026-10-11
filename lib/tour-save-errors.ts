// Tur kaydetme sırasında oluşan veritabanı hatalarını görevlinin okuyabileceği
// Türkçe mesaja çevirir. Saf fonksiyon — Prisma'ya import bağımlılığı yok,
// yalnız hata nesnesinin şekline bakar.

function errorCode(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return null;
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

// Prisma P2002'de meta.target kimi sürümde dizi, kimi sürümde metin gelir.
function targetText(e: unknown): string {
  if (typeof e !== "object" || e === null) return "";
  const target = (e as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.join(",");
  return typeof target === "string" ? target : "";
}

// Operatörün telefonda okuyup iletebileceği kısa bir hata referansı üretir.
// Karışması kolay karakterler (0/O, 1/I/L) dışarıda tutulur; bu bir güvenlik
// değeri değildir, sadece sunucu günlüğüyle eşleştirme etiketidir.
const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newErrorRef(): string {
  let ref = "";
  for (let i = 0; i < 6; i++) {
    ref += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)];
  }
  return ref;
}

export function tourSaveErrorMessage(e: unknown, ref?: string): string {
  if (errorCode(e) === "P2002") {
    const target = targetText(e).toLowerCase();
    if (target.includes("tourid") && target.includes("code")) {
      return (
        "Koltuklar kaydedilemedi: veritabanındaki eski koltuk benzersizlik kuralı " +
        "aynı turda birden fazla sefer açılmasını engelliyor. Sunucuda " +
        "`npx tsx scripts/deploy-migrate.ts` çalıştırıldıktan sonra tekrar deneyin."
      );
    }
    return "Bu kayıt zaten var (benzersizlik çakışması). Alanları kontrol edip tekrar deneyin.";
  }
  // Tanınmayan hata: bu geçici bir çakışma olmayabilir, gerçek bir yazılım
  // hatası olabilir. Operatöre bunu açıkça söylüyoruz ve varsa, sunucu
  // günlüğünde aranabilecek bir referans veriyoruz.
  const base = "Beklenmeyen bir hata oluştu. Bu geçici bir sorun olmayabilir; yetkiliye bildirin";
  return ref ? `${base}, referans: ${ref}.` : `${base}.`;
}
