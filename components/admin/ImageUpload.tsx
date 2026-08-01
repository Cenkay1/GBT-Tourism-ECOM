"use client";

import { useRef, useState } from "react";

export default function ImageUpload({
  name,
  defaultValue,
  label = "Görsel",
  hint,
}: {
  name: string;
  defaultValue?: string;
  label?: string;
  hint?: string;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Yükleme başarısız.");
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme başarısız.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="block text-sm font-medium text-slate-600">{label}</span>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}

      <input type="hidden" name={name} value={url} />

      <div className="mt-2 flex items-start gap-4">
        {/* Önizleme */}
        <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Önizleme" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-slate-400">Önizleme</span>
          )}
        </div>

        <div className="flex-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Yükleniyor…" : url ? "Görseli Değiştir" : "Görsel Seç"}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="ml-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Kaldır
            </button>
          )}

          <div className="mt-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="veya görsel bağlantısı (URL) yapıştırın"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 outline-none focus:border-brand"
            />
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
