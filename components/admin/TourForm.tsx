"use client";

import { useState } from "react";
import Link from "next/link";
import ImageUpload from "@/components/admin/ImageUpload";
import GalleryUpload from "@/components/admin/GalleryUpload";
import type { PlaceRow } from "@/components/admin/placeTypes";
import BoardingPointsEditor from "@/components/admin/BoardingPointsEditor";
import PlacesToVisitEditor from "@/components/admin/PlacesToVisitEditor";
import HotelsEditor from "@/components/admin/HotelsEditor";
import DocumentsUpload from "@/components/admin/DocumentsUpload";
import DeparturesEditor, { DepartureRow } from "@/components/admin/DeparturesEditor";
import MapField from "@/components/admin/MapField";
import { busSeatCount, type Amenity, type Bus, type TourDocument } from "@/lib/shared";

export interface TourFormValues {
  title?: string;
  destination?: string;
  category?: string;
  bookingType?: string;
  departures?: DepartureRow[]; // seferler (kalkış/dönüş çiftleri)
  departureLocation?: string;
  durationDays?: number;
  price?: number;
  currency?: string;
  coverImage?: string;
  images?: string; // newline
  description?: string;
  highlights?: string; // newline
  capacity?: number;
  busId?: string;
  vehicleType?: string;
  seatRows?: number;
  doorAfterRow?: number;
  backRowFull?: boolean;
  documents?: TourDocument[];
  hasAccommodation?: boolean;
  singleSupplement?: number;
  status?: string;
  places?: PlaceRow[];
  features?: string[];
  excludedFeatures?: string[];
}

