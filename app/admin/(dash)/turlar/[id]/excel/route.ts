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

const bandLabel: Record<string, string> = {
  ADULT: "Yetişkin",
  CHILD: "Çocuk",
  INFANT: "Bebek",
};

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("tr-TR") : "";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail();
  if (!email) {
    return new Response("Yetkisiz", { status: 401 });
  }

  const { id } = await params;
  const tour = await prisma.tour.findUnique({ where: { id }, include: { bus: true } });
  if (!tour) return new Response("Tur bulunamadı", { status: 404 });

  // ?sefer=<id> verilirse yalnız o seferin yolcu listesi; yoksa turun tümü.
  const departureId = new URL(req.url).searchParams.get("sefer");
  const departure = departureId
    ? await prisma.tourDeparture.findFirst({
        where: { id: departureId, tourId: id },
      })
    : null;
  if (departureId && !departure)
    return new Response("Sefer bulunamadı", { status: 404 });

  const bookings = await prisma.booking.findMany({
    where: {
      tourId: id,
      ...(departure ? { departureId: departure.id } : {}),
      OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }],
    },
    include: { passengers: true, departure: { include: { bus: true } } },
    orderBy: [{ departureId: "asc" }, { createdAt: "asc" }],
  });

  // Her yolcu bir satır.
  const rows: Record<string, string | number>[] = [];
  let sira = 1;
  for (const b of bookings) {
    for (const p of b.passengers) {
      rows.push({
        "Sıra": sira++,
        "Sefer": fmtDate(b.departure?.departureDate ?? tour.departureDate),
        "Araç": b.departure?.bus?.plate ?? tour.bus?.plate ?? "",
        "Biniş": b.boardingName ?? "",
        "Ad": p.firstName,
        "Soyad": p.lastName,
        "TC / Pasaport": p.idNumber ?? "",
        "Ülke": p.country ?? "",
        "Cinsiyet": genderLabel[p.gender ?? ""] ?? "",
        "Yaş Grubu": bandLabel[p.ageBand ?? ""] ?? "",
        "Yaş Onayı": p.ageBand === "ADULT" || !p.ageBand ? "" : p.ageVerified ? "Onaylı" : "Bekliyor",
        "Oda": p.roomIndex != null ? `${p.roomIndex + 1}. Oda` : "",
        "Doğum Tarihi": p.birthDate ? p.birthDate.toLocaleDateString("tr-TR") : "",
        "Koltuk": p.seatCode ?? "",
        "İletişim (Ad Soyad)": b.contactName,
        "Telefon": b.contactPhone,
        "E-posta": b.contactEmail,
        "Durum": statusLabel[b.status] ?? b.status,
        "Konaklama":
          b.accommodationType === "SINGLE"
            ? "Tek kişilik"
            : b.accommodationType === "MULTI"
            ? "Birden fazla"
            : "",
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
      "Sefer": "",
      "Araç": "",
      "Biniş": "",
      "Ad": "Kayıt yok",
      "Soyad": "",
      "TC / Pasaport": "",
      "Ülke": "",
      "Cinsiyet": "",
      "Yaş Grubu": "",
      "Yaş Onayı": "",
      "Oda": "",
      "Doğum Tarihi": "",
      "Koltuk": "",
      "İletişim (Ad Soyad)": "",
      "Telefon": "",
      "E-posta": "",
      "Durum": "",
      "Konaklama": "",
      "Tutar": "",
      "Para Birimi": "",
      "Rezervasyon No": "",
      "Tarih": "",
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  // Sütun genişlikleri (Sıra, Sefer, Araç, Biniş, Ad, Soyad, TC/Pasaport, Ülke,
  // Cinsiyet, Yaş Grubu, Yaş Onayı, Oda, Doğum T., Koltuk, İletişim, Telefon,
  // E-posta, Durum, Konaklama, Tutar, Para B., Rez.No, Tarih)
  ws["!cols"] = [
    { wch: 5 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 9 },
    { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 16 }, { wch: 26 }, { wch: 10 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 12 },
  ];
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
