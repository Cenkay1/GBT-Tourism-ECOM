"use server";

// Sepet server action'ları ve sepet kimliği (çerez) yönetimi.
//
// İş mantığı lib/cart.ts'te; burada yalnız çerez okuma/yazma, önbellek
// tazeleme ve form dönüşleri var.
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  addSeatToCart,
  removeSeatFromCart,
  clearCart,
  getCart,
  type CartView,
} from "@/lib/cart";
import type { Gender } from "@/lib/shared";

const COOKIE = "gbt_sepet";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 1 gün

// Mevcut sepet anahtarı — YOKSA oluşturmaz (okuma yollarında kullanılır).
async function readCartToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

// Sepet anahtarı; yoksa üretip çereze yazar. Yalnız YAZMA işlemlerinde
// çağrılır — her sayfa görüntülemede çerez basmak gereksiz.
async function ensureCartToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;

  const token = randomBytes(24).toString("base64url");
  jar.set(COOKIE, token, {
    httpOnly: true, // JS okumasın: sepet anahtarı başkasının koltuğunu almaya yarar
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return token;
}

export type CartActionResult =
  | { ok: true; cart: CartView | null }
  | { ok: false; error: string; cart: CartView | null };

function revalidateCartTargets() {
  // Koltuk durumu değişti: tur sayfaları ve ana sayfa tazelenmeli.
  revalidatePath("/turlar", "layout");
  revalidatePath("/");
}

export async function addToCartAction(input: {
  tourId: string;
  departureId: string;
  seats: { code: string; gender: Gender }[];
}): Promise<CartActionResult> {
  const token = await ensureCartToken();

  // Koltuklar tek tek eklenir; biri reddedilirse sebebi döner ama ÖNCEKİLER
  // sepette kalır — müşteri 4 koltuktan 3'ünü almışsa hepsini kaybetmesin.
  for (const s of input.seats) {
    const res = await addSeatToCart(token, {
      tourId: input.tourId,
      departureId: input.departureId,
      code: s.code,
      gender: s.gender,
    });
    if (!res.ok) {
      revalidateCartTargets();
      return { ok: false, error: res.error, cart: await getCart(token) };
    }
  }

  revalidateCartTargets();
  return { ok: true, cart: await getCart(token) };
}

export async function removeFromCartAction(
  departureId: string,
  code: string
): Promise<CartActionResult> {
  const token = await readCartToken();
  if (!token) return { ok: false, error: "Sepet bulunamadı.", cart: null };

  const res = await removeSeatFromCart(token, departureId, code);
  revalidateCartTargets();
  const cart = await getCart(token);
  if (!res.ok) return { ok: false, error: res.error, cart };
  return { ok: true, cart };
}

export async function clearCartAction(): Promise<CartActionResult> {
  const token = await readCartToken();
  if (!token) return { ok: true, cart: null };
  await clearCart(token);
  revalidateCartTargets();
  return { ok: true, cart: null };
}

// Başlıktaki sepet paneli ve koltuk şeması bunu okuyor.
export async function getCartAction(): Promise<CartView | null> {
  const token = await readCartToken();
  if (!token) return null;
  return getCart(token);
}

// Sunucu bileşenleri için (layout/sayfa) — action değil, düz okuma.
export async function readCart(): Promise<CartView | null> {
  return getCartAction();
}

// Checkout akışı sepet anahtarını createPendingBooking'e geçirmek zorunda.
export async function currentCartToken(): Promise<string | null> {
  return readCartToken();
}
