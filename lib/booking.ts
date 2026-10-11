import { prisma } from "@/lib/db";
import { isValidIdDocumentName } from "@/lib/id-documents";
import {
  isValidId,
  isValidPhone,
  seatNeighbor,
  genderLabel,
  priceBooking,
  passengerBand,
  decodeRooms,
  roomsTotal,
  assignRooms,
  validateRooms,
  type AgeBand,
  type RoomPlan,
} from "@/lib/shared";

export const HOLD_MINUTES = 15;

export interface PassengerInput {
  firstName: string;
  lastName: string;
  idNumber?: string;
  seatCode?: string;
  gender?: "E" | "K";
  birthDate?: string; // yyyy-mm-dd
  nationality?: "TC" | "FOREIGN";
  country?: string;
  roomIndex?: number; // konaklamalı turda yolcunun odası (0 tabanlı)
  idDocument?: string; // yaş doğrulama belgesi dosya adı (/api/kimlik'ten döner)
}

export interface CreateBookingInput {
  tourId: string;
  departureId?: string; // satın alınan sefer (yoksa en yakın AKTIF sefere düşer)
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  passengers: PassengerInput[];
  seatCodes?: string[]; // KOLTUK turları için
  quantity?: number; // KONTENJAN turları için
  boardingPlaceId?: string; // seçilen biniş durağı (fiyatı buradan belirlenir)
  allowBlocked?: boolean; // acente elden satışı: BLOKE koltuklar da satılabilir
  allowPast?: boolean; // acente elden satışı: tarihi geçmiş (arşiv) sefere de kayıt
  userId?: string; // giriş yapan müşteri (sadakat için; misafirde undefined)
  accommodationType?: "SINGLE" | "MULTI"; // eski akış: konaklamalı turda tek/çok kişi
  rooms?: string; // konaklamalı turda oda dağılımı, "2-1-0|1-0-1"
}

// Eski "SINGLE / MULTI" alanı raporlarda kullanılıyor; oda dağılımı varsa
// tek kişilik oda olup olmadığına göre türetilir.
function accommodationTypeOf(
  legacy: "SINGLE" | "MULTI" | undefined,
  rooms: RoomPlan
): string | null {
  if (rooms.length === 0) return legacy ?? null;
  return rooms.some((n) => n === 1) ? "SINGLE" : "MULTI";
}

export type CreateResult =
  | { ok: true; bookingId: string; amount: number }
  | { ok: false; error: string };

// Süresi dolan bekleyen rezervasyonları iptal edip koltuklarını serbest bırak.
export async function releaseExpiredHolds(): Promise<void> {
  const now = new Date();
  const expired = await prisma.booking.findMany({
    where: { status: "BEKLIYOR", holdExpiresAt: { lt: now } },
    include: { passengers: true, tour: { select: { id: true } } },
  });
  for (const b of expired) {
    const seatCodes = b.passengers
      .map((p) => p.seatCode)
      .filter((c): c is string => !!c);
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: b.id },
        data: { status: "SURE_DOLDU" },
      }),
      ...(seatCodes.length
        ? [
            prisma.seat.updateMany({
              // Koltuklar sefer bazlı: yalnız bu seferin koltukları serbest bırakılır.
              where: {
                tourId: b.tourId,
                ...(b.departureId ? { departureId: b.departureId } : {}),
                code: { in: seatCodes },
                status: "KILITLI",
              },
              data: { status: "BOS", gender: null },
            }),
          ]
        : []),
    ]);
  }
}

