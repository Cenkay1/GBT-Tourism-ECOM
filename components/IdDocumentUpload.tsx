"use client";

import { useRef, useState } from "react";

// Çocuk/bebek yolcu için kimlik belgesi yükleme alanı (yaş doğrulama).
// Dosya /api/kimlik'e gönderilir, dönen dosya adı forma yazılır. Belge
// yüklenmezse o yolcu tam ücret öder — bu uyarı kullanıcıya gösterilir.
export default function IdDocumentUpload({
  value,
  onChange,
  bandLabel,
  error,
}: {
  value: string; // yüklenen dosya adı ("" = yok)
  onChange: (name: string) => void;
  bandLabel: string; // "Çocuk" | "Bebek"
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [fileLabel, setFileLabel] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setLocalError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/kimlik", { method: "POST", body: fd });
      const data = (await res.json()) as { name?: string; error?: string };
      if (!res.ok || !data.name) {
        setLocalError(data.error ?? "Belge yüklenemedi.");
        return;
      }
      onChange(data.name);
      setFileLabel(file.name);
    } catch {
      setLocalError("Belge yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    onChange("");
    setFileLabel("");
    setLocalError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const shownError = error || localError;

  return (
    <div
      data-error={shownError ? "1" : undefined}
      className={`mt-3 rounded-xl border p-3 ${
        shownError
          ? "border-red-300 bg-red-50"
          : value
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <p className="text-xs font-semibold text-slate-700">
        {bandLabel} yaşı için kimlik belgesi <span className="text-red-500">*</span>
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Nüfus cüzdanı / kimlik kartı fotoğrafı (JPG, PNG veya WEBP; en çok 8 MB).
        Belge yüklenmezse bu yolcu için <strong>tam ücret</strong> uygulanır.
        Belgeniz yalnızca yaş kontrolü için acentemize iletilir.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
        className="hidden"
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {value ? (
          <>
            <span className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              ✓ Belge yüklendi
              {fileLabel && (
                <span className="max-w-[160px] truncate font-normal text-slate-400">
                  {fileLabel}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={clear}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-white"
            >
              Kaldır
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-brand px-4 py-2 text-xs font-bold text-white transition enabled:hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "Yükleniyor…" : "Kimlik Fotoğrafı Seç"}
          </button>
        )}
      </div>

      {shownError && <p className="mt-2 text-xs font-medium text-red-700">{shownError}</p>}
    </div>
  );
}
