"use client";

import { useState } from "react";
import {
  Gender,
  AgeBand,
  RoomPlan,
  genderLabel,
  bandLabel,
  bandAgeText,
  isValidId,
  isValidPhone,
  priceBooking,
  passengerBand,
  formatPrice,
  decodeRooms,
  encodeRooms,
  roomsTotal,
  assignRooms,
  validateRooms,
  needsIdDocument,
  ROOM_MAX_GUESTS,
} from "@/lib/shared";
import { COUNTRIES } from "@/lib/countries";
import RoomsEditor, { packRooms } from "@/components/RoomsEditor";
import IdDocumentUpload from "@/components/IdDocumentUpload";

export interface CheckoutTour {
  id: string;
  bookingType: string;
  category: string;
}

interface SeatPick {
  code: string;
  gender: Gender;
}

export interface CheckoutSummary {
  title: string;
  destination: string;
  departureLabel: string;
  priceLabel: string;
  totalLabel: string;
}

export default function CheckoutForm({
  tour,
  seats,
  quantity,
  action,
  summary,
  boardingPlaceId,
  boardingLabel,
  busLabel,
  departureId,
  defaults,
  earnPoints = 0,
  loggedIn = false,
  loginHref,
  unitPrice,
  departureDate,
  singleSupplement,
  hasAccommodation,
  initialRooms,
  currency,
}: {
  tour: CheckoutTour;
  seats: SeatPick[];
  quantity: number;
  action: (fd: FormData) => void;
  summary: CheckoutSummary;
  boardingPlaceId?: string;
  boardingLabel?: string;
  busLabel?: string; // "34 ABC 123 plakalı otobüs"
  departureId?: string;
  defaults?: { contactName?: string; contactPhone?: string; contactEmail?: string };
  earnPoints?: number;
  loggedIn?: boolean;
  loginHref?: string;
  unitPrice: number;
  departureDate: string;
  singleSupplement: number;
  hasAccommodation: boolean;
  initialRooms?: string; // "2-1-0|1-0-1" — seçim adımından gelen oda dağılımı
  currency: string;
}) {
  const isSeat = tour.bookingType === "KOLTUK";
  const count = isSeat ? seats.length : quantity;

  // KONTENJAN için cinsiyet burada seçilir; KOLTUK için koltuk seçiminden gelir.
  const [genders, setGenders] = useState<(Gender | "")[]>(
    Array.from({ length: count }, (_, i) => (isSeat ? seats[i].gender : ""))
  );
  const [births, setBirths] = useState<string[]>(
    Array.from({ length: count }, () => "")
  );
  // Konaklamalı turda oda planı: her odaya kaç kişi. Yaş grubu BURADA girilmez.
  const [rooms, setRooms] = useState<RoomPlan>(() => {
    if (!hasAccommodation) return [];
    const fromUrl = decodeRooms(initialRooms);
    if (fromUrl.length && roomsTotal(fromUrl) === count) return fromUrl;
    return packRooms(count);
  });
  const [nats, setNats] = useState<("TC" | "FOREIGN")[]>(
    Array.from({ length: count }, () => "TC")
  );
  const [countries, setCountries] = useState<string[]>(
    Array.from({ length: count }, () => "")
  );
  // Yolcu başına yüklenen kimlik belgesi dosya adı ("" = yok). Çocuk/bebek
  // için zorunlu; yüklenmezse o yolcu tam ücret öder.
  const [docs, setDocs] = useState<string[]>(Array.from({ length: count }, () => ""));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Yolcunun yaş grubu TEK KAYNAKTAN gelir: girilen doğum tarihi. Ayrıca yaş
  // grubu seçilmez; tarih girilmediyse yetişkin (tam ücret) sayılır. Çocuk veya
  // bebek çıkarsa kimlik belgesi alanı kendiliğinden açılır ve zorunlu olur.
  const bands: AgeBand[] = births.map((b) =>
    passengerBand({ birthDate: b || undefined }, departureDate)
  );
  const effectiveBand = (i: number): AgeBand => bands[i] ?? "ADULT";

  const roomsError = hasAccommodation ? validateRooms(rooms, bands) : null;
  const roomsCountMismatch =
    hasAccommodation && roomsTotal(rooms) !== count ? roomsTotal(rooms) - count : 0;

  // Yolcu i'nin odası: her odaya bir yetişkin düşecek şekilde dağıtılır.
  const roomIdx = hasAccommodation ? assignRooms(rooms, bands) : [];
  const roomOf = (i: number): number => roomIdx[i] ?? 0;

  // Canlı toplam (sunucu yeniden hesaplar; bu yalnız görsel özet).
  const priced = priceBooking({
    unitPrice,
    departureDate,
    // Yaş bandı doğum tarihinden hesaplanır; ayrıca bildirilmez.
    passengers: births.map((b, i) => ({
      birthDate: b || undefined,
      hasIdDocument: Boolean(docs[i]),
    })),
    rooms: hasAccommodation ? rooms : undefined,
    singleSupplement,
  });

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
  const label = "block text-sm font-medium text-slate-600";

  function validate(fd: FormData): boolean {
    const errs: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      const first = (fd.get(`p_${i}_first`) as string)?.trim() ?? "";
      const last = (fd.get(`p_${i}_last`) as string)?.trim() ?? "";
      const id = (fd.get(`p_${i}_id`) as string)?.trim() ?? "";
      const foreign = nats[i] === "FOREIGN";
      if (!first) errs[`p_${i}_first`] = "Ad zorunlu.";
      if (!last) errs[`p_${i}_last`] = "Soyad zorunlu.";
      if (!id) {
        errs[`p_${i}_id`] = foreign ? "Pasaport no zorunlu." : "TC Kimlik No zorunlu.";
      } else if (!isValidId(id, foreign)) {
        errs[`p_${i}_id`] = foreign
          ? "Geçerli bir pasaport no girin."
          : "Geçerli bir TC Kimlik No girin (11 hane).";
      }
      if (foreign && !countries[i]) errs[`p_${i}_country`] = "Ülke seçin.";
      if (!isSeat && !genders[i]) errs[`p_${i}_gender`] = "Cinsiyet seçin.";

    }

    // Çocuk/bebek yolcu için kimlik belgesi zorunlu (yaş doğrulama).
    for (let i = 0; i < count; i++) {
      const band = effectiveBand(i);
      if (needsIdDocument(band) && !docs[i]) {
        errs[`p_${i}_doc`] =
          `${bandLabel(band)} yolcu için kimlik belgesi yükleyin. ` +
          `Belge olmadan bu yolcu için indirim uygulanamaz.`;
      }
    }

    if (hasAccommodation) {
      const rErr = validateRooms(rooms, bands);
      if (rErr) errs["rooms"] = rErr;
      else if (roomsTotal(rooms) !== count)
        errs["rooms"] = `Odalara ${count} kişi yerleştirilmeli (şu an ${roomsTotal(rooms)}).`;
    }
    const phone = (fd.get("contactPhone") as string)?.trim() ?? "";
    if (!isValidPhone(phone)) errs["contactPhone"] = "Geçerli bir telefon girin: 0(5xx) xxx xx xx";
    if (!((fd.get("contactName") as string)?.trim())) errs["contactName"] = "Ad soyad zorunlu.";
    const email = (fd.get("contactEmail") as string)?.trim() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs["contactEmail"] = "Geçerli bir e-posta girin.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    if (!validate(fd)) {
      e.preventDefault();
      // İlk hataya kaydır
      const first = document.querySelector("[data-error='1']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <input type="hidden" name="tourId" value={tour.id} />
      <input type="hidden" name="bookingType" value={tour.bookingType} />
      <input type="hidden" name="seatCodes" value={isSeat ? seats.map((s) => s.code).join(",") : ""} />
      <input type="hidden" name="quantity" value={String(quantity)} />
      {boardingPlaceId && <input type="hidden" name="boardingPlaceId" value={boardingPlaceId} />}
      {departureId && <input type="hidden" name="departureId" value={departureId} />}
      <input type="hidden" name="rooms" value={hasAccommodation ? encodeRooms(rooms) : ""} />
      {docs.map((d, i) => (
        <input key={`d${i}`} type="hidden" name={`p_${i}_doc`} value={d} />
      ))}
      {hasAccommodation &&
        roomIdx.map((room, i) => (
          <input key={`r${i}`} type="hidden" name={`p_${i}_room`} value={String(room)} />
        ))}
      {genders.map((g, i) => (
        <input key={i} type="hidden" name={`p_${i}_gender`} value={g} />
      ))}
      {births.map((b, i) => (
        <input key={`b${i}`} type="hidden" name={`p_${i}_birth`} value={b} />
      ))}
      {nats.map((n, i) => (
        <input key={`n${i}`} type="hidden" name={`p_${i}_nat`} value={n} />
      ))}
      {countries.map((c, i) => (
        <input key={`c${i}`} type="hidden" name={`p_${i}_country`} value={nats[i] === "FOREIGN" ? c : "Türkiye"} />
      ))}

      <div className="space-y-6">
        {/* Yolcular */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-brand">Yolcular</h2>
          <div className="space-y-5">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-100 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">
                    {i + 1}. Yolcu
                    {hasAccommodation && (
                      <span className="ml-2 rounded-md bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                        {roomOf(i) + 1}. Oda
                      </span>
                    )}
                    {/* Yaş grubu doğum tarihinden otomatik belirlenir. */}
                    {births[i] && effectiveBand(i) !== "ADULT" && (
                      <span className="ml-2 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                        {bandLabel(effectiveBand(i))} · {bandAgeText(effectiveBand(i))}
                      </span>
                    )}
                  </span>
                  {isSeat ? (
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        seats[i].gender === "K"
                          ? "bg-pink-100 text-pink-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      Koltuk {seats[i].code} · {genderLabel(seats[i].gender)}
                    </span>
                  ) : (
                    <div className="flex gap-1.5">
                      {(["E", "K"] as Gender[]).map((gv) => (
                        <button
                          key={gv}
                          type="button"
                          onClick={() =>
                            setGenders((prev) => prev.map((x, idx) => (idx === i ? gv : x)))
                          }
                          className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                            genders[i] === gv
                              ? gv === "K"
                                ? "bg-pink-600 text-white"
                                : "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {genderLabel(gv)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!isSeat && errors[`p_${i}_gender`] && (
                  <p data-error="1" className="mb-2 text-xs text-red-600">
                    {errors[`p_${i}_gender`]}
                  </p>
                )}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Uyruk:</span>
                  {([["TC", "T.C. Vatandaşı"], ["FOREIGN", "Yabancı Uyruklu"]] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setNats((prev) => prev.map((x, idx) => (idx === i ? val : x)))}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                        nats[i] === val ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                  {nats[i] === "FOREIGN" && (
                    <select
                      value={countries[i]}
                      onChange={(e) => setCountries((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                      data-error={errors[`p_${i}_country`] ? "1" : undefined}
                      className={`rounded-md border px-2 py-1 text-xs outline-none focus:border-brand ${
                        errors[`p_${i}_country`] ? "border-red-400" : "border-slate-200"
                      }`}
                    >
                      <option value="">Ülke seçin</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>
                {errors[`p_${i}_country`] && (
                  <p className="mb-2 text-xs text-red-600">{errors[`p_${i}_country`]}</p>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field name={`p_${i}_first`} labelText="Ad *" input={input} label={label} error={errors[`p_${i}_first`]} />
                  <Field name={`p_${i}_last`} labelText="Soyad *" input={input} label={label} error={errors[`p_${i}_last`]} />
                  <Field
                    name={`p_${i}_id`}
                    labelText={nats[i] === "FOREIGN" ? "Pasaport No *" : "TC Kimlik No *"}
                    input={input}
                    label={label}
                    error={errors[`p_${i}_id`]}
                    inputMode={nats[i] === "FOREIGN" ? "text" : "numeric"}
                    maxLength={nats[i] === "FOREIGN" ? 15 : 11}
                  />
                </div>
                <div className="mt-3">
                  <label className={label}>
                    Doğum Tarihi
                    <span className="text-slate-400">
                      {" "}
                      (çocuk/bebek indirimi buna göre uygulanır)
                    </span>
                    <input
                      type="date"
                      value={births[i]}
                      onChange={(e) =>
                        setBirths((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                      }
                      data-error={errors[`p_${i}_birth`] ? "1" : undefined}
                      className={`${input} ${errors[`p_${i}_birth`] ? "border-red-400" : ""}`}
                    />
                  </label>
                  {errors[`p_${i}_birth`] && (
                    <p className="mt-1 text-xs text-red-600">{errors[`p_${i}_birth`]}</p>
                  )}
                  {priced.perPassenger[i]?.band === "CHILD" && (
                    <p className="mt-1 text-xs font-medium text-accent">
                      {priced.adultCount >= 2
                        ? "%50 çocuk indirimi uygulandı."
                        : "İndirim için rezervasyonda en az 2 yetişkin gerekir."}
                    </p>
                  )}
                  {priced.perPassenger[i]?.band === "INFANT" &&
                    !priced.perPassenger[i]?.fullFare && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Bebek — ücretsiz.
                      </p>
                    )}
                  {priced.perPassenger[i]?.fullFare && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Kimlik belgesi yüklenmediği için tam ücret uygulanıyor.
                    </p>
                  )}
                </div>

                {/* Yaş doğrulama belgesi — yalnız çocuk ve bebek için */}
                {needsIdDocument(effectiveBand(i)) && (
                  <IdDocumentUpload
                    value={docs[i]}
                    onChange={(name) =>
                      setDocs((prev) => prev.map((x, idx) => (idx === i ? name : x)))
                    }
                    bandLabel={bandLabel(effectiveBand(i))}
                    error={errors[`p_${i}_doc`]}
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Konaklama — oda oda kişi dağılımı (yalnız konaklamalı turlarda) */}
        {hasAccommodation && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-1 font-bold text-brand">Konaklama</h2>
            <p className="mb-4 text-xs text-slate-400">
              {count} kişiyi odalara dağıtın — bir odada en fazla {ROOM_MAX_GUESTS} kişi
              konaklayabilir. Tek kişi kalan her oda için{" "}
              {formatPrice(singleSupplement, currency)} fark eklenir. Yaş grubu
              girmeniz gerekmez: yukarıdaki doğum tarihlerinden otomatik belirlenir.
            </p>
            <RoomsEditor
              value={rooms}
              onChange={setRooms}
              totalGuests={count}
              bands={bands}
              className="!p-0 !shadow-none !ring-0"
            />
            {errors["rooms"] && (
              <p data-error="1" className="mt-3 text-xs font-medium text-red-600">
                {errors["rooms"]}
              </p>
            )}
          </section>
        )}

        {/* İletişim */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-brand">İletişim Bilgileri</h2>
          <p className="mb-4 text-xs text-slate-400">
            Biletiniz ve tur bilgileri bu adrese gönderilecektir.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="contactName" labelText="Ad Soyad *" input={input} label={label} error={errors["contactName"]} defaultValue={defaults?.contactName} />
            <Field
              name="contactPhone"
              labelText="Telefon *"
              input={input}
              label={label}
              error={errors["contactPhone"]}
              placeholder="0(5xx) xxx xx xx"
              inputMode="tel"
              defaultValue={defaults?.contactPhone}
            />
            <Field name="contactEmail" labelText="E-posta *" input={input} label={label} error={errors["contactEmail"]} type="email" defaultValue={defaults?.contactEmail} />
          </div>
        </section>
      </div>

      {/* Özet */}
      <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm lg:sticky lg:top-24">
        <h2 className="font-bold text-brand">Özet</h2>
        <div className="mt-3 border-b border-slate-100 pb-3">
          <p className="font-semibold text-slate-800">{summary.title}</p>
          <p className="text-xs text-slate-400">{summary.destination}</p>
          <p className="mt-1 text-xs text-slate-500">Kalkış: {summary.departureLabel}</p>
          {boardingLabel && (
            <p className="text-xs text-slate-500">Biniş: {boardingLabel}</p>
          )}
          {busLabel && <p className="text-xs text-slate-500">Araç: {busLabel}</p>}
        </div>
        <div className="mt-3 space-y-1 text-sm text-slate-500">
          {isSeat ? (
            <SummaryRow label="Koltuklar" value={seats.map((s) => s.code).join(", ")} />
          ) : (
            <SummaryRow label="Kişi" value={`${quantity} kişi`} />
          )}
          <SummaryRow label="Kişi başı" value={summary.priceLabel} />
          {hasAccommodation && (
            <SummaryRow
              label="Oda"
              value={`${rooms.length} oda · ${priced.adultCount} yetişkin${
                priced.childCount ? ` · ${priced.childCount} çocuk` : ""
              }${priced.infantCount ? ` · ${priced.infantCount} bebek` : ""}`}
            />
          )}
          {priced.childCount > 0 && priced.adultCount >= 2 && (
            <SummaryRow
              label={`Çocuk indirimi (${priced.childCount})`}
              value={`%50`}
            />
          )}
          {priced.infantCount > 0 && (
            <SummaryRow label={`Bebek (${priced.infantCount})`} value="ücretsiz" />
          )}
          {priced.supplement > 0 && (
            <SummaryRow
              label={`Tek kişi farkı (${priced.singleRooms} oda)`}
              value={formatPrice(priced.supplement, currency)}
            />
          )}
          {priced.unverifiedCount > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {priced.unverifiedCount} yolcu için kimlik belgesi bekleniyor; belge
              yüklenmezse tam ücret uygulanır.
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-base font-extrabold text-brand">
          <span>Toplam</span>
          <span className="text-accent">{formatPrice(priced.total, currency)}</span>
        </div>
        {earnPoints > 0 &&
          (loggedIn ? (
            <p className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-accent/5 px-3 py-2 text-center text-xs font-medium text-accent">
              <span aria-hidden>★</span>
              Bu rezervasyondan ~{earnPoints.toLocaleString("tr-TR")} puan kazanacaksınız.
            </p>
          ) : (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
              <a href={loginHref ?? "/giris"} className="font-semibold text-brand hover:text-accent">
                Üye girişi
              </a>{" "}
              yaparsanız bu rezervasyondan ~{earnPoints.toLocaleString("tr-TR")} puan kazanırsınız.
            </p>
          ))}

        <button
          disabled={Boolean(roomsError) || roomsCountMismatch !== 0}
          className="mt-4 w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ödemeye Geç
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Koltuklarınız ödeme tamamlanana kadar 15 dk süreyle size ayrılır.
        </p>
      </aside>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}

function Field({
  name,
  labelText,
  input,
  label,
  error,
  type = "text",
  placeholder,
  inputMode,
  maxLength,
  defaultValue,
}: {
  name: string;
  labelText: string;
  input: string;
  label: string;
  error?: string;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
  maxLength?: number;
  defaultValue?: string;
}) {
  return (
    <label className={label}>
      {labelText}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        defaultValue={defaultValue}
        data-error={error ? "1" : undefined}
        className={`${input} ${error ? "border-red-400" : ""}`}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
