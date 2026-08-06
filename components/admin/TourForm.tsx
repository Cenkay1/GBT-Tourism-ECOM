"use client";

import { useState } from "react";
import ImageUpload from "@/components/admin/ImageUpload";
import GalleryUpload from "@/components/admin/GalleryUpload";
import PlacesEditor, { PlaceRow } from "@/components/admin/PlacesEditor";
import SegmentPriceEditor from "@/components/admin/SegmentPriceEditor";
import MapField from "@/components/admin/MapField";
import type { Amenity, SegmentPrice } from "@/lib/shared";

export interface TourFormValues {
  title?: string;
  destination?: string;
  category?: string;
  bookingType?: string;
  departureDate?: string; // yyyy-MM-ddTHH:mm
  returnDate?: string;
  departureLocation?: string;
  durationDays?: number;
  price?: number;
  currency?: string;
  coverImage?: string;
  images?: string; // newline
  description?: string;
  highlights?: string; // newline
  capacity?: number;
  vehicleType?: string;
  seatRows?: number;
  status?: string;
  places?: PlaceRow[];
  features?: string[];
  excludedFeatures?: string[];
  type?: string;
  segmentPrices?: SegmentPrice[];
}

export default function TourForm({
  action,
  initial,
  submitLabel,
  amenities = [],
}: {
  action: (fd: FormData) => void;
  initial?: TourFormValues;
  submitLabel: string;
  amenities?: Amenity[];
}) {
  const [bookingType, setBookingType] = useState(initial?.bookingType ?? "KOLTUK");
  const [features, setFeatures] = useState<string[]>(initial?.features ?? []);
  const [excluded, setExcluded] = useState<string[]>(initial?.excludedFeatures ?? []);
  const [type, setType] = useState(initial?.type ?? "TUR");
  const [places, setPlaces] = useState<PlaceRow[]>(initial?.places ?? []);
  const [segments, setSegments] = useState<SegmentPrice[]>(initial?.segmentPrices ?? []);
  const isSefer = type === "SEFER";

  function toggleFeature(id: string) {
    setFeatures((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    // Bir özellik hem dahil hem hariç olamaz.
    setExcluded((prev) => prev.filter((x) => x !== id));
  }

  function toggleExcluded(id: string) {
    setExcluded((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setFeatures((prev) => prev.filter((x) => x !== id));
  }

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  return (
    <form action={action} className="space-y-6">
      <Card title="Genel Bilgiler">
        <input type="hidden" name="type" value={type} />
        <div className="mb-4 flex flex-wrap gap-3">
          <TypeChip current={type} value="TUR" label="Tur" onSelect={setType} />
          <TypeChip current={type} value="SEFER" label="Sefer (Rota)" onSelect={setType} />
        </div>
        <p className="mb-4 text-xs text-slate-400">
          {isSefer
            ? "Sefer: sıralı duraklı, nereden→nereye segment fiyatlı, koltuklu yolculuk."
            : "Tur: paket gezi. Yolcu bir duraktan biner; farklı yerde inemez."}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Tur Başlığı *
            <input name="title" required defaultValue={initial?.title} className={input} />
          </label>
          <label className={label}>
            Destinasyon *
            <input name="destination" required defaultValue={initial?.destination} className={input} placeholder="Örn. Nevşehir, Kapadokya" />
          </label>
          <label className={label}>
            Kategori *
            <select name="category" defaultValue={initial?.category ?? "YURT_ICI"} className={input}>
              <option value="YURT_ICI">Yurt İçi</option>
              <option value="YURT_DISI">Yurt Dışı</option>
            </select>
          </label>
          <label className={label}>
            Durum
            <select name="status" defaultValue={initial?.status ?? "YAYINDA"} className={input}>
              <option value="YAYINDA">Yayında</option>
              <option value="TASLAK">Taslak</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <MapField
              name="departureLocation"
              label="Kalkış Yeri *"
              required
              defaultValue={initial?.departureLocation}
              placeholder="Örn. Dudullu Terminal, İstanbul"
            />
          </div>
          <label className={label}>
            Süre (gün)
            <input name="durationDays" type="number" min={1} defaultValue={initial?.durationDays ?? 1} className={input} />
          </label>
          <label className={label}>
            Kalkış Tarihi/Saati *
            <input name="departureDate" type="datetime-local" required defaultValue={initial?.departureDate} className={input} />
          </label>
          <label className={label}>
            Dönüş Tarihi/Saati
            <input name="returnDate" type="datetime-local" defaultValue={initial?.returnDate} className={input} />
          </label>
        </div>
      </Card>

      <Card title="Fiyat">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Kişi Başı Fiyat *
            <input name="price" type="number" min={0} required defaultValue={initial?.price} className={input} />
          </label>
          <label className={label}>
            Para Birimi
            <select name="currency" defaultValue={initial?.currency ?? "TRY"} className={input}>
              <option value="TRY">₺ TRY</option>
              <option value="EUR">€ EUR</option>
              <option value="USD">$ USD</option>
            </select>
          </label>
        </div>
      </Card>

      <Card title="Rezervasyon Tipi">
        {isSefer ? (
          <>
            <input type="hidden" name="bookingType" value="KOLTUK" />
            <p className="text-sm text-slate-500">
              Seferler koltuk seçimlidir. Araç ve sıra bilgisini aşağıdan girin.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <TypeChip current={bookingType} value="KOLTUK" label="Koltuk Seçimli" onSelect={setBookingType} />
              <TypeChip current={bookingType} value="KONTENJAN" label="Kontenjanlı" onSelect={setBookingType} />
            </div>
            <input type="hidden" name="bookingType" value={bookingType} />
          </>
        )}

        {(isSefer || bookingType === "KOLTUK") ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Araç Tipi
              <select name="vehicleType" defaultValue={initial?.vehicleType ?? "OTOBUS"} className={input}>
                <option value="OTOBUS">Otobüs — 2+2 (standart)</option>
                <option value="VIP">Lüks / VIP — 2+1</option>
                <option value="MINIBUS">Minibüs / Küçük — 1+1</option>
              </select>
            </label>
            <label className={label}>
              Sıra Sayısı
              <input name="seatRows" type="number" min={1} max={20} defaultValue={initial?.seatRows ?? 12} className={input} />
            </label>
            <p className="text-xs text-slate-400 sm:col-span-2">
              Araç tipi koltuk düzenini belirler (Otobüs 4, VIP 3, Minibüs 2 koltuk/sıra). Koltuklar
              kaydettiğinizde otomatik oluşturulur. Satış/rezervasyon başladıysa düzen değiştirilemez.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Kontenjan (kişi)
              <input name="capacity" type="number" min={1} defaultValue={initial?.capacity ?? 40} className={input} />
            </label>
          </div>
        )}
      </Card>

      <Card title="Görseller ve Açıklama">
        <ImageUpload
          name="coverImage"
          defaultValue={initial?.coverImage}
          label="Kapak Görseli"
          hint="Bilgisayardan yükleyin veya bağlantı yapıştırın."
        />
        <div className="mt-4">
          <GalleryUpload
            name="images"
            defaultValue={initial?.images}
            label="Galeri Görselleri"
            hint="Birden fazla görsel yükleyebilirsiniz; hepsi afiş boyutunda yan yana gösterilir."
          />
        </div>
        <label className={`${label} mt-4`}>
          Açıklama
          <textarea name="description" rows={4} defaultValue={initial?.description} className={input} />
        </label>
        <label className={`${label} mt-4`}>
          Öne Çıkanlar (her satıra bir madde)
          <textarea name="highlights" rows={3} defaultValue={initial?.highlights} className={input} placeholder={"2 gece konaklama\nRehberlik dahil"} />
        </label>
      </Card>

      <Card title="Fiyata Dahil Özellikler">
        <input type="hidden" name="features" value={JSON.stringify(features)} />
        {amenities.length === 0 ? (
          <p className="text-sm text-slate-400">
            Henüz özellik tanımlanmamış.{" "}
            <a href="/admin/ozellikler" className="font-medium text-brand underline">
              Özellikler
            </a>{" "}
            sayfasından ekleyin (Konaklama, Kahvaltı, Rehber…).
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-400">
              Bu tura dahil olan hizmetleri işaretleyin. Tur sayfasında “Fiyata Dahil” olarak görünür.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {amenities.map((a) => {
                const active = features.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleFeature(a.id)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-medium transition ${
                      active
                        ? "border-accent bg-accent/10 text-accent-dark"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                        active ? "border-accent bg-accent text-white" : "border-slate-300"
                      }`}
                    >
                      {active ? "✓" : ""}
                    </span>
                    <span className="text-lg leading-none">{a.icon || "•"}</span>
                    <span>{a.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card title="Fiyata Dahil Olmayanlar">
        <input type="hidden" name="excludedFeatures" value={JSON.stringify(excluded)} />
        {amenities.length === 0 ? (
          <p className="text-sm text-slate-400">
            Önce{" "}
            <a href="/admin/ozellikler" className="font-medium text-brand underline">
              Özellikler
            </a>{" "}
            sayfasından hizmet tanımlayın.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-400">
              Fiyata dahil OLMAYAN hizmetleri işaretleyin. Tur sayfasında “Fiyata Dahil Değil” olarak görünür.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {amenities.map((a) => {
                const active = excluded.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleExcluded(a.id)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-medium transition ${
                      active
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                        active ? "border-red-400 bg-red-500 text-white" : "border-slate-300"
                      }`}
                    >
                      {active ? "✕" : ""}
                    </span>
                    <span className="text-lg leading-none">{a.icon || "•"}</span>
                    <span>{a.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card title="Rota & Konaklama (Harita)">
        <p className="mb-3 text-xs text-slate-400">
          Turun durakları ve (konaklamalıysa) otelleri. Her biri tur sayfasında haritada gösterilir.
          Her durağa <strong>biniş fiyatı</strong> girebilirsiniz; müşteri o duraktan binmeyi seçince o fiyat uygulanır (boş bırakılırsa tur fiyatı geçerli).
        </p>
        <PlacesEditor name="places" value={places} onChange={setPlaces} />
      </Card>

      {isSefer && (
        <Card title="Segment Fiyatları (Nereden → Nereye)">
          <SegmentPriceEditor name="segmentPrices" places={places} value={segments} onChange={setSegments} />
        </Card>
      )}

      <div className="flex gap-3">
        <button className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-white hover:bg-accent-dark">
          {submitLabel}
        </button>
        <a href="/admin/turlar" className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Vazgeç
        </a>
      </div>
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-bold text-brand">{title}</h2>
      {children}
    </div>
  );
}

function TypeChip({
  current,
  value,
  label,
  onSelect,
}: {
  current: string;
  value: string;
  label: string;
  onSelect: (v: string) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
        active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
