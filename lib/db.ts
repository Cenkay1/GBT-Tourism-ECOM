import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedClient | undefined;
};

// Çöp kutusu olan modeller: "silinen" kayıt gerçekten silinmez, deletedAt
// işaretlenir ve 25 gün sonra kalıcı silinir (bkz. lib/trash.ts).
const SOFT_DELETE_MODELS = ["Tour", "Banner", "Bus", "Amenity"] as const;

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  const base = new PrismaClient({ adapter });

  // Silinmiş kayıtları TÜM okumalardan düşen tek filtre.
  //
  // Neden uzantı: Tour/Banner/Bus/Amenity 36'dan fazla yerde sorgulanıyor.
  // Her çağrıya elle `deletedAt: null` eklemek, bir tanesini unutmanın silinen
  // turu müşteriye göstermesi anlamına gelirdi. Uzantı sorgu katmanında
  // çalıştığı için yeni yazılan kodlar da kendiliğinden korunur.
  //
  // Çöp kutusunun kendisi silinen kayıtları GÖRMEK zorunda; o yüzden
  // lib/trash.ts bu filtreyi atlayan ayrı bir istemci (rawPrisma) kullanır.
  return base.$extends({
    name: "soft-delete-filter",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SOFT_DELETE_MODELS.includes(model as "Tour")) {
            return query(args);
          }
          // Yalnız OKUMA işlemleri filtrelenir. Yazma işlemleri (update,
          // delete) çöp kutusu akışının kendisi tarafından yönetiliyor.
          const reads = [
            "findMany",
            "findFirst",
            "findFirstOrThrow",
            "count",
            "aggregate",
          ];
          if (!reads.includes(operation)) return query(args);

          const a = (args ?? {}) as { where?: Record<string, unknown> };
          return query({
            ...a,
            where: { ...(a.where ?? {}), deletedAt: null },
          });
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof createClient>;

export const prisma: ExtendedClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Çöp kutusu için filtresiz istemci — SİLİNMİŞ kayıtları da görür.
// Yalnız lib/trash.ts kullanmalı; başka yerde kullanılırsa silinen kayıtlar
// müşteriye görünür.
export function rawPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}
