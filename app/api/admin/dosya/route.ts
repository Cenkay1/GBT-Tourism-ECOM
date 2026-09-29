import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSessionEmail } from "@/lib/auth";
import { uploadDir, uploadUrl } from "@/lib/uploads";

// Tur programı belgeleri (PDF / Word). Görsellerden ayrı bir uç nokta: farklı
// tür ve boyut sınırları geçerli. Belgeler herkese açıktır (müşteri tur
// sayfasından indirir) — kişisel veri içeren belgeler buraya YÜKLENMEMELİ.
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

// Bazı tarayıcılar/işletim sistemleri Word için boş veya genel tür gönderir;
// bu durumda uzantıya bakılır.
const ALLOWED_EXT = ["pdf", "doc", "docx"];

export async function POST(req: Request) {
  const email = await getSessionEmail();
  if (!email) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
  }

  const rawExt = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = ALLOWED[file.type] ?? (ALLOWED_EXT.includes(rawExt) ? rawExt : null);
  if (!ext) {
    return NextResponse.json(
      { error: "Sadece PDF veya Word (.doc, .docx) yükleyebilirsiniz." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Dosya boyutu 20 MB'ı aşamaz." }, { status: 400 });
  }

  const stored = `${randomUUID()}.${ext}`;
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, stored), Buffer.from(await file.arrayBuffer()));

  // Görünen ad müşteriye gösterilir; depolanan ad çakışmaz.
  return NextResponse.json({
    url: uploadUrl(stored),
    name: file.name,
    size: file.size,
  });
}
