import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import {
  idDocumentDir,
  ID_DOC_ALLOWED,
  ID_DOC_MAX_BYTES,
} from "@/lib/id-documents";

// Müşterinin çocuk/bebek yolcu için yüklediği kimlik belgesi (yaş doğrulama).
// Rezervasyon henüz oluşmadığı için oturum gerekmez; bu yüzden IP başına
// hız sınırı uygulanır ve dosya yalnızca tür/boyut doğrulamasından geçerse yazılır.
// Yazılan dosya public DEĞİL: yalnızca admin `/api/admin/kimlik/<yolcuId>`
// üzerinden görebilir.
export async function POST(req: Request) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "local";
  // 10 dakikada en fazla 20 yükleme.
  if (!rateLimit(`kimlik:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Çok fazla deneme yaptınız. Lütfen birkaç dakika sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
  }
  if (!ID_DOC_ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Sadece JPG, PNG veya WEBP yükleyebilirsiniz." },
      { status: 400 }
    );
  }
  if (file.size > ID_DOC_MAX_BYTES) {
    return NextResponse.json({ error: "Dosya boyutu 8 MB'ı aşamaz." }, { status: 400 });
  }

  const extByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  // Uzantı istemciden DEĞİL, doğrulanmış MIME türünden belirlenir.
  const name = `${randomUUID()}.${extByType[file.type]}`;

  try {
    const dir = idDocumentDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error("[Kimlik belgesi yazma hatası]", e);
    return NextResponse.json({ error: "Belge kaydedilemedi." }, { status: 500 });
  }

  // Dosya adı forma yazılır; belge yalnızca admin tarafından görüntülenebilir.
  return NextResponse.json({ name });
}
