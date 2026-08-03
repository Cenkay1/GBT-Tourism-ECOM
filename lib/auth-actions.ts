"use server";

// Müşteri kimlik doğrulama server action'ları — kayıt, giriş, çıkış, şifre
// sıfırlama/değiştirme, e-posta doğrulama, profil. useActionState ile uyumlu
// FormState döndürür ({ error?, fieldErrors?, ok?, message? }).
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { getCurrentUser, safeNext } from "@/lib/session";
import {
  hashPassword,
  verifyPassword,
  normalizeEmail,
  passwordIssue,
  isValidEmail,
} from "@/lib/password";
import { isValidPhone } from "@/lib/shared";
import { grantWelcome, linkGuestBookings } from "@/lib/loyalty";
import { createToken, consumeToken, clearTokens } from "@/lib/verification";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "@/lib/customer-notifications";
import { rateLimit } from "@/lib/rate-limit";
import type { FormState } from "@/lib/form-state";

function str(fd: FormData, k: string): string {
  return (fd.get(k) as string | null)?.trim() ?? "";
}

async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  return `${prefix}:${ip}`;
}

// --- Kayıt ---
export async function registerUser(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const name = str(fd, "name");
  const email = normalizeEmail(str(fd, "email"));
  const phone = str(fd, "phone");
  const password = str(fd, "password");
  const next = safeNext(str(fd, "next") || null);

  if (!(await rateLimit(await clientKey("register"), 5, 10 * 60 * 1000))) {
    return { error: "Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin." };
  }

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Ad soyad zorunlu.";
  if (!isValidEmail(email)) fieldErrors.email = "Geçerli bir e-posta girin.";
  if (phone && !isValidPhone(phone)) fieldErrors.phone = "Geçerli bir telefon girin.";
  const pwIssue = passwordIssue(password);
  if (pwIssue) fieldErrors.password = pwIssue;
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Yalnızca-Google hesabıysa yönlendirici ipucu ver.
    if (!existing.passwordHash) {
      return {
        fieldErrors: {
          email: "Bu e-posta Google ile kayıtlı. Google ile giriş yapın veya şifrenizi belirleyin.",
        },
      };
    }
    return { fieldErrors: { email: "Bu e-posta ile zaten bir hesap var. Giriş yapın." } };
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, phone: phone || null, passwordHash },
  });

  // Hoşgeldin puanı (Credentials kaydı adapter createUser event'ini tetiklemez).
  await grantWelcome(user.id).catch(() => {});
  // Aynı e-postalı geçmiş misafir rezervasyonları bağla (ödeme puanı doğrulamada da yazılır).
  await linkGuestBookings(user.id, email).catch(() => {});
  // E-posta doğrulama linki (best-effort).
  try {
    const token = await createToken("verify", email);
    await sendVerificationEmail(email, token);
  } catch (e) {
    console.error("[Doğrulama e-postası hatası]", e);
  }

  // Oturum aç ve yönlendir. signIn başarıda redirect fırlatır (yakalanmamalı).
  try {
    await signIn("credentials", { email, password, redirectTo: next });
  } catch (e) {
    if (e instanceof AuthError) {
      // Hesap oluşturuldu ama otomatik giriş başarısız → girişe yönlendir.
      redirect(`/giris?next=${encodeURIComponent(next)}`);
    }
    throw e;
  }
  return { ok: true };
}

// --- Giriş ---
export async function loginUser(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const email = normalizeEmail(str(fd, "email"));
  const password = str(fd, "password");
  const next = safeNext(str(fd, "next") || null);

  if (!(await rateLimit(await clientKey("login"), 10, 10 * 60 * 1000))) {
    return { error: "Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin." };
  }
  if (!email || !password) {
    return { error: "E-posta ve şifre zorunludur." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: next });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "E-posta veya şifre hatalı." };
    }
    throw e;
  }
  return { ok: true };
}

// --- Google ile giriş (form action) ---
export async function googleSignIn(fd: FormData) {
  const next = safeNext(str(fd, "next") || null);
  await signIn("google", { redirectTo: next });
}

// --- Çıkış ---
export async function logoutUser() {
  await signOut({ redirectTo: "/" });
}

