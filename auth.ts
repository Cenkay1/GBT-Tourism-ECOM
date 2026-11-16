// Auth.js (NextAuth v5) yapılandırması — müşteri kimlik doğrulama.
// Sağlayıcılar: Google (OAuth) + Credentials (e-posta/şifre).
// Not: Credentials sağlayıcısı Auth.js'te JWT oturum stratejisini zorunlu kılar.
// Admin girişi (lib/auth.ts) bundan tamamen bağımsızdır.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { verifyPassword, normalizeEmail } from "@/lib/password";
import { grantWelcome, linkGuestBookings } from "@/lib/loyalty";
import { sendWelcomeEmail } from "@/lib/customer-notifications";

// Google anahtarları tanımlı mı? UI (giriş butonu) buna göre gösterilir.
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

const providers = [];

if (isGoogleConfigured()) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Aynı e-postalı Credentials hesabına otomatik bağla — Google e-postayı
      // doğruladığı için güvenli (OAuthAccountNotLinked hatasını önler).
      allowDangerousEmailAccountLinking: true,
    })
  );
}

providers.push(
  Credentials({
    credentials: {
      email: { label: "E-posta", type: "email" },
      password: { label: "Şifre", type: "password" },
    },
    async authorize(credentials) {
      const email = normalizeEmail(String(credentials?.email ?? ""));
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      // Kullanıcı yoksa, yalnızca-Google hesabıysa (passwordHash yok) ya da
      // üyelik PASİFE alınmışsa → null. Tek tip başarısızlık: enumeration'ı
      // önlemek için ayrım yapılmaz (pasif üye de "hatalı bilgi" görür).
      if (!user || !user.passwordHash || !user.active) return null;
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 }, // 7 gün
  trustHost: true,
  pages: {
    signIn: "/giris",
    error: "/giris",
  },
  providers,
  callbacks: {
    // Pasife alınmış üye hiçbir sağlayıcıyla giriş yapamaz. Credentials'ta
    // authorize zaten engelliyor; bu kontrol GOOGLE akışını da kapatıyor —
    // orada kullanıcı adapter üzerinden geldiği için authorize hiç çalışmaz.
    async signIn({ user }) {
      const email = user?.email ? normalizeEmail(user.email) : null;
      if (!email) return true;
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { active: true },
      });
      if (existing && !existing.active) return false;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
  events: {
    // Adapter ile kullanıcı oluşturulduğunda (yani Google ile ilk giriş) tetiklenir.
    // Credentials kaydında kullanıcıyı biz elle oluşturduğumuz için burada tetiklenmez;
    // hoşgeldin puanı o akışta ayrıca verilir (lib/auth-actions.ts).
    async createUser({ user }) {
      if (!user.id) return;
      // Google e-postaları doğrulanmıştır → emailVerified'i garanti altına al (idempotent).
      if (user.email) {
        await prisma.user
          .update({ where: { id: user.id }, data: { emailVerified: new Date() } })
          .catch(() => {});
      }
      await grantWelcome(user.id).catch(() => {});
      if (user.email) {
        await linkGuestBookings(user.id, user.email).catch(() => {});
        await sendWelcomeEmail(user.email, user.name ?? "Değerli üyemiz").catch(() => {});
      }
    },
  },
});
