"use client";

import { useState } from "react";
import ImageUpload from "@/components/admin/ImageUpload";
import GalleryUpload from "@/components/admin/GalleryUpload";
import PlacesEditor, { PlaceRow } from "@/components/admin/PlacesEditor";
import MapField from "@/components/admin/MapField";

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
}

export default function TourForm({
  action,
  initial,
  submitLabel,
}: {
  action: (fd: FormData) => void;
  initial?: TourFormValues;
  submitLabel: string;
}) {
  const [bookingType, setBookingType] = useState(initial?.bookingType ?? "KOLTUK");

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  return (
    <form action={action} className="space-y-6">
      <Card title="Genel Bilgiler">
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
        <div className="flex flex-wrap gap-3">
          <TypeChip current={bookingType} value="KOLTUK" label="Koltuk Seçimli" onSelect={setBookingType} />
          <TypeChip current={bookingType} value="KONTENJAN" label="Kontenjanlı" onSelect={setBookingType} />
        </div>
        <input type="hidden" name="bookingType" value={bookingType} />

        {bookingType === "KOLTUK" ? (
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

      <Card title="Rota & Konaklama (Harita)">
        <p className="mb-3 text-xs text-slate-400">
          Turun durakları ve (konaklamalıysa) otelleri. Her biri tur sayfasında haritada gösterilir.
        </p>
        <PlacesEditor name="places" initial={initial?.places} />
      </Card>

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
