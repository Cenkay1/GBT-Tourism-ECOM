// Rota durakları artık "Gezilecek Yerler": TourPlace.type DURAK → GEZI.
// Ayrıca Tour.placesToVisit serbest metni satır satır GEZI kaydına taşınır
// (haritasız; admin panelden konum seçilerek zenginleştirilebilir).
// Birden çok kez çalıştırılabilir (idempotent).
import { prisma } from "../lib/db";

async function main() {
  const renamed = await prisma.tourPlace.updateMany({
    where: { type: "DURAK" },
    data: { type: "GEZI" },
  });
  console.log(`DURAK → GEZI: ${renamed.count} kayıt`);

  // placesToVisit kolonu bu sürümde şemadan kaldırıldı; henüz düşürülmemiş
  // veritabanlarında içeriği kurtarmak için ham SQL ile okunur.
  let tours: { id: string; title: string; placesToVisit: string }[] = [];
  try {
    tours = await prisma.$queryRawUnsafe<
      { id: string; title: string; placesToVisit: string }[]
    >(`SELECT id, title, placesToVisit FROM Tour WHERE placesToVisit <> ''`);
  } catch {
    console.log("placesToVisit kolonu yok — taşınacak serbest metin bulunmuyor.");
    tours = [];
  }

  let created = 0;
  for (const t of tours) {
    const lines = (t.placesToVisit ?? "")
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const existing = await prisma.tourPlace.findMany({
      where: { tourId: t.id },
      select: { name: true, sortOrder: true, type: true },
    });
    const have = new Set(
      existing.filter((p) => p.type === "GEZI").map((p) => p.name.toLocaleLowerCase("tr"))
    );
    let order = existing.reduce((m, p) => Math.max(m, p.sortOrder), -1) + 1;

    for (const line of lines) {
      if (have.has(line.toLocaleLowerCase("tr"))) continue;
      await prisma.tourPlace.create({
        data: { tourId: t.id, type: "GEZI", name: line, sortOrder: order++ },
      });
      created++;
    }
    // Taşındı → metni temizle (tekrar çalıştırmada kopya oluşmasın).
    await prisma
      .$executeRawUnsafe(`UPDATE Tour SET placesToVisit = '' WHERE id = ?`, t.id)
      .catch(() => {
        // Kolon düşürülmüşse temizlemeye gerek yok.
      });
    console.log(`  ${t.title}: ${lines.length} satır taşındı`);
  }
  console.log(`Serbest metinden oluşturulan GEZI kaydı: ${created}`);

  const counts = await prisma.tourPlace.groupBy({ by: ["type"], _count: true });
  console.log("Tip dağılımı:", JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
