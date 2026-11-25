import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { collectDisputeEvidence } from "@/lib/evidence";
import { draftEvidenceNarrative } from "@/lib/narrative";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  // The event carries the connected account id when it comes from a
  // merchant's account rather than the platform itself.
  const connectedAccountId = event.account;

  switch (event.type) {
    case "charge.dispute.created": {
      const stripeDispute = event.data.object as Stripe.Dispute;

      if (!connectedAccountId) {
        console.error("Dispute event missing connected account id", event.id);
        break;
      }

      const merchant = await prisma.merchant.findUnique({
        where: { stripeAccountId: connectedAccountId },
      });

      if (!merchant) {
        console.error("No merchant found for account", connectedAccountId);
        break;
      }

      const dispute = await collectDisputeEvidence(stripeDispute, merchant);

      // Best-effort: draft a narrative right away so the merchant has
      // something to review instead of a blank evidence form. Failures
      // here shouldn't fail the webhook (Stripe retries on non-2xx).
      try {
        await draftEvidenceNarrative(dispute.id);
      } catch (err) {
        console.error("Narrative drafting failed for dispute", dispute.id, err);
      }

      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
