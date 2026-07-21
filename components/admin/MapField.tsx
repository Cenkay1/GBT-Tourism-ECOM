"use client";

import { useState } from "react";
import { mapEmbedUrl } from "@/lib/shared";
import PlaceAutocomplete from "@/components/admin/PlaceAutocomplete";

// Konum yazılınca Google önerileri açılır; seçilen yer haritada önizlenir.
export default function MapField({
  name,
  defaultValue,
  label,
  placeholder,
  required,
}: {
  name: string;
  defaultValue?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);

  return (
    <div>
      <span className="block text-sm font-medium text-slate-600">{label}</span>
      {/* Form gönderimi için gerçek değer */}
      <input type="hidden" name={name} value={value} required={required} />
      <div className="mt-1 flex gap-2">
        <PlaceAutocomplete
          value={value}
          onTextChange={setValue}
          onSelect={(sel) => setValue(sel.name)}
          placeholder={placeholder ?? "Konum yazın — örn. Dudullu Terminal"}
          className="flex-1"
          inputClassName="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!value.trim()}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-brand transition hover:bg-slate-50 disabled:opacity-40"
        >
          {open ? "Gizle" : "Haritada Gör"}
        </button>
      </div>
      {open && value.trim() && (
        <div className="mt-2 overflow-hidden rounded-xl ring-1 ring-black/5">
          <iframe
            key={value}
            title={value}
            src={mapEmbedUrl(value)}
            className="h-56 w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}
    </div>
  );
}
