This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

> **Not (bu makinede):** Yerel SWC native binary bozuk olduğu için Turbopack
> çalışmıyor. Geliştirme sunucusunu `npx next dev --webpack` ile başlatın.

## Müşteri Girişi + Sadakat (Auth.js)

Müşteri kimlik doğrulama **Auth.js (NextAuth v5)** + **Prisma adapter** ile eklendi.
Admin girişi (`lib/auth.ts` / `AdminUser`) bundan bağımsızdır ve değişmemiştir.

**Kurulum:**

```bash
npm install                       # next-auth@beta + @auth/prisma-adapter dahil
npx auth secret                   # AUTH_SECRET üretir (.env'e ekleyin)
npx prisma migrate dev            # User/Account/Session/VerificationToken/PointsLedger
npx tsx prisma/seed.ts            # demo veri (opsiyonel)
```

`.env` için `.env.example` dosyasını kopyalayın. Sağlayıcılar:

- **E-posta/şifre:** `scrypt` ile hash'lenir; Auth.js Credentials sağlayıcısı JWT
  oturum kullanır (şifreli, httpOnly cookie + CSRF).
- **Google:** `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` tanımlıysa aktif olur.
  Google Console'da **Authorized redirect URI** olarak tam şu adres eklenmeli:
  `http://localhost:3000/api/auth/callback/google` (canlıda `https://…` karşılığı).
  Anahtar yoksa "Google ile devam et" butonu otomatik gizlenir.
- **Misafir:** giriş yapmadan rezervasyon akışı eskisi gibi çalışır.

**Sadakat:** 1 ₺ = 1 puan + kayıtta 500 hoşgeldin puanı. Kademeler ömür boyu puana
göre (ortalama ~20.000 ₺ tur fiyatına göre ayarlı): Bronz 0 · Gümüş 20.000 · Altın
60.000 · Platin 150.000. Puanlar ödeme işaretlendiğinde (online veya nakit)
idempotent olarak yazılır. Eşikler `lib/loyalty.ts` içindeki `TIERS`/`EARN_RATE`/
`WELCOME_POINTS` sabitlerinden ayarlanır. Ekranlar `/hesabim` altında; giriş/kayıt
`/giris` ve `/kayit`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
