// Rezervasyon devri — bir yolcunun yerini başka kişiye bırakması.
//
// İki biçim:
//   • AYNI tura devir: yolcu satırı yerinde güncellenir, koltuk ve tutar
//     korunur. Aynı yaş bandı şartı sayesinde fiyat hiç değişmez.
//   • BAŞKA tura devir: hedef turda YENİ rezervasyon açılır, devredilen tutar
//     oraya tahsilat olarak aktarılır, kaynak rezervasyondan yolcu çıkarılır.
//     Fiyat farkı borç (müşteri öder) ya da iade (acente öder) olur.
//
// Yetki kontrolü ve önbellek tazeleme burada DEĞİL, sarmalayıcı server
// action'larda (lib/transfer-actions.ts ve lib/admin-actions.ts).
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  allowedGendersFor,
  genderBlockMessage,
  parseSeatMap,
  isValidId,
  isValidPhone,
  balanceOf,
  balanceDueDateFor,
  depositAvailableFor,
  passengerBand,
  type Gender,
  type AgeBand,
} from "@/lib/shared";
import { recordCollection, type CollectionMethod } from "@/lib/collections";

// Müşteri ve admin için ORTAK sınır: kalkışa bu süreden az kaldıysa devir
// yapılamaz. Yolcu listesi otele/manifest'e gitmiş olabilir ve son saatlerde
// yapılan değişiklik otobüste karışıklık yaratır.
export const TRANSFER_CUTOFF_HOURS = 24;

export interface TransferTarget {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: Gender;
  idNumber: string;
  nationality?: "TC" | "FOREIGN";
  country?: string;
  birthDate?: string; // yyyy-mm-dd
}

export interface TransferInput {
  bookingId: string;
  passengerId: string;
  to: TransferTarget;
  // Cinsiyet kuralı yüzünden koltuk değiştirilecekse yeni koltuk.
  newSeatCode?: string;
  // BAŞKA tura devir: hedef tur ve sefer.
  targetTourId?: string;
  targetDepartureId?: string;
  actor: "MUSTERI" | "ADMIN";
  actorEmail: string;
  note?: string;
}

export type TransferResult =
  | {
      ok: true;
      transferId: string;
      priceDifference: number;
      differenceToken?: string | null;
      targetBookingId?: string | null;
      ownershipMoved: boolean;
    }
  | { ok: false; error: string; suggestedSeats?: string[] };

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function isEmailLike(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// Devredilebilirlik: tek yerde, hem müşteri hem admin için AYNI kurallar.
// Admin muafiyeti YOK — son dakikada yapılan devir otobüste karışıklık
// yaratıyor ve açık bakiyeli devir "kim ne kadar borçlu" sorusunu bulanıklaştırıyor.
export async function canTransferBooking(
  bookingId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { departure: { select: { departureDate: true } }, tour: { select: { departureDate: true } } },
  });
  if (!booking) return { ok: false, error: "Rezervasyon bulunamadı." };

  if (booking.status !== "ODENDI")
    return {
      ok: false,
      error: "Yalnız ödemesi tamamlanmış (onaylanmış) rezervasyonlar devredilebilir.",
    };

  if (balanceOf(booking.totalAmount, booking.paidAmount) > 0)
    return {
      ok: false,
      error:
        "Bu rezervasyonun açık bakiyesi var. Devir için önce kalan ödemenin tamamlanması gerekiyor.",
    };

  const departureDate = booking.departure?.departureDate ?? booking.tour.departureDate;
  const hoursLeft = (departureDate.getTime() - Date.now()) / 3600000;
  if (hoursLeft < TRANSFER_CUTOFF_HOURS)
    return {
      ok: false,
      error: `Kalkışa ${TRANSFER_CUTOFF_HOURS} saatten az kaldığı için devir yapılamaz. Lütfen acentemizle iletişime geçin.`,
    };

  return { ok: true };
}

