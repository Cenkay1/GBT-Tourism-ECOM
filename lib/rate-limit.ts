// Basit, süreç-içi (in-memory) hız sınırlayıcı — best-effort brute-force koruması.
// Tek sunucu/örnek için yeterlidir; dağıtık kurulumda Redis vb. gerekir.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// key başına `limit` isteği `windowMs` içinde. Aşılırsa false döner.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}
