import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type { Merchant } from "@/generated/prisma/client";

// Pulls everything we can get automatically from Stripe for a dispute:
// the charge, the customer on it, and a receipt link. This is the baseline
// evidence every dispute gets; proof-of-access (login/download events) is
// layered on top separately via AccessEvent records.
export async function collectDisputeEvidence(
  stripeDispute: Stripe.Dispute,
  merchant: Merchant
) {
  const chargeId =
    typeof stripeDispute.charge === "string"
      ? stripeDispute.charge
      : stripeDispute.charge?.id;

  let customerEmail: string | undefined;
  let customerIp: string | undefined;
  let receiptUrl: string | undefined;
  let billingDetails: Stripe.Charge.BillingDetails | undefined;

  if (chargeId) {
    const charge = await stripe.charges.retrieve(
      chargeId,
      { expand: ["customer"] },
      { stripeAccount: merchant.stripeAccountId ?? undefined }
    );

    receiptUrl = charge.receipt_url ?? undefined;
    billingDetails = charge.billing_details ?? undefined;
    customerIp = charge.metadata?.ip ?? undefined;

    if (charge.billing_details?.email) {
      customerEmail = charge.billing_details.email;
    } else if (
      charge.customer &&
      typeof charge.customer !== "string" &&
      !charge.customer.deleted
    ) {
      customerEmail = charge.customer.email ?? undefined;
    }
  }

  return prisma.dispute.upsert({
    where: { stripeDisputeId: stripeDispute.id },
    create: {
      merchantId: merchant.id,
      stripeDisputeId: stripeDispute.id,
      stripeChargeId: chargeId ?? "",
      reason: stripeDispute.reason,
      amount: stripeDispute.amount,
      currency: stripeDispute.currency,
      evidenceDueBy: stripeDispute.evidence_details?.due_by
        ? new Date(stripeDispute.evidence_details.due_by * 1000)
        : undefined,
      customerEmail,
      customerIp,
      receiptUrl,
      billingDetails: billingDetails
        ? JSON.parse(JSON.stringify(billingDetails))
        : undefined,
    },
    update: {
      reason: stripeDispute.reason,
      amount: stripeDispute.amount,
      currency: stripeDispute.currency,
      evidenceDueBy: stripeDispute.evidence_details?.due_by
        ? new Date(stripeDispute.evidence_details.due_by * 1000)
        : undefined,
      customerEmail,
      customerIp,
      receiptUrl,
      billingDetails: billingDetails
        ? JSON.parse(JSON.stringify(billingDetails))
        : undefined,
    },
  });
}
