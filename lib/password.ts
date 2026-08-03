// Şifre saklama — node:crypto scrypt + rastgele salt + timingSafeEqual.
// Format: "scrypt$<saltHex>$<hashHex>". Yeni bağımlılık gerektirmez.
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const hash = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, hash.length)) as Buffer;
  if (derived.length !== hash.length) return false;
  return timingSafeEqual(derived, hash);
}

// Şifre kuralı: en az 8 karakter, en az bir harf ve bir rakam.
// Sorun varsa mesajı döndürür, yoksa null.
export function passwordIssue(password: string): string | null {
  if (password.length < 8) return "Şifre en az 8 karakter olmalı.";
  if (!/[a-zA-Z]/.test(password)) return "Şifre en az bir harf içermeli.";
  if (!/[0-9]/.test(password)) return "Şifre en az bir rakam içermeli.";
  return null;
}

// Basit e-posta doğrulama (CheckoutForm ile aynı desen).
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
