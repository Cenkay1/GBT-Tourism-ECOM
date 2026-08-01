import { prisma } from "@/lib/db";
import { isValidId, isValidPhone, seatNeighbor, genderLabel } from "@/lib/shared";

export const HOLD_MINUTES = 15;

export interface PassengerInput {
  firstName: string;
  lastName: string;
  idNumber?: string;
  seatCode?: string;
  gender?: "E" | "K";
}

export interface CreateBookingInput {
  tourId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  passengers: PassengerInput[];
  seatCodes?: string[]; // KOLTUK turları için
  quantity?: number; // KONTENJAN turları için
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
              where: { tourId: b.tourId, code: { in: seatCodes }, status: "KILITLI" },
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

  // Sunucu tarafı doğrulama (istemci atlanırsa güvenlik için)
  const allowPassport = tour.category === "YURT_DISI";
  if (!isValidPhone(input.contactPhone))
    return { ok: false, error: "Geçerli bir telefon numarası girin." };
  for (const p of input.passengers) {
    if (!p.firstName || !p.lastName)
      return { ok: false, error: "Tüm yolcuların ad ve soyadı zorunludur." };
    if (!p.idNumber || !isValidId(p.idNumber, allowPassport))
      return {
        ok: false,
        error: allowPassport
          ? "Geçerli bir TC Kimlik No (11 hane) veya pasaport no girin."
          : "Geçerli bir TC Kimlik No girin (11 hane).",
      };
  }

  const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

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
        where: { tourId: tour.id, code: { in: codes } },
      });
      if (seats.length !== codes.length)
        return { ok: false as const, error: "Geçersiz koltuk seçimi." };
      const notFree = seats.filter((s) => s.status !== "BOS");
      if (notFree.length > 0)
        return {
          ok: false as const,
          error: `Seçtiğiniz koltuk(lar) az önce dolmuş: ${notFree
            .map((s) => s.code)
            .join(", ")}. Lütfen tekrar seçin.`,
        };

      // Bitişik dolu koltuklarla cinsiyet çakışması var mı?
      const takenSeats = await tx.seat.findMany({
        where: { tourId: tour.id, status: { not: "BOS" } },
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

      const amount = tour.price * codes.length;
      const booking = await tx.booking.create({
        data: {
          tourId: tour.id,
          status: "BEKLIYOR",
          totalAmount: amount,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          quantity: codes.length,
          holdExpiresAt,
          passengers: {
            create: input.passengers.map((p, i) => ({
              firstName: p.firstName,
              lastName: p.lastName,
              idNumber: p.idNumber || null,
              seatCode: codes[i] ?? null,
              gender: p.gender || null,
            })),
          },
        },
      });

      // Koltukları kilitle + cinsiyet yaz (her koltuk kendi cinsiyetiyle)
      for (const code of codes) {
        await tx.seat.updateMany({
          where: { tourId: tour.id, code, status: "BOS" },
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
        OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }],
      },
      select: { quantity: true },
    });
    const used = active.reduce((s, b) => s + b.quantity, 0);
    const left = (tour.capacity ?? 0) - used;
    if (qty > left)
      return {
        ok: false as const,
        error: `Yeterli kontenjan yok. Kalan: ${Math.max(0, left)} kişi.`,
      };

    const amount = tour.price * qty;
    const booking = await tx.booking.create({
      data: {
        tourId: tour.id,
        status: "BEKLIYOR",
        totalAmount: amount,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        quantity: qty,
        holdExpiresAt,
        passengers: {
          create: input.passengers.map((p) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            idNumber: p.idNumber || null,
            gender: p.gender || null,
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
            where: { tourId: booking.tourId, code: { in: seatCodes } },
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
  return { ok: true };
}

// Admin elden/nakit satış: rezervasyonu oluştur, anında ODENDI + koltukları SATILDI yap.
// Koltuk kilitleme / kontenjan / cinsiyet doğrulaması createPendingBooking'ten gelir.
export async function createManualPaidBooking(
  input: CreateBookingInput & { totalOverride?: number | null }
): Promise<CreateResult> {
  const created = await createPendingBooking(input);
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
            where: { tourId: booking.tourId, code: { in: seatCodes }, status: "KILITLI" },
            data: { status: "BOS", gender: null },
          }),
        ]
      : []),
  ]);
}
