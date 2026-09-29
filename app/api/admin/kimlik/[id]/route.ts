import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { getSessionEmail } from "@/lib/auth";
import { idDocumentPath, ID_DOC_CONTENT_TYPES } from "@/lib/id-documents";

export const dynamic = "force-dynamic";

// Yaş doğrulama belgesini YALNIZCA admin oturumuna servis eder. Yol yolcu
// id'si üzerinden kurulur; dosya adı dışarı sızmaz ve dizin public değildir.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const { id } = await params;
  const passenger = await prisma.passenger.findUnique({
    where: { id },
    select: { idDocument: true },
  });
  if (!passenger?.idDocument) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  const filePath = idDocumentPath(passenger.idDocument);
  if (!filePath) {
    return NextResponse.json({ error: "Geçersiz belge." }, { status: 400 });
  }
  const ext = (passenger.idDocument.split(".").pop() ?? "").toLowerCase();
  const type = ID_DOC_CONTENT_TYPES[ext];
  if (!type) {
    return NextResponse.json({ error: "Desteklenmeyen tür." }, { status: 400 });
  }

  try {
    const bytes = await readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        // Kişisel veri: ara sunucu/tarayıcı önbelleğine alınmamalı.
        "Cache-Control": "no-store, private",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Belge dosyası bulunamadı (silinmiş olabilir)." },
      { status: 404 }
    );
  }
}