// Devredilen kişinin bilgileri geçerli mi.
function validateTarget(to: TransferTarget): string | null {
  if (!to.firstName?.trim() || to.firstName.trim().length < 2)
    return "Devredilen kişinin adını yazın.";
  if (!to.lastName?.trim() || to.lastName.trim().length < 2)
    return "Devredilen kişinin soyadını yazın.";
  if (!isEmailLike(to.email?.trim() ?? ""))
    return "Devredilen kişinin geçerli bir e-posta adresini yazın — bilet bilgileri oraya gönderilecek.";
  if (!isValidPhone(to.phone?.trim() ?? ""))
    return "Devredilen kişinin geçerli bir cep telefonunu yazın: 0(5xx) xxx xx xx";
  if (to.gender !== "E" && to.gender !== "K")
    return "Devredilen kişinin cinsiyetini seçin.";
  const nat = to.nationality ?? "TC";
  // TC uyrukluda 11 haneli geçerli kimlik no; yabancıda pasaport da kabul.
  if (!isValidId(to.idNumber?.trim() ?? "", nat === "FOREIGN"))
    return nat === "FOREIGN"
      ? "Geçerli bir pasaport numarası girin."
      : "Geçerli bir TC Kimlik No girin (11 hane).";
  return null;
}

// Bir seferin etkin koltuk düzeni (sefer otobüsü > tur otobüsü).
async function layoutOf(departureId: string | null, tourBusId: string | null, tourLayout: string | null) {
  const dep = departureId
    ? await prisma.tourDeparture.findUnique({
        where: { id: departureId },
        select: { busId: true },
      })
    : null;
  const busId = dep?.busId ?? tourBusId;
  const bus = busId ? await prisma.bus.findUnique({ where: { id: busId } }) : null;
  return {
    seatMap: parseSeatMap(bus?.seatMap),
    layout: bus?.seatLayout ?? tourLayout ?? "2+2",
  };
}

// Verilen cinsiyete uygun BOŞ koltuklar — cinsiyet çakışmasında öneri için.
async function suggestSeats(
  departureId: string,
  src: { seatMap: string[][] | null; layout: string },
  gender: Gender,
  exclude: Set<string>,
  limit = 8
): Promise<string[]> {
  const seats = await prisma.seat.findMany({
    where: { departureId },
    select: { code: true, status: true, gender: true },
    orderBy: { code: "asc" },
  });
  const takenGenders: Record<string, Gender> = {};
  for (const s of seats) {
    if ((s.status === "SATILDI" || s.status === "KILITLI") && (s.gender === "E" || s.gender === "K"))
      takenGenders[s.code] = s.gender;
  }
  const out: string[] = [];
  for (const s of seats) {
    if (s.status !== "BOS") continue;
    const rule = allowedGendersFor(s.code, src, takenGenders, exclude);
    if (rule[gender]) out.push(s.code);
    if (out.length >= limit) break;
  }
  return out;
}

// Bir yolcunun bu rezervasyondaki ücret payı.
//
// Tutar yolcu başına eşit bölünmez: yaş indirimi ve tek kişi farkı yüzünden
// yolcuların payı farklıdır. Ama devirde AYNI yaş bandı şartı olduğu için
// devredilen kişinin payı değişmez; başka tura devirde bu pay aktarılıyor.
// Pay, rezervasyonun yolcu sayısına bölünerek hesaplanıyor — tek yolculu
// rezervasyonda tam tutar, çok yolculuda eşit pay. Daha hassas bir dağıtım
// priceBooking'i yolcu başına çözmeyi gerektirir; devirde fark zaten elle
// onaylandığı için bu yaklaşım yeterli ve şeffaf.
function shareOf(totalAmount: number, passengerCount: number): number {
  if (passengerCount <= 0) return 0;
  return Math.round(totalAmount / passengerCount);
}

