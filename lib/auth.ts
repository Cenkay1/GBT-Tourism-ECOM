import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

const COOKIE = "gb_admin";
const SECRET =
  process.env.ADMIN_SESSION_SECRET ?? "gozdem-burak-dev-secret-change-me";

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function sign(value: string) {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

function makeToken(email: string) {
  const payload = Buffer.from(email).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

async function startSession(email: string) {
  const store = await cookies();
  store.set(COOKIE, makeToken(email), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 gün
  });
}

export async function login(email: string, password: string): Promise<boolean> {
  // 1) .env tabanlı admin — seed'e gerek kalmadan giriş (canlıda pratik).
  const envEmail = process.env.ADMIN_EMAIL;
  const envPassword = process.env.ADMIN_PASSWORD;
  if (envEmail && envPassword && email === envEmail && password === envPassword) {
    await startSession(email);
    return true;
  }

  // 2) Veritabanındaki admin kullanıcıları (mevcut davranış).
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) return false;
  if (user.passwordHash !== sha256(password)) return false;

  await startSession(email);
  return true;
}

export async function logout() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSessionEmail(): Promise<string | null> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE)?.value);
}
