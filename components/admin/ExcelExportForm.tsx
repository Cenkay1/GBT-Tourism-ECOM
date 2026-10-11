"use client";

import { useActionState, useMemo, useState } from "react";
import { saveExcelTemplate } from "@/lib/excel-template-actions";
import type { FormState } from "@/lib/form-state";

export interface ExportDeparture {
  id: string;
  label: string; // "12 Ağustos 2026 20:00 · 34 ABC 123"
  passengerCount: number;
  isPast: boolean;
}

export interface ExportTemplate {
  id: string;
  name: string;
  columns: string[];
}

export interface ExportColumn {
  key: string;
  label: string;
  group: string;
}

// Excel dışa aktarma ekranı: sefer seç, sütunları seç, şablon kaydet/uygula.
//
// Sütunların SIRASI seçim sırasıdır — kullanıcı "önce ad soyad, sonra TC"
// istediğinde Excel'de o sırayla çıkar. Bu yüzden seçim bir dizi olarak tutulur.
export default function ExcelExportForm({
  tourId,
  departures,
  columns,
  templates,
  defaultKeys,
  hotelKeys,
}: {
  tourId: string;
  departures: ExportDeparture[];
  columns: ExportColumn[];
  templates: ExportTemplate[];
  defaultKeys: string[];
  hotelKeys: string[];
}) {
  const [departureId, setDepartureId] = useState<string>(
    departures.find((d) => !d.isPast)?.id ?? departures[0]?.id ?? ""
  );
  const [selected, setSelected] = useState<string[]>(defaultKeys);
  const [onlyPaid, setOnlyPaid] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saveState, saveAction, saving] = useActionState<FormState, FormData>(
    saveExcelTemplate,
    {}
  );

  const byGroup = useMemo(() => {
    const m = new Map<string, ExportColumn[]>();
    for (const c of columns) {
      const list = m.get(c.group) ?? [];
      list.push(c);
      m.set(c.group, list);
    }
    return [...m.entries()];
  }, [columns]);

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  const label = (k: string) => columns.find((c) => c.key === k)?.label ?? k;

  const downloadHref =
    `/admin/turlar/${tourId}/excel/indir` +
    `?kolonlar=${encodeURIComponent(selected.join(","))}` +
    (departureId ? `&sefer=${encodeURIComponent(departureId)}` : "") +
    (onlyPaid ? "&durum=odenen" : "");

  const selectedDeparture = departures.find((d) => d.id === departureId);
  const card = "rounded-2xl bg-white p-6 shadow-sm";

  return (
    <div className="space-y-6">
      {/* 1 — Sefer */}
      <div className={card}>
        <h2 className="mb-1 font-bold text-brand">1. Sefer</h2>
        <p className="mb-4 text-xs text-slate-400">
          Liste hangi sefer için alınacak? Koltuklar ve yolcular sefere bağlıdır.
        </p>
        {departures.length === 0 ? (
          <p className="text-sm text-slate-400">Bu turun seferi yok.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {departures.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDepartureId(d.id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  d.id === departureId
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {d.label}
                <span className={d.id === departureId ? "text-white/70" : "text-slate-400"}>
                  {" "}
                  · {d.passengerCount} yolcu
                </span>
                {d.isPast && " · arşiv"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDepartureId("")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                departureId === ""
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Tüm seferler
            </button>
          </div>
        )}
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyPaid}
            onChange={(e) => setOnlyPaid(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Yalnız ödemesi tamamlananlar (bekleyenleri alma)
        </label>
      </div>

      {/* 2 — Şablonlar */}
      <div className={card}>
        <h2 className="mb-1 font-bold text-brand">2. Şablon</h2>
        <p className="mb-4 text-xs text-slate-400">
          Kayıtlı bir sütun düzenini seçin ya da aşağıda kendi seçiminizi yapıp
          adlandırarak kaydedin.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelected(defaultKeys)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Varsayılan liste
          </button>
          <button
            type="button"
            onClick={() => setSelected(hotelKeys)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Otel listesi (hazır)
          </button>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.columns)}
              className="rounded-lg bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/20"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* 3 — Sütunlar */}
      <div className={card}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-brand">3. Sütunlar</h2>
          <span className="text-xs font-semibold text-slate-500">
            {selected.length} sütun seçili
          </span>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          İşaretlediğiniz sütunlar Excel&apos;e çıkar. Sıralama, işaretleme sıranızdır.
        </p>

        {selected.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 p-2.5">
            {selected.map((k, i) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm"
              >
                <span className="text-slate-400">{i + 1}.</span>
                {label(k)}
                <button
                  type="button"
                  onClick={() => toggle(k)}
                  aria-label={`${label(k)} sütununu çıkar`}
                  className="ml-0.5 text-slate-400 hover:text-red-600"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSelected([])}
              className="ml-auto text-[11px] font-semibold text-slate-400 hover:text-red-600"
            >
              Hepsini temizle
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {byGroup.map(([group, cols]) => (
            <div key={group}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                {group}
              </h3>
              <div className="space-y-1.5">
                {cols.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 text-sm text-slate-600"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(c.key)}
                      onChange={() => toggle(c.key)}
                      className="h-4 w-4 accent-accent"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4 — Kaydet + indir */}
      <div className={card}>
        <h2 className="mb-1 font-bold text-brand">4. Kaydet ve indir</h2>
        <p className="mb-4 text-xs text-slate-400">
          Bu sütun düzenini sonraki seferler için saklayabilirsiniz. Aynı adı
          kullanırsanız mevcut şablon güncellenir.
        </p>

        {saveState.message && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {saveState.message}
          </p>
        )}
        {saveState.error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            {saveState.error}
          </p>
        )}

        <form action={saveAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="columns" value={selected.join(",")} />
          <label className="text-xs font-medium text-slate-500">
            Şablon adı
            <input
              name="name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Örn. Otel listesi"
              maxLength={40}
              className="mt-1 block w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <button
            disabled={saving || !templateName.trim() || selected.length === 0}
            className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Kaydediliyor…" : "Şablon olarak kaydet"}
          </button>
        </form>

        <div className="mt-5 border-t border-slate-100 pt-5">
          {selected.length === 0 ? (
            <p className="text-sm text-amber-700">
              İndirmeden önce en az bir sütun seçin.
            </p>
          ) : (
            <a
              href={downloadHref}
              className="inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-white hover:bg-accent-dark"
            >
              Excel İndir ({selected.length} sütun
              {selectedDeparture ? ` · ${selectedDeparture.passengerCount} yolcu` : " · tüm seferler"})
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
