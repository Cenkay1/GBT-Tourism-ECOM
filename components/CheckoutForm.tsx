"use client";

import { useState } from "react";
import ConsentCheckboxes from "@/components/ConsentCheckboxes";
import {
  Gender,
  AgeBand,
  RoomPlan,
  genderLabel,
  bandLabel,
  fareBandLabel,
  fareBandAgeText,
  passengerFareBand,
  type FareBand,
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
  HOLD_MINUTES,
  depositFor,
  balanceDueDateFor,
  formatDate,
  type PaymentPlan,
  ROOM_MAX_GUESTS,
} from "@/lib/shared";
import { COUNTRIES } from "@/lib/countries";
import type { SavedPassengerView } from "@/lib/saved-passengers";
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
  depositPercent = 0,
  balanceDueDays = 5,
  savedPassengers = [],
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
  // Ön satış: oran 0 ise ödeme planı seçimi gösterilmez (yalnız peşin).
  depositPercent?: number;
  balanceDueDays?: number;
  // Giriş yapmış müşterinin hesabına kaydettiği kişiler. Boşsa seçici
  // gösterilmez (misafir alışverişi eskisi gibi çalışır).
  savedPassengers?: SavedPassengerView[];
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

  // Ad / soyad / kimlik no KONTROLLÜ alanlar: kayıtlı kişi seçildiğinde
  // programatik olarak doldurulmaları gerekiyor. (Önceden defaultValue ile
  // kontrolsüzdüler; o hâlde seçim alanları değiştiremezdi.)
  const [firsts, setFirsts] = useState<string[]>(Array.from({ length: count }, () => ""));
  const [lasts, setLasts] = useState<string[]>(Array.from({ length: count }, () => ""));
  const [ids, setIds] = useState<string[]>(Array.from({ length: count }, () => ""));
  // Hangi yolcu hangi kayıtlı kişiden dolduruldu (seçici göstergesi) ve
  // hangileri hesaba kaydedilecek.
  const [pickedIds, setPickedIds] = useState<string[]>(
    Array.from({ length: count }, () => "")
  );
  const [saveToAccount, setSaveToAccount] = useState<boolean[]>(
    Array.from({ length: count }, () => false)
  );

  // Dizi state'inde tek öğeyi değiştiren yardımcı. NoInfer: T YALNIZCA
  // setter'dan çıkarılsın — aksi halde dar bir değer (örn. "E") geçildiğinde
  // TypeScript T'yi ondan türetip setter'ın kendi tipiyle çakışıyor.
  const setAt = <T,>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    i: number,
    value: NoInfer<T>
  ) => setter((prev) => prev.map((x, idx) => (idx === i ? (value as T) : x)));

  // Kayıtlı kişiyi yolcu satırına uygula. Boş alanlar ezilmez: müşteri
  // seçimden sonra elle düzeltme yapabilir ve kayıtta olmayan bir bilgi
  // (ör. cinsiyet) formda girdiği değeri korur.
  function applySaved(i: number, personId: string) {
    setAt(setPickedIds, i, personId);
    if (!personId) return;
    const p = savedPassengers.find((x) => x.id === personId);
    if (!p) return;
    setAt(setFirsts, i, p.firstName);
    setAt(setLasts, i, p.lastName);
    if (p.idNumber) setAt(setIds, i, p.idNumber);
    if (p.birthDate) setAt(setBirths, i, p.birthDate);
    if (p.gender && !isSeat) setAt(setGenders, i, p.gender);
    setAt(setNats, i, p.nationality);
    if (p.country) setAt(setCountries, i, p.country);
    // Zaten kayıtlı: tekrar kaydetme kutusunu işaretli tutmanın anlamı yok.
    setAt(setSaveToAccount, i, false);
  }

  // Yolcunun yaş grubu TEK KAYNAKTAN gelir: girilen doğum tarihi. Ayrıca yaş
  // grubu seçilmez; tarih girilmediyse yetişkin (tam ücret) sayılır. Çocuk veya
  // bebek çıkarsa kimlik belgesi alanı kendiliğinden açılır ve zorunlu olur.
  const bands: AgeBand[] = births.map((b) =>
    passengerBand({ birthDate: b || undefined }, departureDate)
  );
  const effectiveBand = (i: number): AgeBand => bands[i] ?? "ADULT";
  // Ücret bandı tur tipine göre değişir (konaklamalı 4-6 %50, günübirlik 4+ tam).
  // Rozet, belge zorunluluğu ve açıklama metinleri BUNA bakar; odalama bands'e.
  const fareBands: FareBand[] = births.map((b) =>
    passengerFareBand({ birthDate: b || undefined }, departureDate, hasAccommodation)
  );
  const effectiveFare = (i: number): FareBand => fareBands[i] ?? "FULL";

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
    hasAccommodation,
    // Yaş bandı doğum tarihinden hesaplanır; ayrıca bildirilmez.
    passengers: births.map((b, i) => ({
      birthDate: b || undefined,
      hasIdDocument: Boolean(docs[i]),
    })),
    rooms: hasAccommodation ? rooms : undefined,
    singleSupplement,
  });

  // Ödeme planı: peşin mi, ön ödeme (kapora) ile rezerve mi. Yalnız turda ön
  // ödeme açıksa seçilebilir; sunucu da aynı kuralı doğrular.
  const depositEnabled = depositPercent > 0;
  const [plan, setPlan] = useState<PaymentPlan>("FULL");
  const effectivePlan: PaymentPlan = depositEnabled ? plan : "FULL";
  const depositAmount = depositEnabled ? depositFor(priced.total, depositPercent) : 0;
  const dueNow = effectivePlan === "DEPOSIT" ? depositAmount : priced.total;
  const remaining = Math.max(0, priced.total - dueNow);
  const balanceDue = balanceDueDateFor(departureDate, balanceDueDays);

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

    // İndirimli yolcu için kimlik belgesi zorunlu (yaş doğrulama).
    for (let i = 0; i < count; i++) {
      if (needsIdDocument(effectiveFare(i)) && !docs[i]) {
        errs[`p_${i}_doc`] =
          `${bandLabel(effectiveBand(i))} yolcu için kimlik belgesi yükleyin. ` +
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

  // Fatura hangi yolcu adına kesilecek. Varsayılan ilk yolcu.
  const [faturaYolcu, setFaturaYolcu] = useState(0);

  // Rıza kutuları işaretlenmeden "Ödemeye Geç" açılmaz. Sunucuda ayrıca
  // kontrol edilir (lib/consent.ts) — bu yalnız kullanıcıya erken geri bildirim.
  const [consentOk, setConsentOk] = useState(false);

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
      <input type="hidden" name="faturaYolcu" value={String(faturaYolcu)} />
      <input
        type="hidden"
        name="odemePlani"
        value={effectivePlan === "DEPOSIT" ? "ON_ODEME" : "PESIN"}
      />
      {/* Hangi yolcuların hesaba kaydedileceği — sunucu bu listeye göre kaydeder. */}
      <input
        type="hidden"
        name="kisileriKaydet"
        value={saveToAccount
          .map((v, i) => (v ? String(i) : ""))
          .filter(Boolean)
          .join(",")}
      />
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
                    {births[i] && effectiveFare(i) !== "FULL" && (
                      <span className="ml-2 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                        {fareBandLabel(effectiveFare(i))} ·{" "}
                        {fareBandAgeText(effectiveFare(i), hasAccommodation)}
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
                {/* Başlık satırının DIŞINDA kendi satırında: üstteki div iki öğe
                    için justify-between ile kurulu, üçüncü öğe eklenince metin
                    sağa itilip sıkışıyordu. */}
                <label className="mb-3 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="radio"
                    name="faturaYolcuSecim"
                    checked={faturaYolcu === i}
                    onChange={() => setFaturaYolcu(i)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  Fatura bu kişiye kesilsin
                </label>
                {!isSeat && errors[`p_${i}_gender`] && (
                  <p data-error="1" className="mb-2 text-xs text-red-600">
                    {errors[`p_${i}_gender`]}
                  </p>
                )}

                {/* Kayıtlı kişiler — yalnız giriş yapmış ve kaydı olan müşteride */}
                {savedPassengers.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <label className="text-xs font-medium text-slate-500">
                      Kayıtlı kişi:
                    </label>
                    <select
                      value={pickedIds[i] ?? ""}
                      onChange={(e) => applySaved(i, e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
                    >
                      <option value="">Seçin ve bilgiler dolsun</option>
                      {savedPassengers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.isSelf ? "★ " : ""}
                          {p.firstName} {p.lastName}
                          {p.label ? ` (${p.label})` : ""}
                        </option>
                      ))}
                    </select>
                    {pickedIds[i] && (
                      <span className="text-xs text-emerald-700">
                        Bilgiler dolduruldu — gerekirse düzeltebilirsiniz.
                      </span>
                    )}
                  </div>
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
                  <Field
                    name={`p_${i}_first`}
                    labelText="Ad *"
                    input={input}
                    label={label}
                    error={errors[`p_${i}_first`]}
                    value={firsts[i] ?? ""}
                    onValueChange={(v) => setAt(setFirsts, i, v)}
                  />
                  <Field
                    name={`p_${i}_last`}
                    labelText="Soyad *"
                    input={input}
                    label={label}
                    error={errors[`p_${i}_last`]}
                    value={lasts[i] ?? ""}
                    onValueChange={(v) => setAt(setLasts, i, v)}
                  />
                  <Field
                    name={`p_${i}_id`}
                    labelText={nats[i] === "FOREIGN" ? "Pasaport No *" : "TC Kimlik No *"}
                    input={input}
                    label={label}
                    error={errors[`p_${i}_id`]}
                    inputMode={nats[i] === "FOREIGN" ? "text" : "numeric"}
                    maxLength={nats[i] === "FOREIGN" ? 15 : 11}
                    value={ids[i] ?? ""}
                    onValueChange={(v) => setAt(setIds, i, v)}
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
                  {priced.perPassenger[i]?.fareBand === "HALF" && (
                    <p className="mt-1 text-xs font-medium text-accent">
                      {priced.adultCount >= 2
                        ? "%50 çocuk indirimi uygulandı."
                        : "İndirim için rezervasyonda en az 2 yetişkin gerekir."}
                    </p>
                  )}
                  {priced.perPassenger[i]?.fareBand === "FREE" &&
                    !priced.perPassenger[i]?.fullFare && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        {fareBandAgeText("FREE", hasAccommodation)} — ücretsiz.
                      </p>
                    )}
                  {priced.perPassenger[i]?.fullFare && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Kimlik belgesi yüklenmediği için tam ücret uygulanıyor.
                    </p>
                  )}
                </div>

                {/* Yaş doğrulama belgesi — yalnız çocuk ve bebek için */}
                {needsIdDocument(effectiveFare(i)) && (
                  <IdDocumentUpload
                    value={docs[i]}
                    onChange={(name) =>
                      setDocs((prev) => prev.map((x, idx) => (idx === i ? name : x)))
                    }
                    bandLabel={bandLabel(effectiveBand(i))}
                    error={errors[`p_${i}_doc`]}
                  />
                )}

                {/* Hesaba kaydet — yalnız giriş yapmış müşteride ve kişi
                    listeden seçilmediyse (seçilen kişi zaten kayıtlı). */}
                {loggedIn && !pickedIds[i] && (
                  <label className="mt-3 flex items-start gap-2.5 text-xs leading-relaxed text-slate-600">
                    <input
                      type="checkbox"
                      checked={saveToAccount[i] ?? false}
                      onChange={(e) => setAt(setSaveToAccount, i, e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                    />
                    <span>
                      Bu kişiyi hesabıma kaydet
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        Sonraki rezervasyonlarınızda listeden seçip bilgileri otomatik
                        doldurabilirsiniz. Hesabım → Kişilerim&apos;den dilediğiniz zaman
                        silebilirsiniz.
                      </span>
                    </span>
                  </label>
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
          {priced.halfCount > 0 && priced.adultCount >= 2 && (
            <SummaryRow
              label={`Çocuk indirimi (${priced.halfCount})`}
              value={`%50`}
            />
          )}
          {priced.freeCount > 0 && (
            <SummaryRow label={`Ücretsiz yolcu (${priced.freeCount})`} value="ücretsiz" />
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

        {/* Ödeme planı — ön ödeme açık turlarda müşteri seçer */}
        {depositEnabled && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <p className="text-sm font-bold text-brand">Ödeme Seçeneği</p>
            <PlanOption
              selected={effectivePlan === "FULL"}
              onSelect={() => setPlan("FULL")}
              title="Peşin öde"
              amount={formatPrice(priced.total, currency)}
              hint="Tutarın tamamını şimdi ödeyin, rezervasyonunuz kesinleşsin."
            />
            <PlanOption
              selected={effectivePlan === "DEPOSIT"}
              onSelect={() => setPlan("DEPOSIT")}
              title={`Ön ödeme ile rezerve et (%${depositPercent})`}
              amount={formatPrice(depositAmount, currency)}
              hint={`Koltuğunuz hemen ayrılır. Kalan ${formatPrice(
                Math.max(0, priced.total - depositAmount),
                currency
              )} en geç ${formatDate(balanceDue.toISOString())} tarihine kadar ödenmelidir.`}
            />
            {effectivePlan === "DEPOSIT" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Son ödeme tarihine kadar tamamlanmayan rezervasyonlar iptal edilir ve
                koltuk hakkı diğer misafirlerin rezervasyonuna açılır. Kalan ödemeyi
                e-postanıza gelecek bağlantıdan ya da acentemiz üzerinden
                yapabilirsiniz.
              </p>
            )}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium text-slate-600">Şimdi ödenecek</span>
              <span className="font-extrabold text-accent">
                {formatPrice(dueNow, currency)}
              </span>
            </div>
            {remaining > 0 && (
              <div className="flex items-center justify-between px-3 text-xs text-slate-500">
                <span>Kalan (son ödeme {formatDate(balanceDue.toISOString())})</span>
                <span className="font-semibold text-slate-700">
                  {formatPrice(remaining, currency)}
                </span>
              </div>
            )}
          </div>
        )}
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

        <ConsentCheckboxes onChange={setConsentOk} />

        <button
          disabled={Boolean(roomsError) || roomsCountMismatch !== 0 || !consentOk}
          className="mt-4 w-full rounded-xl bg-accent py-3 text-sm font-bold text-white transition enabled:hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ödemeye Geç{depositEnabled ? ` · ${formatPrice(dueNow, currency)}` : ""}
        </button>
        {!consentOk && (
          <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
            Devam etmek için yukarıdaki iki onayı işaretleyin.
          </p>
        )}
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Koltuklarınız ödeme tamamlanana kadar {HOLD_MINUTES} dk süreyle size ayrılır.
          Ödemeden vazgeçerseniz hemen serbest bırakılır.
        </p>
      </aside>
    </form>
  );
}

// Ödeme planı seçeneği (peşin / ön ödeme).
function PlanOption({
  selected,
  onSelect,
  title,
  amount,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  amount: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-xl border-2 p-3 text-left transition ${
        selected ? "border-accent bg-accent/5" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-800">{title}</span>
        <span className="shrink-0 text-sm font-extrabold text-accent">{amount}</span>
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-slate-500">{hint}</span>
    </button>
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

// Hem kontrollü hem kontrolsüz kullanılabilen alan.
//
// Kayıtlı kişi seçimiyle programatik doldurulan alanlar (ad, soyad, kimlik no)
// `value` + `onValueChange` ile kontrollü çalışır; iletişim alanları eskisi
// gibi `defaultValue` ile kontrolsüz kalır. İkisi aynı anda verilmez.
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
  value,
  onValueChange,
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
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const controlled = value !== undefined && onValueChange !== undefined;
  return (
    <label className={label}>
      {labelText}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        {...(controlled
          ? { value, onChange: (e) => onValueChange!(e.target.value) }
          : { defaultValue })}
        data-error={error ? "1" : undefined}
        className={`${input} ${error ? "border-red-400" : ""}`}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
