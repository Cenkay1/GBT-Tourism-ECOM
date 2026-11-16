// Başlıktaki sepet rozetinin sunucu sarmalayıcısı.
//
// Sepet anahtarı httpOnly çerezde olduğu için istemci onu okuyamaz; sepeti
// burada (sunucuda) okuyup istemci bileşenine veri olarak geçiyoruz.
import { readCart } from "@/lib/cart-actions";
import CartBadge from "@/components/CartBadge";

export default async function HeaderCart() {
  const cart = await readCart();
  if (!cart) return null;
  return <CartBadge initialCart={cart} />;
}
