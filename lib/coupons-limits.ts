// Kupon sabitleri — istemci bileşenleri de okuyor.
//
// Neden ayrı dosya: lib/coupons.ts Prisma'ya bağlı (sunucu), lib/coupon-actions.ts
// ise "use server" olduğu için yalnız async fonksiyon export edebilir. Kurun
// tek kaynaktan gelmesi, ekranda yazan karşılık ile sunucudaki hesabın
// birbirinden kaymasını engelliyor.
export const POINTS_PER_LIRA = 100;
export const MIN_REDEEM_POINTS = POINTS_PER_LIRA;
