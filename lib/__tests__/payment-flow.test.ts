import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { getTestPrisma, createTestBooking } from "./helpers/db";
import { verifyIyzicoCallback } from "@/lib/payment";
import { markBookingPaid, releaseExpiredHolds } from "@/lib/booking";
import type { CheckoutFormRetrieveResponse } from "@/lib/iyzico";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/notifications", () => ({
  sendBookingConfirmation: async () => {},
  sendAgeVerificationRequest: async () => {},
  sendBookingCancellation: async () => {},
}));

const SECRET = "iyzico-test-secret";
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getTestPrisma();
});

beforeEach(() => {
  vi.stubEnv("IYZICO_API_KEY", "iyzico-test-api-key");
  vi.stubEnv("IYZICO_SECRET_KEY", SECRET);
  vi.stubEnv("IYZICO_BASE_URL", "https://sandbox-api.iyzipay.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function signedResponse(
  overrides: Partial<CheckoutFormRetrieveResponse> = {}
): CheckoutFormRetrieveResponse {
  const response: CheckoutFormRetrieveResponse = {
    status: "success",
    paymentStatus: "SUCCESS",
    paymentId: "sandbox-payment-123",
    currency: "TRY",
    basketId: "booking-test",
    conversationId: "booking-test",
    paidPrice: "2000.0",
    price: "2000.0",
    token: "sandbox-token",
    ...overrides,
  };
  const payload = [
    response.paymentStatus ?? "",
    response.paymentId ?? "",
    response.currency ?? "",
    response.basketId ?? "",
    response.conversationId ?? "",
    response.paidPrice ?? "",
    response.price ?? "",
    response.token ?? "",
  ].join(":");
  response.signature = crypto.createHmac("sha256", SECRET).update(payload, "utf8").digest("hex");
  return response;
}

function stubIyzicoResponse(response: CheckoutFormRetrieveResponse): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  );
}

async function createPaymentRecord(bookingId: string, token: string) {
  return prisma.payment.create({
    data: { bookingId, token, amount: 2000, currency: "TRY", status: "BASLATILDI" },
  });
}

describe("iyzico callback payment flow", () => {
  it("declined payment stays unpaid and records failure", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["1A"],
    });
    const token = `failed-${bookingId}`;
    await createPaymentRecord(bookingId, token);
    stubIyzicoResponse(
      signedResponse({
        paymentStatus: "FAILURE",
        basketId: bookingId,
        conversationId: bookingId,
        token,
      })
    );

    const result = await verifyIyzicoCallback(token);

    expect(result).toMatchObject({ ok: false, bookingId });
    expect((await prisma.booking.findUnique({ where: { id: bookingId } }))?.status).toBe("BEKLIYOR");
    expect((await prisma.payment.findUnique({ where: { token } }))?.status).toBe("BASARISIZ");
    expect(
      (await prisma.seat.findFirst({ where: { departureId, code: "1A" } }))?.status
    ).toBe("KILITLI");
  });

  it("replaying a successful callback does not duplicate payment or sell seats twice", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["1A"],
    });
    const token = `success-${bookingId}`;
    await createPaymentRecord(bookingId, token);
    stubIyzicoResponse(
      signedResponse({ basketId: bookingId, conversationId: bookingId, token })
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await verifyIyzicoCallback(token);
      expect(result).toMatchObject({ ok: true, bookingId });
      if (result.ok) await markBookingPaid(result.bookingId, result.paymentId);
    }

    expect((await prisma.booking.findUnique({ where: { id: bookingId } }))?.status).toBe("ODENDI");
    expect(
      (await prisma.seat.findFirst({ where: { departureId, code: "1A" } }))?.status
    ).toBe("SATILDI");
    expect(await prisma.payment.count({ where: { bookingId } })).toBe(1);
    expect((await prisma.payment.findUnique({ where: { token } }))?.status).toBe("BASARILI");
  });

  it("rejects an invalid signature without marking the booking paid", async () => {
    const { bookingId } = await createTestBooking(prisma, { status: "BEKLIYOR" });
    const token = `invalid-signature-${bookingId}`;
    await createPaymentRecord(bookingId, token);
    const response = signedResponse({ basketId: bookingId, conversationId: bookingId, token });
    response.signature = "invalid-signature";
    stubIyzicoResponse(response);

    const result = await verifyIyzicoCallback(token);

    expect(result.ok).toBe(false);
    expect("bookingId" in result).toBe(false);
    expect((await prisma.booking.findUnique({ where: { id: bookingId } }))?.status).toBe("BEKLIYOR");
    expect((await prisma.payment.findUnique({ where: { token } }))?.status).toBe("BASLATILDI");
  });

  it("rejects a validly signed amount that differs from the booking", async () => {
    const { bookingId } = await createTestBooking(prisma, { status: "BEKLIYOR" });
    const token = `wrong-amount-${bookingId}`;
    await createPaymentRecord(bookingId, token);
    stubIyzicoResponse(
      signedResponse({
        basketId: bookingId,
        conversationId: bookingId,
        token,
        price: "1000.0",
        paidPrice: "1000.0",
      })
    );

    const result = await verifyIyzicoCallback(token);

    expect(result).toMatchObject({ ok: false, bookingId });
    expect((await prisma.booking.findUnique({ where: { id: bookingId } }))?.status).toBe("BEKLIYOR");
    expect((await prisma.payment.findUnique({ where: { token } }))?.status).toBe("BASARISIZ");
  });

  it("expires old holds and releases their locked seats", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["1A"],
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    await releaseExpiredHolds();

    expect((await prisma.booking.findUnique({ where: { id: bookingId } }))?.status).toBe("SURE_DOLDU");
    expect(
      (await prisma.seat.findFirst({ where: { departureId, code: "1A" } }))?.status
    ).toBe("BOS");
  });

  it("does not complete payment after the booking hold expires", async () => {
    const { bookingId, departureId } = await createTestBooking(prisma, {
      status: "BEKLIYOR",
      seatCodes: ["1A"],
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    const result = await markBookingPaid(bookingId, "sandbox-payment-late");

    expect(result).toMatchObject({ ok: false });
    expect((await prisma.booking.findUnique({ where: { id: bookingId } }))?.status).toBe("BEKLIYOR");
    expect(
      (await prisma.seat.findFirst({ where: { departureId, code: "1A" } }))?.status
    ).toBe("KILITLI");
  });
});