"use server";

// Kalan ödeme (ön satış bakiyesi) — müşterinin kendi ödemesi.
//
// Erişim rezervasyon id'si ile DEĞİL, Booking.balanceToken ile yapılır: id
// e-postalarda ve adres çubuğunda görünüyor, tahmin edilebilir bir adresten
// başkasının rezervasyonu açılmamalı. Token rastgele 24 bayttır.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { startPayment } from "@/lib/payment";
import { clientIpFrom } from "@/lib/consent";
import { balanceOf } from "@/lib/shared";

export interface BalanceView {
  bookingId: string;
  ref: string;
  contactName: string;
  tourTitle: string;
  destination: string;
  departureDate: string;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  balanceDueAt: string | null;
  overdue: boolean;
  status: string;
  seatText: string;
}

// Token'dan rezervasyonu çöz. Bulunamazsa null (sayfa 404 verir).
export async function getBalanceView(token: string): Promise<BalanceView | null> {
  if (!token) return null;
  const b = await prisma.booking.findUnique({
    where: { balanceToken: token },
    include: {
      tour: { select: { title: true, destination: true, currency: true, departureDate: true, bookingType: true } },
      departure: { select: { departureDate: true } },
      passengers: { select: { seatCode: true } },
    },
  });
  if (!b) return null;

  const departureDate = b.departure?.departureDate ?? b.tour.departureDate;
  const balance = balanceOf(b.totalAmount, b.paidAmount);
  const seats = b.passengers.map((p) => p.seatCode).filter(Boolean);

  return {
    bookingId: b.id,
    ref: b.id.slice(-8).toUpperCase(),
    contactName: b.contactName,
    tourTitle: b.tour.title,
    destination: b.tour.destination,
    departureDate: departureDate.toISOString(),
    currency: b.tour.currency,
    totalAmount: b.totalAmount,
    paidAmount: b.paidAmount,
    balance,
    balanceDueAt: b.balanceDueAt?.toISOString() ?? null,
    overdue: Boolean(b.balanceDueAt && b.balanceDueAt < new Date()),
    status: b.status,
    seatText:
      b.tour.bookingType === "KOLTUK" && seats.length
        ? `Koltuk: ${seats.join(", ")}`
        : `${b.quantity} kişi`,
  };
}

// Kalan tutarı iyzico üzerinden öde. Tutar İSTEMCİDEN ALINMAZ — burada
// veritabanındaki bakiyeden hesaplanır.
export async function payBalance(fd: FormData) {
  const token = String(fd.get("token") ?? "").trim();
  const back = (error: string) =>
    `/kalan-odeme/${encodeURIComponent(token)}?hata=${encodeURIComponent(error)}`;

  const booking = token
    ? await prisma.booking.findUnique({
        where: { balanceToken: token },
        include: { tour: { select: { title: true, currency: true } } },
      })
    : null;
  if (!booking) redirect("/turlar?hata=Rezervasyon+bulunamadi");

  if (booking!.status !== "ODENDI") {
    redirect(
      back(
        "Bu rezervasyon için ödeme alınamıyor. Lütfen acentemizle iletişime geçin."
      )
    );
  }

  const balance = balanceOf(booking!.totalAmount, booking!.paidAmount);
  if (balance <= 0) redirect(back("Bu rezervasyonun ödenecek bakiyesi kalmadı."));

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";

  let redirectUrl: string;
  try {
    ({ redirectUrl } = await startPayment({
      bookingId: booking!.id,
      amount: balance,
      currency: booking!.tour.currency,
      contactName: booking!.contactName,
      contactEmail: booking!.contactEmail,
      contactPhone: booking!.contactPhone,
      ip: clientIpFrom(h) ?? undefined,
      tourTitle: `${booking!.tour.title} (kalan ödeme)`,
      baseUrl: `${proto}://${host}`,
    }));
  } catch (error) {
    console.error("[kalan ödeme: iyzico başlatılamadı]", {
      bookingId: booking!.id,
      error,
    });
    // Rezervasyon İPTAL EDİLMEZ: koltuk müşterinin, yalnız ödeme başlatılamadı.
    redirect(back("Ödeme başlatılamadı. Lütfen birkaç dakika sonra tekrar deneyin."));
  }

  redirect(redirectUrl);
}