// Rezervasyon oluştur: koltukları kilitle / kontenjanı kontrol et, BEKLIYOR kaydı aç.
export async function createPendingBooking(
  input: CreateBookingInput
): Promise<CreateResult> {
  await releaseExpiredHolds();

  const tour = await prisma.tour.findUnique({ where: { id: input.tourId } });
  if (!tour) return { ok: false, error: "Tur bulunamadı." };
  if (tour.status !== "YAYINDA")
    return { ok: false, error: "Bu tur şu anda satışta değil." };

  // Sefer: istemciden gelen id doğrulanır; yoksa satışa açık en yakın sefere düşülür.
  const departure = input.departureId
    ? await prisma.tourDeparture.findFirst({
        where: { id: input.departureId, tourId: tour.id },
      })
    : await prisma.tourDeparture.findFirst({
        where: { tourId: tour.id, status: "AKTIF" },
        orderBy: { departureDate: "asc" },
      });
  if (!departure)
    return { ok: false, error: "Seçilen sefer bulunamadı. Lütfen tekrar seçin." };
  if (departure.status !== "AKTIF")
    return { ok: false, error: "Bu sefer şu anda satışta değil." };
  // Tarihi geçen sefer arşivdedir: online satış kapalıdır. Acente elden satışta
  // (allowPast) geçmiş sefere kayıt girebilir — sonradan işlenen nakit satışlar için.
  if (!input.allowPast && departure.departureDate < new Date())
    return {
      ok: false,
      error: "Bu seferin tarihi geçmiş; satışa kapalıdır. Lütfen başka bir kalkış tarihi seçin.",
    };
  const departureIso = departure.departureDate.toISOString();

  // Sunucu tarafı doğrulama (istemci atlanırsa güvenlik için)
  if (!isValidPhone(input.contactPhone))
    return { ok: false, error: "Geçerli bir telefon numarası girin." };
  for (const p of input.passengers) {
    if (!p.firstName || !p.lastName)
      return { ok: false, error: "Tüm yolcuların ad ve soyadı zorunludur." };
    const foreign = p.nationality === "FOREIGN";
    if (!p.idNumber || !isValidId(p.idNumber, foreign))
      return {
        ok: false,
        error: foreign
          ? "Yabancı yolcular için geçerli bir pasaport no girin."
          : "Geçerli bir TC Kimlik No girin (11 hane).",
      };
    if (foreign && !p.country)
      return { ok: false, error: "Yabancı uyruklu yolcu için ülke seçin." };
  }

  // --- Konaklama: oda dağılımı ve yaş bandı doğrulaması ---
  // Fiyat istemciden DEĞİL, burada yeniden hesaplanır.
  const accommodation =
    tour.hasAccommodation ||
    (await prisma.tourPlace.count({ where: { tourId: tour.id, type: "OTEL" } })) > 0;

  // Yaş grupları YALNIZCA doğum tarihinden hesaplanır (istemciden bildirilen
  // band kabul edilmez) — fiyat ve oda kuralları bu bandlara dayanır.
  const bands: AgeBand[] = input.passengers.map((p) =>
    passengerBand({ birthDate: p.birthDate }, departureIso)
  );

  let rooms: RoomPlan = [];
  if (accommodation) {
    rooms = decodeRooms(input.rooms);
    // Oda bilgisi gönderildiyse ayrıştırılabilmesi zorunlu: bozuk veriyle
    // sessizce eski (oda farkı hesaplamayan) akışa düşülmemeli.
    if (input.rooms?.trim() && rooms.length === 0)
      return { ok: false, error: "Oda bilgisi okunamadı. Lütfen oda seçimini tekrar yapın." };
    if (rooms.length > 0) {
      const roomsErr = validateRooms(rooms, bands);
      if (roomsErr) return { ok: false, error: roomsErr };
      if (roomsTotal(rooms) !== input.passengers.length)
        return {
          ok: false,
          error: `Odalara ${input.passengers.length} kişi yerleştirilmeli (şu an ${roomsTotal(rooms)}).`,
        };
    }
  }

  // Yolcunun odası sunucuda hesaplanır (istemciden gelen değere güvenilmez):
  // her odaya bir yetişkin düşecek şekilde dağıtılır.
  const roomOf = rooms.length > 0 ? assignRooms(rooms, bands) : [];

  // Belge dosya adları istemciden gelir; biçimi doğrulanmayanlar YOK sayılır
  // (dolayısıyla o yolcu tam ücret öder — uydurma ad indirim sağlamaz).
  const docNames = input.passengers.map((p) =>
    p.idDocument && isValidIdDocumentName(p.idDocument) ? p.idDocument : null
  );

  // priceBooking'e verilecek yolcu listesi: doğum tarihi + belge durumu.
  const pricePassengers = input.passengers.map((p, i) => ({
    birthDate: p.birthDate,
    hasIdDocument: Boolean(docNames[i]),
  }));

  const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

  // Biniş durağı bazlı fiyat: seçilen DURAK'ın fiyatı varsa onu kullan, yoksa tur fiyatı.
  let unitPrice = tour.price;
  let boardingName: string | null = null;
  let boardingPlaceId: string | null = null;
  if (input.boardingPlaceId) {
    const place = await prisma.tourPlace.findFirst({
      where: { id: input.boardingPlaceId, tourId: tour.id, type: "BINIS" },
    });
    if (place) {
      boardingName = place.name;
      // Biniş saati gibi bilgiler zamanla güncellenebildiği için noktanın
      // id'si de saklanır; bildirimler güncel saati buradan okur.
      boardingPlaceId = place.id;
      if (place.price != null) unitPrice = place.price;
    }
  }
  // İzin verilen koltuk durumları (elden satışta BLOKE koltuklar da satılabilir).
  const sellableStatuses = input.allowBlocked ? ["BOS", "BLOKE"] : ["BOS"];

  if (tour.bookingType === "KOLTUK") {
    const codes = input.seatCodes ?? [];
    if (codes.length === 0)
      return { ok: false, error: "Koltuk seçilmedi." };

    // Koltuk → cinsiyet eşlemesi (yolculardan)
    const genderByCode: Record<string, "E" | "K"> = {};
    for (const p of input.passengers) {
      if (p.seatCode && (p.gender === "E" || p.gender === "K"))
        genderByCode[p.seatCode] = p.gender;
    }
    const layout = tour.seatLayout ?? "2+2";

    // Seçilen koltukların hepsi BOŞ mu? + yan yana cinsiyet kuralı. Atomik kilitleme.
    const result = await prisma.$transaction(async (tx) => {
      const seats = await tx.seat.findMany({
        where: { tourId: tour.id, departureId: departure.id, code: { in: codes } },
      });
      if (seats.length !== codes.length)
        return { ok: false as const, error: "Geçersiz koltuk seçimi." };
      const notFree = seats.filter((s) => !sellableStatuses.includes(s.status));
      if (notFree.length > 0)
        return {
          ok: false as const,
          error: `Seçtiğiniz koltuk(lar) az önce dolmuş: ${notFree
            .map((s) => s.code)
            .join(", ")}. Lütfen tekrar seçin.`,
        };

      // Bitişik dolu koltuklarla cinsiyet çakışması var mı?
      const takenSeats = await tx.seat.findMany({
        where: { tourId: tour.id, departureId: departure.id, status: { not: "BOS" } },
        select: { code: true, gender: true },
      });
      const takenGender: Record<string, string | null> = {};
      for (const t of takenSeats) takenGender[t.code] = t.gender;
      const selectedSet = new Set(codes);

      for (const code of codes) {
        const g = genderByCode[code];
        if (!g)
          return { ok: false as const, error: `${code} için cinsiyet belirtilmedi.` };
        const neighbor = seatNeighbor(code, layout);
        if (neighbor && !selectedSet.has(neighbor)) {
          const ng = takenGender[neighbor];
          if (ng && ng !== g)
            return {
              ok: false as const,
              error: `${neighbor} koltuğunda ${genderLabel(ng)} yolcu olduğundan ${code} koltuğunu ${genderLabel(g)} olarak alamazsınız (yan yana farklı cinsiyet oturamaz).`,
            };
        }
      }

      const amount = priceBooking({
        unitPrice,
        departureDate: departureIso,
        passengers: pricePassengers,
        rooms: rooms.length ? rooms : undefined,
        accommodationType: input.accommodationType,
        singleSupplement: tour.singleSupplement,
      }).total;
      const booking = await tx.booking.create({
        data: {
          tourId: tour.id,
          departureId: departure.id,
          status: "BEKLIYOR",
          totalAmount: amount,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          quantity: codes.length,
          boardingName,
          boardingPlaceId,
          accommodationType: accommodationTypeOf(input.accommodationType, rooms),
          rooms: rooms.length ? input.rooms ?? null : null,
          userId: input.userId ?? null,
          holdExpiresAt,
          passengers: {
            create: input.passengers.map((p, i) => ({
              firstName: p.firstName,
              lastName: p.lastName,
              idNumber: p.idNumber || null,
              seatCode: codes[i] ?? null,
              gender: p.gender || null,
              birthDate: p.birthDate ? new Date(p.birthDate) : null,
              nationality: p.nationality === "FOREIGN" ? "FOREIGN" : "TC",
              country: p.nationality === "FOREIGN" ? p.country || null : "Türkiye",
              // Yaş grubu ve oda, doğum tarihi + oda planından türetilir.
              ageBand: bands[i],
              roomIndex: roomOf[i] ?? null,
              idDocument: docNames[i],
            })),
          },
        },
      });

      // Koltukları kilitle + cinsiyet yaz (her koltuk kendi cinsiyetiyle)
      for (const code of codes) {
        await tx.seat.updateMany({
          where: {
            tourId: tour.id,
            departureId: departure.id,
            code,
            status: { in: sellableStatuses },
          },
          data: { status: "KILITLI", gender: genderByCode[code] },
        });
      }

      return { ok: true as const, bookingId: booking.id, amount };
    });
    return result;
  }

  // KONTENJAN
  const qty = input.quantity ?? input.passengers.length;
  if (qty < 1) return { ok: false, error: "Kişi sayısı geçersiz." };

  const result = await prisma.$transaction(async (tx) => {
    const active = await tx.booking.findMany({
      where: {
        tourId: tour.id,
        departureId: departure.id,
        OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }],
      },
      select: { quantity: true },
    });
    const used = active.reduce((s, b) => s + b.quantity, 0);
    // Kontenjan sefer bazlıdır; sefere özel değer yoksa turun kontenjanı geçerli.
    const left = (departure.capacity ?? tour.capacity ?? 0) - used;
    if (qty > left)
      return {
        ok: false as const,
        error: `Yeterli kontenjan yok. Kalan: ${Math.max(0, left)} kişi.`,
      };

    const amount = priceBooking({
      unitPrice,
      departureDate: departureIso,
      passengers: pricePassengers,
      rooms: rooms.length ? rooms : undefined,
      accommodationType: input.accommodationType,
      singleSupplement: tour.singleSupplement,
    }).total;
    const booking = await tx.booking.create({
      data: {
        tourId: tour.id,
        departureId: departure.id,
        status: "BEKLIYOR",
        totalAmount: amount,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        quantity: qty,
        boardingName,
        boardingPlaceId,
        accommodationType: accommodationTypeOf(input.accommodationType, rooms),
        rooms: rooms.length ? input.rooms ?? null : null,
        userId: input.userId ?? null,
        holdExpiresAt,
        passengers: {
          create: input.passengers.map((p, i) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            idNumber: p.idNumber || null,
            gender: p.gender || null,
            birthDate: p.birthDate ? new Date(p.birthDate) : null,
            nationality: p.nationality === "FOREIGN" ? "FOREIGN" : "TC",
            country: p.nationality === "FOREIGN" ? p.country || null : "Türkiye",
            ageBand: bands[i],
            roomIndex: roomOf[i] ?? null,
            idDocument: docNames[i],
          })),
        },
      },
    });
    return { ok: true as const, bookingId: booking.id, amount };
  });
  return result;
}

