import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * Pulls what Stripe actually has on a disputed charge: billing details, receipt, and
 * customer email. Stripe does NOT expose the purchaser's IP on the charge or payment
 * intent, so customerIp stays null here — it's filled in later by the merchant's own
 * "did the user log in/download?" webhook (Week 3), not by this collector.
 */
export async function collectEvidence(stripe: Stripe, dispute: Stripe.Dispute, disputeRowId: string) {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const charge = await stripe.charges.retrieve(chargeId, { expand: ["customer"] });

  const customer = typeof charge.customer === "object" ? charge.customer : null;
  const customerEmail =
    charge.billing_details?.email ??
    (customer && !customer.deleted ? customer.email : null) ??
    charge.receipt_email ??
    null;

  await prisma.evidenceSnapshot.upsert({
    where: { disputeId: disputeRowId },
    create: {
      disputeId: disputeRowId,
      customerEmail,
      receiptUrl: charge.receipt_url,
      billingDetails: charge.billing_details as object,
    },
    update: {
      customerEmail,
      receiptUrl: charge.receipt_url,
      billingDetails: charge.billing_details as object,
    },
  });
}
