"use client";

import { useRef, useState } from "react";
import type { TourDocument } from "@/lib/shared";

function sizeLabel(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Tur programı belgeleri (PDF / Word). Açıklamanın yanında, müşterinin
// indirebileceği dosyalar olarak tur sayfasında görünür.
export default function DocumentsUpload({
  name,
  value,
  onChange,
}: {
  name: string;
  value: TourDocument[];
  onChange: (docs: TourDocument[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: FileList) {
    setBusy(true);
    setError("");
    const added: TourDocument[] = [];
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/dosya", { method: "POST", body: fd });
        const data = (await res.json()) as {
          url?: string;
          name?: string;
          size?: number;
          error?: string;
        };
        if (!res.ok || !data.url) {
          setError(data.error ?? `${file.name} yüklenemedi.`);
          continue;
        }
        added.push({ name: data.name ?? file.name, url: data.url, size: data.size });
      } catch {
        setError(`${file.name} yüklenemedi.`);
      }
    }
    if (added.length) onChange([...value, ...added]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
        }}
        className="hidden"
      />

      {value.length > 0 && (
        <ul className="mb-3 space-y-2">
          {value.map((d, i) => (
            <li
              key={`${d.url}-${i}`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"
            >
              <span className="text-lg leading-none">
                {d.url.toLowerCase().endsWith(".pdf") ? "📄" : "📝"}
              </span>
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-medium text-brand hover:underline"
              >
                {d.name}
              </a>
              {d.size != null && (
                <span className="shrink-0 text-xs text-slate-400">{sizeLabel(d.size)}</span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Kaldır
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-brand transition enabled:hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? "Yükleniyor…" : "+ PDF / Word Ekle"}
      </button>
      <p className="mt-1.5 text-xs text-slate-400">
        Tur programı, gezi planı gibi belgeler. Müşteri tur sayfasından indirir. En çok 20 MB.
        Kişisel veri içeren belge yüklemeyin.
      </p>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
