import path from "node:path";

// Yüklenen görsellerin saklandığı klasör.
// Canlıda kalıcı bir dizin vermek için UPLOAD_DIR ortam değişkenini ayarlayın
// (örn. redeploy'da silinmeyen /var/www/gbt/uploads). Ayarlanmazsa public/uploads kullanılır.
export function uploadDir(): string {
  const custom = process.env.UPLOAD_DIR?.trim();
  if (custom) return custom;
  return path.join(process.cwd(), "public", "uploads");
}

// Bir görsel için tarayıcının kullanacağı genel URL. Next route handler üzerinden
// servis edilir; böylece nginx/statik yapılandırmasından bağımsız çalışır.
export function uploadUrl(fileName: string): string {
  return `/api/uploads/${fileName}`;
}