export async function transferPassenger(input: TransferInput): Promise<TransferResult> {
  const eligible = await canTransferBooking(input.bookingId);
  if (!eligible.ok) return { ok: false, error: eligible.error };

  const invalid = validateTarget(input.to);
  if (invalid) return { ok: false, error: invalid };

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      passengers: true,
      tour: true,
      departure: { select: { id: true, departureDate: true } },
    },
  });
  if (!booking) return { ok: false, error: "Rezervasyon bulunamadı." };

  const passenger = booking.passengers.find((p) => p.id === input.passengerId);
  if (!passenger)
    return { ok: false, error: "Yolcu bu rezervasyona ait değil." };

  const departureDate = booking.departure?.departureDate ?? booking.tour.departureDate;
  const departureIso = departureDate.toISOString();

  // --- Yaş bandı şartı ---------------------------------------------------
  // Devirde tutar DEĞİŞMEMELİ (aynı tura devirde), bu yüzden yeni kişinin
  // yaş bandı eskisiyle aynı olmalı. Farklıysa iptal + yeni satış gerekir.
  const oldBand: AgeBand =
    (passenger.ageBand as AgeBand | null) ??
    passengerBand({ birthDate: passenger.birthDate?.toISOString() ?? null }, departureIso);
  const newBand = passengerBand({ birthDate: input.to.birthDate ?? null }, departureIso);
  if (oldBand !== newBand)
    return {
      ok: false,
      error:
        "Devredilen kişinin yaş grubu mevcut yolcuyla aynı olmalı (fiyat değişiyor). Bu durumda devir yapılamaz; rezervasyonun iptal edilip yeni satış açılması gerekir.",
    };

  // --- Koltuk ve cinsiyet kuralı -----------------------------------------
  const isSeatTour = booking.tour.bookingType === "KOLTUK";
  const crossTour = Boolean(input.targetTourId && input.targetTourId !== booking.tourId);
  let finalSeat = passenger.seatCode;

  if (isSeatTour && !crossTour) {
    const src = await layoutOf(booking.departureId, booking.tour.busId, booking.tour.seatLayout);
    const seats = await prisma.seat.findMany({
      where: { departureId: booking.departureId },
      select: { code: true, status: true, gender: true },
    });
    const takenGenders: Record<string, Gender> = {};
    for (const s of seats) {
      if ((s.status === "SATILDI" || s.status === "KILITLI") && (s.gender === "E" || s.gender === "K"))
        takenGenders[s.code] = s.gender;
    }
    // Aynı rezervasyondaki yolcuların koltukları kuralı bağlamaz.
    const partySeats = new Set(
      booking.passengers.map((p) => p.seatCode).filter((c): c is string => Boolean(c))
    );

    const targetSeat = input.newSeatCode?.trim() || passenger.seatCode;
    if (targetSeat) {
      const rule = allowedGendersFor(targetSeat, src, takenGenders, partySeats);
      const blocked = genderBlockMessage(targetSeat, input.to.gender, rule);
      if (blocked) {
        const suggested = await suggestSeats(
          booking.departureId!,
          src,
          input.to.gender,
          partySeats
        );
        return { ok: false, error: blocked, suggestedSeats: suggested };
      }
      finalSeat = targetSeat;
    }
  }

  // Devredilenin hesabı (e-postası doğrulanmış bir üyeye aitse).
  const toEmail = input.to.email.trim().toLowerCase();
  const toUser = await prisma.user.findUnique({
    where: { email: toEmail },
    select: { id: true, emailVerified: true, active: true },
  });
  const toUserId = toUser?.emailVerified && toUser.active ? toUser.id : null;

  const passengerShare = shareOf(booking.totalAmount, booking.passengers.length);

  // --- BAŞKA tura devir --------------------------------------------------
  if (crossTour) {
    return transferToAnotherTour({
      input,
      booking,
      passenger,
      passengerShare,
      toUserId,
      finalSeat,
    });
  }

  // --- AYNI tura devir ---------------------------------------------------
  const nat = input.to.nationality ?? "TC";
  const ownershipMoved = await prisma.$transaction(async (tx) => {
    // Yolcu satırı YERİNDE güncellenir: koltuk, oda ve yaş bandı korunur.
    // idDocument/ageVerified sıfırlanır — eski kişinin belgesi yeni kişiyi
    // doğrulamaz.
    await tx.passenger.update({
      where: { id: passenger.id },
      data: {
        firstName: input.to.firstName.trim(),
        lastName: input.to.lastName.trim(),
        idNumber: input.to.idNumber.trim(),
        gender: input.to.gender,
        birthDate: input.to.birthDate ? new Date(input.to.birthDate) : null,
        nationality: nat,
        country: nat === "FOREIGN" ? input.to.country?.trim() || null : "Türkiye",
        seatCode: finalSeat,
        idDocument: null,
        ageVerified: false,
      },
    });

    // Koltuk değiştiyse eskisini bırak, yenisini kendi cinsiyetiyle tut.
    if (isSeatTour && finalSeat !== passenger.seatCode) {
      if (passenger.seatCode) {
        await tx.seat.updateMany({
          where: { departureId: booking.departureId, code: passenger.seatCode },
          data: { status: "BOS", gender: null, holdToken: null, holdExpiresAt: null },
        });
      }
      if (finalSeat) {
        await tx.seat.updateMany({
          where: { departureId: booking.departureId, code: finalSeat },
          data: { status: "SATILDI", gender: input.to.gender },
        });
      }
    } else if (isSeatTour && finalSeat) {
      // Koltuk aynı ama cinsiyet değişmiş olabilir.
      await tx.seat.updateMany({
        where: { departureId: booking.departureId, code: finalSeat },
        data: { gender: input.to.gender },
      });
    }

    await tx.bookingTransfer.create({
      data: {
        bookingId: booking.id,
        passengerId: passenger.id,
        seatCode: finalSeat,
        fromFirstName: passenger.firstName,
        fromLastName: passenger.lastName,
        fromIdNumber: passenger.idNumber,
        fromEmail: booking.contactEmail,
        fromUserId: booking.userId,
        toFirstName: input.to.firstName.trim(),
        toLastName: input.to.lastName.trim(),
        toEmail,
        toPhone: input.to.phone.trim(),
        toUserId,
        priceDifference: 0, // aynı tur + aynı yaş bandı → fark yok
        differenceStatus: "YOK",
        actor: input.actor,
        actorEmail: input.actorEmail,
        note: input.note?.trim() ?? "",
      },
    });

    // --- Sahiplik geçişi -------------------------------------------------
    // Mevcut sahibe bağlı yolcu kalmadıysa sahiplik de geçer. Ölçüt:
    // ownerSince'tan SONRA devredilmemiş yolcu sayısı sıfır. Strict ">"
    // zincirleme devirlerde (A→B→C) doğru sonuç verir.
    const since = booking.ownerSince ?? booking.createdAt;
    const transfers = await tx.bookingTransfer.findMany({
      where: { bookingId: booking.id, createdAt: { gt: since } },
      select: { passengerId: true },
    });
    const movedIds = new Set(transfers.map((t) => t.passengerId));
    const stillOwned = booking.passengers.filter((p) => !movedIds.has(p.id));

    if (stillOwned.length === 0) {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          userId: toUserId,
          contactName: `${input.to.firstName.trim()} ${input.to.lastName.trim()}`,
          contactEmail: toEmail,
          contactPhone: input.to.phone.trim(),
          ownerSince: new Date(),
        },
      });
      await tx.bookingTransfer.updateMany({
        where: { bookingId: booking.id, createdAt: { gt: since } },
        data: { ownershipMoved: true },
      });
      return true;
    }
    return false;
  });

  const created = await prisma.bookingTransfer.findFirst({
    where: { bookingId: booking.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return {
    ok: true,
    transferId: created!.id,
    priceDifference: 0,
    differenceToken: null,
    targetBookingId: null,
    ownershipMoved,
  };
}

// BAŞKA tura devir — hedef turda yeni rezervasyon açılır.
async function transferToAnotherTour(args: {
  input: TransferInput;
  booking: {
    id: string;
    tourId: string;
    departureId: string | null;
    totalAmount: number;
    paidAmount: number;
    contactEmail: string;
    userId: string | null;
    quantity: number;
    accommodationType: string | null;
    passengers: { id: string; seatCode: string | null; firstName: string; lastName: string; idNumber: string | null }[];
    tour: { bookingType: string };
  };
  passenger: { id: string; seatCode: string | null; firstName: string; lastName: string; idNumber: string | null; birthDate: Date | null; ageBand: string | null };
  passengerShare: number;
  toUserId: string | null;
  finalSeat: string | null;
}): Promise<TransferResult> {
  const { input, booking, passenger, passengerShare, toUserId } = args;

  const targetDeparture = await prisma.tourDeparture.findFirst({
    where: { id: input.targetDepartureId ?? "", tourId: input.targetTourId ?? "" },
    include: { tour: true },
  });
  if (!targetDeparture)
    return { ok: false, error: "Hedef sefer bulunamadı." };
  if (targetDeparture.status !== "AKTIF")
    return { ok: false, error: "Hedef sefer satışa kapalı." };
  if (targetDeparture.departureDate.getTime() - Date.now() < TRANSFER_CUTOFF_HOURS * 3600000)
    return {
      ok: false,
      error: `Hedef seferin kalkışına ${TRANSFER_CUTOFF_HOURS} saatten az kalmış; bu sefere devir yapılamaz.`,
    };

  const targetTour = targetDeparture.tour;

  // Hedefte yer var mı? KOLTUK turunda boş koltuk, KONTENJAN'da kalan yer.
  if (targetTour.bookingType === "KOLTUK") {
    const free = await prisma.seat.count({
      where: { departureId: targetDeparture.id, status: "BOS" },
    });
    if (free === 0)
      return { ok: false, error: "Hedef seferde boş koltuk yok." };
  } else {
    const capacity = targetDeparture.capacity ?? targetTour.capacity ?? 0;
    const rows = await prisma.booking.findMany({
      where: {
        departureId: targetDeparture.id,
        OR: [{ status: "ODENDI" }, { status: "BEKLIYOR" }],
      },
      select: { quantity: true },
    });
    const sold = rows.reduce((t, r) => t + r.quantity, 0);
    if (capacity - sold < 1)
      return { ok: false, error: "Hedef seferde yeterli kontenjan/yer yok." };
  }

  // Yeni tutar: hedef turun kişi başı fiyatı. Yaş bandı aynı olduğu için
  // indirim durumu değişmiyor; fark yalnız tur fiyatından geliyor.
  const newAmount = targetTour.price;
  const priceDifference = newAmount - passengerShare;

  // 5 gün kuralı: hedef kalkışa 5 günden az kaldıysa taksit/ön ödeme yok,
  // fark peşin istenir (lib/shared.ts depositAvailableFor ile aynı kural).
  const canDefer = depositAvailableFor(targetDeparture.departureDate);
  const balanceDueAt =
    priceDifference > 0 && canDefer
      ? balanceDueDateFor(targetDeparture.departureDate, targetTour.balanceDueDays)
      : null;

  const nat = input.to.nationality ?? "TC";
  const differenceToken = priceDifference > 0 ? newToken() : null;

  const result = await prisma.$transaction(async (tx) => {
    // Hedefte yeni rezervasyon. Devredilen tutar TAHSİLAT DEFTERİNE aktarılıyor
    // (aşağıda Collection satırı): para kasada zaten var, yeniden tahsil
    // edilmiyor. paidAmount defterin toplamıdır (lib/collections.ts), bu
    // yüzden satır yazılmadan paidAmount'a değer yazmak kalıcı olmaz — ilk
    // tahsilatta defterden yeniden hesaplanıp kaybolur.
    //
    // Tutar KIRPILMIYOR: hedef tur daha ucuzsa paidAmount > totalAmount olur
    // ve bu DOĞRU durumdur — fazla para kasada ve müşteriye borçluyuz. İade
    // işaretlenince eksi satırla kapanır.
    const target = await tx.booking.create({
      data: {
        tourId: targetTour.id,
        departureId: targetDeparture.id,
        status: "ODENDI",
        totalAmount: newAmount,
        paidAmount: passengerShare,
        contactName: `${input.to.firstName.trim()} ${input.to.lastName.trim()}`,
        contactEmail: input.to.email.trim().toLowerCase(),
        contactPhone: input.to.phone.trim(),
        quantity: 1,
        paymentMethod: "HAVALE",
        userId: toUserId,
        ownerSince: new Date(),
        balanceDueAt,
        balanceToken: priceDifference > 0 ? newToken() : null,
        passengers: {
          create: [
            {
              firstName: input.to.firstName.trim(),
              lastName: input.to.lastName.trim(),
              idNumber: input.to.idNumber.trim(),
              gender: input.to.gender,
              birthDate: input.to.birthDate ? new Date(input.to.birthDate) : null,
              nationality: nat,
              country: nat === "FOREIGN" ? input.to.country?.trim() || null : "Türkiye",
              ageBand: passenger.ageBand,
            },
          ],
        },
      },
    });

    // Devredilen tutarın tahsilat satırı: "nereden geldi" bilgisi kasada
    // izlenebilir kalsın. paidAmount bu defterden türetiliyor.
    await tx.collection.create({
      data: {
        bookingId: target.id,
        amount: passengerShare,
        method: "HAVALE",
        note: `Devirden aktarıldı (kaynak rezervasyon ${booking.id.slice(-8).toUpperCase()})`,
      },
    });

    // Kaynak rezervasyondan yolcuyu çıkar ve koltuğunu serbest bırak.
    if (passenger.seatCode) {
      await tx.seat.updateMany({
        where: { departureId: booking.departureId, code: passenger.seatCode },
        data: { status: "BOS", gender: null, holdToken: null, holdExpiresAt: null },
      });
    }
    await tx.passenger.delete({ where: { id: passenger.id } });

    // Kaynak rezervasyonun tutarı ve kişi sayısı düşer. Son yolcu da
    // gittiyse rezervasyon iptale alınır: içi boş "ödenmiş" kayıt kalmasın.
    const remaining = booking.passengers.length - 1;
    if (remaining <= 0) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "IPTAL", quantity: 0 },
      });
    } else {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          quantity: remaining,
          totalAmount: Math.max(0, booking.totalAmount - passengerShare),
          paidAmount: Math.max(0, booking.paidAmount - passengerShare),
        },
      });
      // Kaynak rezervasyonun defterine EKSİ satır: o para artık hedef
      // rezervasyonda. İki tarafın toplamı korunuyor, para üretilmiyor.
      await tx.collection.create({
        data: {
          bookingId: booking.id,
          amount: -passengerShare,
          method: "HAVALE",
          note: `Devirle aktarıldı (hedef rezervasyon ${target.id.slice(-8).toUpperCase()})`,
        },
      });
    }

    const transfer = await tx.bookingTransfer.create({
      data: {
        bookingId: booking.id,
        targetBookingId: target.id,
        passengerId: passenger.id,
        seatCode: passenger.seatCode,
        fromFirstName: passenger.firstName,
        fromLastName: passenger.lastName,
        fromIdNumber: passenger.idNumber,
        fromEmail: booking.contactEmail,
        fromUserId: booking.userId,
        toFirstName: input.to.firstName.trim(),
        toLastName: input.to.lastName.trim(),
        toEmail: input.to.email.trim().toLowerCase(),
        toPhone: input.to.phone.trim(),
        toUserId,
        priceDifference,
        differenceStatus:
          priceDifference > 0 ? "BEKLIYOR" : priceDifference < 0 ? "IADE_BEKLIYOR" : "YOK",
        differenceToken,
        actor: input.actor,
        actorEmail: input.actorEmail,
        note: input.note?.trim() ?? "",
        ownershipMoved: true, // yeni rezervasyonun sahibi devredilen kişi
      },
    });

    return { transferId: transfer.id, targetBookingId: target.id };
  });

  return {
    ok: true,
    transferId: result.transferId,
    priceDifference,
    differenceToken,
    targetBookingId: result.targetBookingId,
    ownershipMoved: true,
  };
}

