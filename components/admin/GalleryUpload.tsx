"use client";

import { useRef, useState } from "react";

export default function GalleryUpload({
  name,
  defaultValue,
  label = "Galeri Görselleri",
  hint,
}: {
  name: string;
  defaultValue?: string;
  label?: string;
  hint?: string;
}) {
  const [urls, setUrls] = useState<string[]>(
    (defaultValue ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList) {
    setBusy(true);
    setError("");
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Yükleme başarısız.");
        uploaded.push(data.url);
      }
      setUrls((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme başarısız.");
    } finally {
      setBusy(false);
    }
  }

  function addLink() {
    const v = linkRef.current?.value.trim();
    if (v) {
      setUrls((prev) => [...prev, v]);
      if (linkRef.current) linkRef.current.value = "";
    }
  }

  function removeAt(i: number) {
    setUrls((prev) => prev.filter((_, idx) => idx !== i));
  }

  function reorder(from: number, to: number) {
    setUrls((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <div>
      <span className="block text-sm font-medium text-slate-600">{label}</span>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <input type="hidden" name={name} value={urls.join("\n")} />

      {urls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {urls.map((url, i) => (
            <div
              key={`${url}-${i}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i);
                setDragIndex(null);
              }}
              className="group relative h-40 w-32 shrink-0 cursor-move overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Görsel ${i + 1}`} className="h-full w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-red-600 opacity-0 transition group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Yükleniyor…" : "Görsel Seç (çoklu)"}
        </button>
        <input
          ref={linkRef}
          placeholder="veya görsel bağlantısı (URL)"
          className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 outline-none focus:border-brand"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLink();
            }
          }}
        />
        <button
          type="button"
          onClick={addLink}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Ekle
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Sürükleyip bırakarak sıralayın. Görseller tur sayfasında bu sırayla afiş boyutunda gösterilir.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
