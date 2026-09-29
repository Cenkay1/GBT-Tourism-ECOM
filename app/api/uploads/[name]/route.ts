import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  // Tur programı belgeleri (admin panelden yüklenir, müşteri indirir).
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Yüklenen görsel ve belgeleri Next üzerinden servis eder — böylece nginx/statik
// yapılandırmasından bağımsız olarak (canlıda da) çalışır.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Güvenlik: yalnızca düz dosya adı; klasör geçişi / gizli yol yok.
  const safe = path.basename(name);
  if (!safe || safe !== name || safe.startsWith(".")) {
    return NextResponse.json({ error: "Geçersiz dosya." }, { status: 400 });
  }

  const ext = (safe.split(".").pop() ?? "").toLowerCase();
  const type = CONTENT_TYPES[ext];
  if (!type) {
    return NextResponse.json({ error: "Desteklenmeyen tür." }, { status: 400 });
  }

  try {
    const bytes = await readFile(path.join(uploadDir(), safe));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
  }
}
