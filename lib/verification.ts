// Tek kullanımlık token'lar — e-posta doğrulama ve şifre sıfırlama.
// Auth.js standardındaki VerificationToken tablosunu kullanır.
// identifier = "<purpose>:<email>" (örn. "verify:ali@x.com"), token = kripto rastgele.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/password";

export type TokenPurpose = "verify" | "reset";

const TTL: Record<TokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000, // 24 saat
  reset: 60 * 60 * 1000, // 1 saat
};

function identifierFor(purpose: TokenPurpose, email: string): string {
  return `${purpose}:${normalizeEmail(email)}`;
}

// Yeni token oluştur. Aynı amaç+e-posta için eski token'lar temizlenir (tek aktif token).
export async function createToken(purpose: TokenPurpose, email: string): Promise<string> {
  const identifier = identifierFor(purpose, email);
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TTL[purpose]);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({ data: { identifier, token, expires } });
  return token;
}

// Token'ı doğrula ve TÜKET (tek kullanım). Geçerliyse ilgili e-postayı döndürür.
export async function consumeToken(
  purpose: TokenPurpose,
  token: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: "Geçersiz bağlantı." };
  const row = await prisma.verificationToken.findUnique({ where: { token } });
  if (!row) return { ok: false, error: "Bağlantı geçersiz veya daha önce kullanılmış." };

  const prefix = `${purpose}:`;
  if (!row.identifier.startsWith(prefix)) {
    return { ok: false, error: "Bağlantı geçersiz." };
  }

  // Kullanıldı → sil (süresi dolmuş olsa bile temizle).
  await prisma.verificationToken.delete({ where: { token } }).catch(() => {});

  if (row.expires < new Date()) {
    return { ok: false, error: "Bağlantının süresi dolmuş. Lütfen yeniden isteyin." };
  }
  return { ok: true, email: row.identifier.slice(prefix.length) };
}

// Bir kullanıcının belirli amaçtaki tüm token'larını temizle (örn. şifre değişince reset'ler).
export async function clearTokens(purpose: TokenPurpose, email: string): Promise<void> {
  await prisma.verificationToken.deleteMany({ where: { identifier: identifierFor(purpose, email) } });
}