// Ödeme başarılı: koltukları SATILDI yap, rezervasyonu ODENDI yap.
export async function markBookingPaid(
  bookingId: string,
  paymentRef: string,
  opts?: { notify?: boolean; paymentMethod?: string }
): Promise<{ ok: boolean; error?: string }> {
  const notify = opts?.notify ?? true;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { passengers: true },
  });
  if (!booking) return { ok: false, error: "Rezervasyon bulunamadı." };
  if (booking.status === "ODENDI") return { ok: true };
  if (booking.status !== "BEKLIYOR")
    return { ok: false, error: "Rezervasyon süresi dolmuş. Lütfen tekrar deneyin." };
  if (booking.holdExpiresAt && booking.holdExpiresAt < new Date())
    return { ok: false, error: "Ödeme süresi doldu. Lütfen tekrar deneyin." };

  const seatCodes = booking.passengers
    .map((p) => p.seatCode)
    .filter((c): c is string => !!c);

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "ODENDI",
        paymentRef,
        ...(opts?.paymentMethod ? { paymentMethod: opts.paymentMethod } : {}),
      },
    }),
    ...(seatCodes.length
      ? [
          prisma.seat.updateMany({
            where: {
              tourId: booking.tourId,
              ...(booking.departureId ? { departureId: booking.departureId } : {}),
              code: { in: seatCodes },
            },
            data: { status: "SATILDI" },
          }),
        ]
      : []),
  ]);

  // Onay bildirimi (SMS + e-posta) — best-effort, ödemeyi bloklamaz.
  if (notify) {
    try {
      const { sendBookingConfirmation } = await import("@/lib/notifications");
      await sendBookingConfirmation(bookingId);
    } catch (e) {
      console.error("[Onay bildirimi hatası]", e);
    }
  }

  // Çocuk/bebek varsa acenteye yaş onayı bildirimi — elden satışta da gider
  // (görevli yaşı panelden onaylar). Best-effort.
  try {
    const { sendAgeVerificationRequest } = await import("@/lib/notifications");
    await sendAgeVerificationRequest(bookingId);
  } catch (e) {
    console.error("[Yaş onayı bildirimi hatası]", e);
  }

  // Sadakat puanı (giriş yapmış müşteriye) — idempotent, best-effort, ödemeyi bloklamaz.
  try {
    const { awardLoyaltyForBooking } = await import("@/lib/loyalty");
    await awardLoyaltyForBooking(bookingId);
  } catch (e) {
    console.error("[Sadakat puanı hatası]", e);
  }
  return { ok: true };
}

