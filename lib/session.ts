// Müşteri oturumu için ince sarmalayıcı — Auth.js auth() üzerine kurulu DAL.
// getCurrentUser() güncel User'ı (puan/kademe dahil) DB'den getirir ve React cache
// ile aynı render süresince tek sorguya indirir. UI ve server action'lar bunu kullanır.
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  emailVerified: Date | null;
  points: number;
  lifetimePoints: number;
  tier: string;
  hasPassword: boolean; // yalnızca-Google hesaplar için false
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    image: user.image,
    emailVerified: user.emailVerified,
    points: user.points,
    lifetimePoints: user.lifetimePoints,
    tier: user.tier,
    hasPassword: Boolean(user.passwordHash),
  };
});

// Korumalı sayfa/aksiyonlar için — oturum yoksa girişe yönlendir.
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(next ? `/giris?next=${encodeURIComponent(next)}` : "/giris");
  }
  return user;
}

// Açık yönlendirme (open redirect) koruması — yalnızca yerel path'lere izin ver.
export function safeNext(next: string | undefined | null): string {
  if (!next) return "/hesabim";
  if (!next.startsWith("/") || next.startsWith("//")) return "/hesabim";
  return next;
}