// Fiyat farkını kapat — borç tahsil edildi ya da iade yapıldı.
//
// Borçta: hedef rezervasyona tahsilat satırı yazılır (Collection defteri tek
// doğru kaynak), bakiye kapanır. İadede: para hareketini görevli iyzico/banka
// üzerinden yapar, burada yalnız işaretlenir ve tahsilat defterine eksi satır
// düşer — böylece kasa kaydı gerçeği yansıtır.
export async function settleTransferDifference(
  transferId: string,
  opts: { method: CollectionMethod; note?: string; paymentId?: string }
): Promise<{ ok: boolean; error?: string }> {
  const transfer = await prisma.bookingTransfer.findUnique({
    where: { id: transferId },
  });
  if (!transfer) return { ok: false, error: "Devir kaydı bulunamadı." };
  if (transfer.priceDifference === 0 || transfer.differenceStatus === "YOK")
    return { ok: false, error: "Bu devirde kapatılacak fiyat farkı yok." };
  if (transfer.differenceStatus === "ODENDI" || transfer.differenceStatus === "IADE_EDILDI")
    return { ok: false, error: "Bu devirde fark zaten kapatılmış." };

  const bookingId = transfer.targetBookingId ?? transfer.bookingId;

  if (transfer.priceDifference > 0) {
    const res = await recordCollection({
      bookingId,
      amount: transfer.priceDifference,
      method: opts.method,
      note: opts.note ?? "Devir fiyat farkı",
      paymentId: opts.paymentId,
      notify: false,
    });
    if (!res.ok) return { ok: false, error: res.error };
    await prisma.bookingTransfer.update({
      where: { id: transferId },
      data: { differenceStatus: "ODENDI", differenceToken: null },
    });
    return { ok: true };
  }

  // İade: tahsilat defterine EKSİ satır (kasadan çıkan para).
  const res = await recordCollection({
    bookingId,
    amount: transfer.priceDifference, // negatif
    method: opts.method,
    note: opts.note ?? "Devir fiyat farkı iadesi",
    notify: false,
  });
  if (!res.ok) return { ok: false, error: res.error };

  await prisma.bookingTransfer.update({
    where: { id: transferId },
    data: { differenceStatus: "IADE_EDILDI" },
  });
  return { ok: true };
}

// Bir rezervasyonun devir geçmişi (en yeni önce).
export async function listTransfers(bookingId: string) {
  return prisma.bookingTransfer.findMany({
    where: { OR: [{ bookingId }, { targetBookingId: bookingId }] },
    orderBy: { createdAt: "desc" },
  });
}

// Devreden üyenin "Devredildi" kartları — hesabım listesinde gösterilir.
export async function listTransfersByUser(userId: string) {
  return prisma.bookingTransfer.findMany({
    where: { fromUserId: userId, ownershipMoved: true },
    orderBy: { createdAt: "desc" },
    include: {
      booking: {
        select: { id: true, tour: { select: { title: true, slug: true } } },
      },
    },
  });
}
