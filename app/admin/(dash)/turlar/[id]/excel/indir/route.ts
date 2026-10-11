import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getSessionEmail } from "@/lib/auth";
import { buildRow, resolveColumns, type ExcelRowSource } from "@/lib/excel-columns";

// Yolcu listesini Excel olarak indirir.
//
// Sorgu parametreleri:
//   ?sefer=<id>      yalnız o seferin yolcuları (yoksa turun tüm seferleri)
//   ?kolonlar=a,b,c  çıkacak sütunlar ve SIRASI (yoksa varsayılan küme)
//   ?durum=odenen    yalnız ödenmiş rezervasyonlar (yoksa ödenmiş + bekleyen)
//
// Sütun tanımları lib/excel-columns.ts içinde; buraya sütun mantığı yazılmaz.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail();
  if (!email) return new Response("Yetkisiz", { status: 401 });

  const { id } = await params;
  const tour = await prisma.tour.findUnique({ where: { id }, include: { bus: true } });
  if (!tour) return new Response("Tur bulunamadı", { status: 404 });

  const url = new URL(req.url);
  const departureId = url.searchParams.get("sefer");
  const departure = departureId
    ? await prisma.tourDeparture.findFirst({ where: { id: departureId, tourId: id } })
    : null;
  if (departureId && !departure) return new Response("Sefer bulunamadı", { status: 404 });

  // Sütunlar: bilinmeyen anahtarlar resolveColumns içinde ayıklanır.
  const columns = resolveColumns(
    (url.searchParams.get("kolonlar") ?? "").split(",").map((k) => k.trim()).filter(Boolean)
  );

  const sadeceOdenen = url.searchParams.get("durum") === "odenen";

  const bookings = await prisma.booking.findMany({
    where: {
      tourId: id,
      ...(departure ? { departureId: departure.id } : {}),
      ...(sadeceOdenen
        ? { status: "ODENDI" }
        : { OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }] }),
    },
    include: { passengers: true, departure: { include: { bus: true } } },
    orderBy: [{ departureId: "asc" }, { createdAt: "asc" }],
  });

  // Her yolcu bir satır.
  const rows: Record<string, string | number>[] = [];
  let index = 1;
  for (const b of bookings) {
    for (const p of b.passengers) {
      const source: ExcelRowSource = {
        passenger: p,
        booking: b,
        departureDate: b.departure?.departureDate ?? tour.departureDate,
        plate: b.departure?.bus?.plate ?? tour.bus?.plate ?? "",
        currency: tour.currency,
        index: index++,
      };
      rows.push(buildRow(columns, source));
    }
  }

  // Kayıt yoksa bile başlık satırı çıksın: boş dosya indiren görevli neyin
  // eksik olduğunu anlayamaz, başlıklı boş tablo ise açıkça "kayıt yok" der.
  if (rows.length === 0) {
    const bos: Record<string, string | number> = {};
    for (const c of columns) bos[c.label] = "";
    const ilk = columns[0];
    if (ilk) bos[ilk.label] = "Kayıt yok";
    rows.push(bos);
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = columns.map((c) => ({ wch: c.width }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Yolcular");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const safeSlug = tour.slug.replace(/[^a-z0-9-]/gi, "");
  const depSuffix = departure
    ? `-${departure.departureDate.toISOString().slice(0, 10)}`
    : "";
  const filename = `${safeSlug}${depSuffix}-yolcu-listesi.xlsx`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
