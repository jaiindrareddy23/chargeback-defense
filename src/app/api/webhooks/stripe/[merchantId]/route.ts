import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeClientForMerchant } from "@/lib/stripe";
import { decryptSecret } from "@/lib/crypto";
import { collectEvidence } from "@/lib/evidence";
import { draftAndSaveNarrative } from "@/lib/narrative";
import { chargeSuccessFee } from "@/lib/billing";

type RouteParams = { merchantId: string };

// Each merchant adds this exact URL (with their own id) as a webhook endpoint in their
// Stripe dashboard, listening for charge.dispute.created, and pastes the resulting
// whsec_... signing secret back during onboarding (see /api/merchants).
export async function POST(request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  const { merchantId } = await ctx.params;

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) {
    return NextResponse.json({ error: "Unknown merchant" }, { status: 404 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = stripeClientForMerchant(merchant);
  const webhookSecret = decryptSecret(merchant.encryptedWebhookSecret);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  if (event.type !== "charge.dispute.created" && event.type !== "charge.dispute.closed") {
    // Ack anything else so Stripe stops retrying; we only act on these two for now.
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const evidenceDueBy = dispute.evidence_details.due_by
    ? new Date(dispute.evidence_details.due_by * 1000)
    : null;

  const disputeRow = await prisma.dispute.upsert({
    where: { stripeDisputeId: dispute.id },
    create: {
      merchantId: merchant.id,
      stripeDisputeId: dispute.id,
      stripeChargeId: chargeId,
      amount: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
      evidenceDueBy,
      rawEvent: event as unknown as object,
    },
    // Stripe retries webhook delivery, and also sends a separate "closed" event once
    // the dispute resolves — either way this just refreshes status/due-by on the same row.
    update: {
      status: dispute.status,
      evidenceDueBy,
      rawEvent: event as unknown as object,
    },
  });

  if (event.type === "charge.dispute.created") {
    try {
      await collectEvidence(stripe, dispute, disputeRow.id);
    } catch (err) {
      // The dispute itself is recorded; a failed evidence pull shouldn't make Stripe
      // re-send the whole webhook. Log it and let it be retried manually later.
      console.error(`Evidence collection failed for dispute ${dispute.id}:`, err);
    }

    try {
      // First-pass draft from whatever evidence we have; it's regenerated once the
      // merchant's own delivery-proof webhook lands, and reviewed before anyone submits it.
      await draftAndSaveNarrative(disputeRow.id);
    } catch (err) {
      console.error(`Narrative drafting failed for dispute ${dispute.id}:`, err);
    }
  } else if (dispute.status === "won") {
    try {
      await chargeSuccessFee(disputeRow.id);
    } catch (err) {
      // Logged for manual follow-up; a billing failure must never make Stripe retry
      // this webhook (that would risk charging the success fee more than once).
      console.error(`Success-fee charge failed for dispute ${dispute.id}:`, err);
    }
  }

  return NextResponse.json({ received: true });
}
