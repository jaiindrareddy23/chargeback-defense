import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { platformStripe } from "@/lib/platformStripe";

// ~25% per the plan. Not configurable per-merchant yet — every pilot is on the same rate.
export const SUCCESS_FEE_RATE = 0.25;

/**
 * Charges the success fee for a won dispute, on OUR Stripe account against the
 * merchant's saved payment method. Idempotent: a dispute already has at most one
 * SuccessFee row (unique on disputeId), so a retried "closed" webhook is a no-op.
 */
export async function chargeSuccessFee(disputeId: string): Promise<void> {
  const existing = await prisma.successFee.findUnique({ where: { disputeId } });
  if (existing) return;

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { merchant: true },
  });
  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found`);
  }

  const amount = Math.round(dispute.amount * SUCCESS_FEE_RATE);
  const { merchant } = dispute;

  if (!merchant.platformStripeCustomerId || !merchant.platformPaymentMethodId) {
    await prisma.successFee.create({
      data: {
        disputeId: dispute.id,
        merchantId: merchant.id,
        amount,
        currency: dispute.currency,
        status: "no_payment_method",
      },
    });
    return;
  }

  const stripe = platformStripe();
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: dispute.currency,
      customer: merchant.platformStripeCustomerId,
      payment_method: merchant.platformPaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { disputeId: dispute.id, merchantId: merchant.id },
    });

    await prisma.successFee.create({
      data: {
        disputeId: dispute.id,
        merchantId: merchant.id,
        amount,
        currency: dispute.currency,
        status: paymentIntent.status === "succeeded" ? "succeeded" : "pending",
        stripePaymentIntentId: paymentIntent.id,
      },
    });
  } catch (err) {
    const failureReason =
      err instanceof Stripe.errors.StripeCardError ? err.message : `Unexpected error: ${(err as Error).message}`;
    await prisma.successFee.create({
      data: {
        disputeId: dispute.id,
        merchantId: merchant.id,
        amount,
        currency: dispute.currency,
        status: "failed",
        failureReason,
      },
    });
    if (!(err instanceof Stripe.errors.StripeCardError)) {
      throw err;
    }
  }
}
