import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { platformStripe } from "@/lib/platformStripe";

type RouteParams = { merchantId: string };

// Starts collecting a payment method for the success fee — on OUR Stripe account,
// not the merchant's. Hand the returned checkoutUrl to the merchant; once they add
// a card, POST /api/webhooks/platform (checkout.session.completed) saves it.
export async function POST(_request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  const { merchantId } = await ctx.params;

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) {
    return NextResponse.json({ error: "Unknown merchant" }, { status: 404 });
  }

  const stripe = platformStripe();

  let customerId = merchant.platformStripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: merchant.contactEmail,
      name: merchant.name,
      metadata: { merchantId: merchant.id },
    });
    customerId = customer.id;
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { platformStripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    allowed_payment_method_types: ["card"],
    success_url: `${process.env.APP_BASE_URL}/dashboard?billing=success&merchant=${merchant.id}`,
    cancel_url: `${process.env.APP_BASE_URL}/dashboard?billing=cancelled&merchant=${merchant.id}`,
    metadata: { merchantId: merchant.id },
  });

  return NextResponse.json({ checkoutUrl: session.url });
}