export default function TourForm({
  action,
  initial,
  submitLabel,
  amenities = [],
  buses = [],
}: {
  action: (fd: FormData) => void;
  initial?: TourFormValues;
  submitLabel: string;
  amenities?: Amenity[];
  buses?: Bus[];
}) {
  const [bookingType, setBookingType] = useState(initial?.bookingType ?? "KOLTUK");
  // Seferler: en az bir kalkış/dönüş çifti. Turun kalkış tarihi en yakın seferden gelir.
  const [departures, setDepartures] = useState<DepartureRow[]>(
    initial?.departures?.length
      ? initial.departures
      : [{ departureDate: "", returnDate: "", status: "AKTIF" }]
  );
  // Konaklamalı tur: tek kişilik oda farkı ve satın alımda oda/yaş seçimi açılır.
  const [hasAccommodation, setHasAccommodation] = useState(
    initial?.hasAccommodation ?? false
  );
  const [features, setFeatures] = useState<string[]>(initial?.features ?? []);
  const [excluded, setExcluded] = useState<string[]>(initial?.excludedFeatures ?? []);
  // Otobüs: seçilirse koltuk düzeni ondan gelir, elle giriş alanları kapanır.
  const [busId, setBusId] = useState(initial?.busId ?? "");
  const selectedBus = buses.find((b) => b.id === busId);
  const [documents, setDocuments] = useState<TourDocument[]>(initial?.documents ?? []);

  // Üç ayrı yer listesi: biniş noktaları, gezilecek yerler, konaklama.
  const initialPlaces = initial?.places ?? [];
  const [boardingPlaces, setBoardingPlaces] = useState<PlaceRow[]>(
    initialPlaces.filter((p) => p.type === "BINIS")
  );
  const [visitPlaces, setVisitPlaces] = useState<PlaceRow[]>(
    initialPlaces.filter((p) => p.type === "GEZI")
  );
  const [hotelPlaces, setHotelPlaces] = useState<PlaceRow[]>(
    initialPlaces.filter((p) => p.type === "OTEL")
  );

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

        <div className="mt-4 rounded-xl border border-slate-100 p-4">
          <label className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
            <input
              name="hasAccommodation"
              type="checkbox"
              checked={hasAccommodation}
              onChange={(e) => setHasAccommodation(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Konaklamalı tur
              <span className="mt-0.5 block text-xs font-normal text-slate-400">
                İşaretlerseniz müşteri satın alırken oda oda kişi sayısı girer
                (yetişkin 12+, çocuk 4-12, bebek 0-3; bir odada en fazla 3 kişi) ve tek
                kişilik kalan her oda için aşağıdaki fark eklenir.
              </span>
            </span>
          </label>

          {hasAccommodation && (
            <label className={`${label} mt-4 sm:max-w-xs`}>
              Tek Kişi Farkı (₺ / oda)
              <input
                name="singleSupplement"
                type="number"
                min={0}
                defaultValue={initial?.singleSupplement ?? 2000}
                className={input}
              />
              <span className="mt-1 block text-xs text-slate-400">
                Odada tek başına kalan müşteriye kişi başı fiyatın üstüne eklenir. 2 veya 3
                kişilik odalarda eklenmez.
              </span>
            </label>
          )}
        </div>
      </Card>

      <Card title="Rezervasyon Tipi">
        <div className="flex flex-wrap gap-3">
          <TypeChip current={bookingType} value="KOLTUK" label="Koltuk Seçimli" onSelect={setBookingType} />
          <TypeChip current={bookingType} value="KONTENJAN" label="Kontenjanlı" onSelect={setBookingType} />
        </div>
        <input type="hidden" name="bookingType" value={bookingType} />

        {bookingType === "KOLTUK" ? (
          <div className="mt-4 space-y-4">
            {/* Otobüs seçimi — düzen araçtan gelir */}
            <label className={label}>
              Otobüs
              <select
                name="busId"
                value={busId}
                onChange={(e) => setBusId(e.target.value)}
                className={input}
              >
                <option value="">— Otobüs seçilmedi (düzeni elle gir) —</option>
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.plate} — {b.name} ({busSeatCount(b)} koltuk, {b.seatLayout})
                    {!b.active ? " · pasif" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-400">
                {buses.length === 0 ? (
                  <>
                    Henüz otobüs tanımlı değil.{" "}
                    <Link href="/admin/otobusler/yeni" className="font-medium text-brand underline">
                      Otobüslerim
                    </Link>{" "}
                    sayfasından ekleyin — koltuk düzeni ve plaka oradan gelir.
                  </>
                ) : (
                  "Otobüs seçerseniz koltuk şeması birebir o araçtan oluşur ve hatırlatma mesajlarında plaka yazar. Her sefere ayrı otobüs atayabilirsiniz (Seferler bölümü)."
                )}
              </span>
            </label>

            {selectedBus ? (
              <div className="rounded-xl border border-brand/20 bg-brand/5 p-4 text-sm">
                <p className="font-semibold text-brand">
                  {selectedBus.plate} · {selectedBus.name}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {busSeatCount(selectedBus)} koltuk · {selectedBus.seatLayout} ·{" "}
                  {selectedBus.doorAfterRow
                    ? `kapı ${selectedBus.doorAfterRow}. sıradan sonra`
                    : "orta kapı yok"}
                  {selectedBus.backRowFull && " · son sıra tam"}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Düzen bu araçtan alınır.{" "}
                  <Link
                    href={`/admin/otobusler/${selectedBus.id}`}
                    className="font-medium text-brand underline"
                  >
                    Otobüsü düzenle
                  </Link>
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
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
                <label className={label}>
                  Orta Kapı Sırası
                  <input name="doorAfterRow" type="number" min={1} max={20} defaultValue={initial?.doorAfterRow ?? ""} placeholder="Örn. 14" className={input} />
                  <span className="mt-1 block text-xs text-slate-400">Kapı bu sıradan sonra çizilir. Boş = kapı yok.</span>
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 sm:col-span-2">
                  <input name="backRowFull" type="checkbox" defaultChecked={initial?.backRowFull} className="h-4 w-4" />
                  Son sırada koridorda da koltuk olsun (tam sıra)
                </label>
                <p className="text-xs text-slate-400 sm:col-span-2">
                  Araç tipi koltuk düzenini belirler (Otobüs 4, VIP 3, Minibüs 2 koltuk/sıra). Koltuklar
                  kaydettiğinizde otomatik oluşturulur. Satışı başlamış seferlerin düzeni değiştirilmez.
                </p>
              </div>
            )}
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

      <Card title="Seferler (Kalkış Tarihleri)">
        <p className="mb-3 text-xs text-slate-400">
          Bu tur birden çok sefer içerebilir — örn. ayın 12&apos;si (dönüş 17&apos;si) ve 18&apos;i
          (dönüş 24&apos;ü) ya da her hafta Salı. Her seferin <strong>kendi koltuk düzeni /
          kontenjanı</strong> vardır; müşteri satın alırken hangi seferi aldığını seçer. Turun
          listelerde görünen kalkış tarihi, satışa açık en yakın seferdir.
        </p>
        <input type="hidden" name="departures" value={JSON.stringify(departures)} />
        <DeparturesEditor
          value={departures}
          onChange={setDepartures}
          bookingType={bookingType}
          buses={buses}
          defaultBusId={busId}
        />
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
        <div className="mt-4">
          <span className={label}>Tur Programı Belgeleri (PDF / Word)</span>
          <div className="mt-1">
            <DocumentsUpload name="documents" value={documents} onChange={setDocuments} />
          </div>
        </div>
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
            <Link href="/admin/ozellikler" className="font-medium text-brand underline">
              Özellikler
            </Link>{" "}
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
            <Link href="/admin/ozellikler" className="font-medium text-brand underline">
              Özellikler
            </Link>{" "}
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

      <input
        type="hidden"
        name="places"
        value={JSON.stringify([...boardingPlaces, ...visitPlaces, ...hotelPlaces])}
      />

      <Card title="Biniş Noktaları">
        <p className="mb-3 text-xs text-slate-400">
          Müşterinin <strong>&quot;Nereden bineceksiniz?&quot;</strong> adımında seçeceği noktalar —
          gezilecek yerlerden tamamen ayrıdır. Her noktaya <strong>saat</strong> (otobüs kaçta orada
          olacak) ve <strong>kişi başı fiyat</strong> girebilirsiniz; fiyat boşsa tur fiyatı geçerlidir.
        </p>
        <BoardingPointsEditor value={boardingPlaces} onChange={setBoardingPlaces} />
      </Card>

      <Card title="Gezilecek Yerler">
        <p className="mb-3 text-xs text-slate-400">
          Turda gezilecek noktalar. Sırayla listelenir; işaretlediklerinizi tur sayfasındaki
          haritada pin olarak gösteririz. Biniş noktalarıyla karıştırılmaz.
        </p>
        <PlacesToVisitEditor value={visitPlaces} onChange={setVisitPlaces} />
      </Card>

      <Card title="Konaklama (Otel)">
        <p className="mb-3 text-xs text-slate-400">
          Konaklamalı turlarda kalınacak oteller ve gece sayıları. Tur sayfasındaki haritada gösterilir.
        </p>
        <HotelsEditor value={hotelPlaces} onChange={setHotelPlaces} />
      </Card>

      <div className="flex gap-3">
        <button className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-white hover:bg-accent-dark">
          {submitLabel}
        </button>
        <Link href="/admin/turlar" className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Vazgeç
        </Link>
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
