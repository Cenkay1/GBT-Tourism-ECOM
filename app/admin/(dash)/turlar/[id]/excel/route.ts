import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getSessionEmail } from "@/lib/auth";

const statusLabel: Record<string, string> = {
  ODENDI: "Ödendi",
  BEKLIYOR: "Bekliyor",
  IPTAL: "İptal",
  SURE_DOLDU: "Süre Doldu",
};

const genderLabel: Record<string, string> = { E: "Erkek", K: "Kadın" };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail();
  if (!email) {
    return new Response("Yetkisiz", { status: 401 });
  }

  const { id } = await params;
  const tour = await prisma.tour.findUnique({ where: { id } });
  if (!tour) return new Response("Tur bulunamadı", { status: 404 });

  const bookings = await prisma.booking.findMany({
    where: { tourId: id, OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }] },
    include: { passengers: true },
    orderBy: { createdAt: "asc" },
  });

  // Her yolcu bir satır.
  const rows: Record<string, string | number>[] = [];
  let sira = 1;
  for (const b of bookings) {
    for (const p of b.passengers) {
      rows.push({
        "Sıra": sira++,
        "Ad": p.firstName,
        "Soyad": p.lastName,
        "TC / Pasaport": p.idNumber ?? "",
        "Cinsiyet": genderLabel[p.gender ?? ""] ?? "",
        "Koltuk": p.seatCode ?? "",
        "İletişim (Ad Soyad)": b.contactName,
        "Telefon": b.contactPhone,
        "E-posta": b.contactEmail,
        "Durum": statusLabel[b.status] ?? b.status,
        "Tutar": b.totalAmount,
        "Para Birimi": tour.currency,
        "Rezervasyon No": b.id.slice(-8).toUpperCase(),
        "Tarih": b.createdAt.toLocaleDateString("tr-TR"),
      });
    }
  }

  if (rows.length === 0) {
    rows.push({
      "Sıra": "",
      "Ad": "Kayıt yok",
      "Soyad": "",
      "TC / Pasaport": "",
      "Cinsiyet": "",
      "Koltuk": "",
      "İletişim (Ad Soyad)": "",
      "Telefon": "",
      "E-posta": "",
      "Durum": "",
      "Tutar": "",
      "Para Birimi": "",
      "Rezervasyon No": "",
      "Tarih": "",
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  // Sütun genişlikleri
  ws["!cols"] = [
    { wch: 5 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 8 },
    { wch: 20 }, { wch: 16 }, { wch: 26 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 16 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Yolcular");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const safeSlug = tour.slug.replace(/[^a-z0-9-]/gi, "");
  const filename = `${safeSlug}-yolcu-listesi.xlsx`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
