// Yedek liste sınırları — istemci bileşenleri de okuyor.
//
// Neden ayrı dosya: lib/waitlist.ts Prisma'ya bağlı (sunucu), lib/waitlist-actions.ts
// ise "use server" olduğu için yalnız async fonksiyon export edebilir. Sabitin
// tek kaynaktan gelmesi, formdaki üst sınırın sunucudaki doğrulamayla
// birbirinden kaymasını engelliyor.
export const WAITLIST_MAX_QUANTITY = 9;