// Admin elden/nakit satış: rezervasyonu oluştur, anında ODENDI + koltukları SATILDI yap.
// Koltuk kilitleme / kontenjan / cinsiyet doğrulaması createPendingBooking'ten gelir.
export async function createManualPaidBooking(
  input: CreateBookingInput & { totalOverride?: number | null }
): Promise<CreateResult> {
  // Acente elden satışı: online satışa kapatılmış (BLOKE) koltuklar satılabilir ve
  // tarihi geçmiş sefere de kayıt girilebilir (sonradan işlenen satışlar).
  const created = await createPendingBooking({
    ...input,
    allowBlocked: true,
    allowPast: true,
  });
  if (!created.ok) return created;

  const paid = await markBookingPaid(created.bookingId, "NAKIT", {
    notify: false,
    paymentMethod: "NAKIT",
  });
  if (!paid.ok) {
    // Ödeme işaretlenemezse kilitli koltukları serbest bırak.
    await cancelBooking(created.bookingId);
    return { ok: false, error: paid.error ?? "Satış kaydedilemedi." };
  }

  // İsteğe bağlı elle tutar (indirim/pazarlık).
  if (
    input.totalOverride != null &&
    Number.isFinite(input.totalOverride) &&
    input.totalOverride >= 0
  ) {
    await prisma.booking.update({
      where: { id: created.bookingId },
      data: { totalAmount: Math.round(input.totalOverride) },
    });
    return {
      ok: true,
      bookingId: created.bookingId,
      amount: Math.round(input.totalOverride),
    };
  }

  return created;
}