// --- Şifremi unuttum (istek) ---
export async function requestPasswordReset(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const email = normalizeEmail(str(fd, "email"));

  if (!(await rateLimit(await clientKey("reset-req"), 5, 15 * 60 * 1000))) {
    return { error: "Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin." };
  }

  // Enumeration'ı önlemek için yanıt her zaman aynıdır.
  const generic: FormState = {
    ok: true,
    message: "Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.",
  };
  if (!isValidEmail(email)) return generic;

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    try {
      const token = await createToken("reset", email);
      await sendPasswordResetEmail(email, token);
    } catch (e) {
      console.error("[Sıfırlama e-postası hatası]", e);
    }
  }
  return generic;
}

// --- Şifre sıfırla (token ile) ---
export async function resetPassword(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const token = str(fd, "token");
  const password = str(fd, "password");

  const pwIssue = passwordIssue(password);
  if (pwIssue) return { fieldErrors: { password: pwIssue } };

  const res = await consumeToken("reset", token);
  if (!res.ok) return { error: res.error };

  const user = await prisma.user.findUnique({ where: { email: res.email } });
  if (!user) return { error: "Hesap bulunamadı." };

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      // Şifre belirlenince e-posta da doğrulanmış sayılır (linke erişim kanıtı).
      emailVerified: user.emailVerified ?? new Date(),
    },
  });
  await clearTokens("reset", res.email);

  redirect("/giris?sifirlandi=1");
}

// --- Doğrulama e-postasını tekrar gönder (oturum açık kullanıcı) ---
// Argümansız; useActionState imzasına (state, payload) atanabilir (fazla argümanlar yok sayılır).
export async function resendVerification(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Önce giriş yapın." };
  if (user.emailVerified) return { ok: true, message: "E-postanız zaten doğrulanmış." };

  if (!(await rateLimit(`resend:${user.id}`, 3, 15 * 60 * 1000))) {
    return { error: "Çok sık istek gönderdiniz. Lütfen biraz bekleyin." };
  }
  try {
    const token = await createToken("verify", user.email);
    await sendVerificationEmail(user.email, token);
  } catch (e) {
    console.error("[Doğrulama e-postası hatası]", e);
    return { error: "E-posta gönderilemedi. Lütfen tekrar deneyin." };
  }
  return { ok: true, message: "Doğrulama bağlantısı e-posta adresinize gönderildi." };
}

// --- E-posta doğrulamayı tamamla (token ile) — eposta-dogrula sayfasından çağrılır ---
export async function confirmEmailVerification(
  token: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await consumeToken("verify", token);
  if (!res.ok) return { ok: false, error: res.error };

  const user = await prisma.user.findUnique({ where: { email: res.email } });
  if (!user) return { ok: false, error: "Hesap bulunamadı." };

  if (!user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });
  }
  // Doğrulanınca geçmiş misafir rezervasyonları bağla + puanlarını yaz.
  await linkGuestBookings(user.id, user.email).catch(() => {});
  return { ok: true };
}

// --- Profil güncelle (ad, telefon) ---
export async function updateProfile(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Önce giriş yapın." };

  const name = str(fd, "name");
  const phone = str(fd, "phone");
  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Ad soyad zorunlu.";
  if (phone && !isValidPhone(phone)) fieldErrors.phone = "Geçerli bir telefon girin.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  await prisma.user.update({
    where: { id: user.id },
    data: { name, phone: phone || null },
  });
  revalidatePath("/hesabim/profil");
  return { ok: true, message: "Profiliniz güncellendi." };
}

// --- Şifre değiştir / belirle ---
export async function changePassword(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Önce giriş yapın." };

  const current = str(fd, "current");
  const password = str(fd, "password");

  const pwIssue = passwordIssue(password);
  if (pwIssue) return { fieldErrors: { password: pwIssue } };

  // Şifresi olan hesapta mevcut şifre doğrulanır; yalnızca-Google hesapta ise
  // (hasPassword=false) "şifre belirle" — mevcut şifre istenmez.
  if (user.hasPassword) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const ok = await verifyPassword(current, dbUser?.passwordHash);
    if (!ok) return { fieldErrors: { current: "Mevcut şifreniz hatalı." } };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await clearTokens("reset", user.email);
  return {
    ok: true,
    message: user.hasPassword ? "Şifreniz güncellendi." : "Şifreniz belirlendi.",
  };
}
