import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { platformStripe } from "@/lib/platformStripe";

// One endpoint for OUR OWN Stripe account (not a merchant's) — add this URL once,
// as a single webhook endpoint in our own Stripe dashboard, listening for
// checkout.session.completed, payment_intent.succeeded, and payment_intent.payment_failed.
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_PLATFORM_WEBHOOK_SECRET is not set" }, { status: 500 });
  }

  const rawBody = await request.text();
  const stripe = platformStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "setup" && session.setup_intent) {
      const setupIntentId =
        typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent.id;
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      const paymentMethodId =
        typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id ?? null;

      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const merchantId = session.metadata?.merchantId;

      if (paymentMethodId && (merchantId || customerId)) {
        const merchant = merchantId
          ? await prisma.merchant.findUnique({ where: { id: merchantId } })
          : await prisma.merchant.findUnique({ where: { platformStripeCustomerId: customerId } });

        if (merchant) {
          await prisma.merchant.update({
            where: { id: merchant.id },
            data: { platformPaymentMethodId: paymentMethodId },
          });
          if (customerId) {
            await stripe.customers.update(customerId, {
              invoice_settings: { default_payment_method: paymentMethodId },
            });
          }
        }
      }
    }
  } else if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const fee = await prisma.successFee.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });
    if (fee) {
      await prisma.successFee.update({
        where: { id: fee.id },
        data: {
          status: event.type === "payment_intent.succeeded" ? "succeeded" : "failed",
          failureReason: paymentIntent.last_payment_error?.message ?? null,
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