// Ödeme iptal/başarısız: koltukları serbest bırak, rezervasyonu iptal et.
// DİKKAT: bu fonksiyon YALNIZ ödeme akışı iptali içindir — sadece KILITLI
// koltukları açar ve ödenmiş (SATILDI) rezervasyona dokunmaz. Görevli
// iptali için cancelBookingByAdmin kullanılmalı; aksi halde ödenmiş koltuk
// sonsuza dek dolu kalır (düzeltilen hata geri gelir).
export async function cancelBooking(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { passengers: true },
  });
  if (!booking || booking.status === "ODENDI") return;

  const seatCodes = booking.passengers
    .map((p) => p.seatCode)
    .filter((c): c is string => !!c);

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "IPTAL" },
    }),
    ...(seatCodes.length
      ? [
          prisma.seat.updateMany({
            where: {
              tourId: booking.tourId,
              ...(booking.departureId ? { departureId: booking.departureId } : {}),
              code: { in: seatCodes },
              status: "KILITLI",
            },
            data: { status: "BOS", gender: null },
          }),
        ]
      : []),
  ]);
}

// Görevli tarafından iptal: koltukları DURUMU NE OLURSA OLSUN serbest bırakır,
// rezervasyonu IPTAL'e çeker, sadakat puanını geri alır ve müşteriye bildirir.
//
// cancelBooking()'den farkı: o yalnız KILITLI koltukları açıyor ve ödenmiş
// rezervasyona hiç dokunmuyor (ödeme akışının iptali için doğru davranış).
// Burada ödenmiş rezervasyonun SATILDI koltukları da boşa alınmalı — yoksa
// koltuk sonsuza kadar dolu kalır.
export async function cancelBookingByAdmin(
  bookingId: string,
  reason: string,
  opts?: { refundAmount?: number; notify?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "İptal nedeni yazılmalı." };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { passengers: true },
  });
  if (!booking) return { ok: false, error: "Rezervasyon bulunamadı." };

  // Erken çıkış (idempotent kontrolü) kasıtlı olarak yan etkilerden SONRAYA
  // alındı. Eskiden "zaten IPTAL" durumunda fonksiyon burada dönüyordu; ama
  // transaction (koltuk boşaltma) tamamlanıp süreç/istek yan etkilerden ÖNCE
  // kesilirse (çökme, e-posta sunucusu patlaması vb.) ikinci deneme bu erken
  // çıkışa takılıp puan geri alma + e-postayı SONSUZA DEK atlıyordu — ve bunu
  // düzeltmenin hiçbir yolu kalmıyordu. Şimdi: rezervasyon zaten IPTAL ise
  // transaction'ı (koltuklar zaten boş, tekrar yazmaya gerek yok) atlıyoruz
  // ama yan etkileri her zaman çalıştırıyoruz — her ikisi de kendi içinde
  // idempotent (puan: loyaltyAwardedAt koruması; e-posta: tekrar gitmesi
  // "hiç gitmemiş" olmaktan daha güvenli).
  if (booking.status !== "IPTAL") {
    const seatCodes = booking.passengers
      .map((p) => p.seatCode)
      .filter((c): c is string => !!c);

    await prisma.$transaction([
      prisma.booking.update({ where: { id: bookingId }, data: { status: "IPTAL" } }),
      ...(seatCodes.length
        ? [
            prisma.seat.updateMany({
              // Yalnız bu rezervasyonun seferindeki koltuklar; aynı kod başka
              // seferde başka müşteride olabilir. departureId null ise
              // koşullu yayılım YERİNE doğrudan null eşitliği kullanılır:
              // aksi halde turun TÜM seferlerindeki aynı kodlu koltuklar
              // yakalanır — başka müşterinin koltuğuna asla dokunulmamalı.
              where: {
                tourId: booking.tourId,
                departureId: booking.departureId,
                code: { in: seatCodes },
              },
              data: { status: "BOS", gender: null },
            }),
          ]
        : []),
    ]);
  }

  // Puan geri alımı — best-effort, iptali bloklamaz.
  try {
    const { revokeLoyaltyForBooking } = await import("@/lib/loyalty");
    await revokeLoyaltyForBooking(bookingId);
  } catch (e) {
    console.error("[Sadakat puanı geri alma hatası]", e);
  }

  if (opts?.notify !== false) {
    try {
      const { sendBookingCancellation } = await import("@/lib/notifications");
      await sendBookingCancellation(bookingId, trimmed, opts?.refundAmount != null ? { refundAmount: opts.refundAmount } : undefined);
    } catch (e) {
      console.error("[İptal bildirimi hatası]", e);
    }
  }

  return { ok: true };
}
