import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

const createMerchantSchema = z.object({
  name: z.string().min(1),
  contactEmail: z.string().email(),
  // The merchant's Stripe secret or (preferably) restricted key, read access to
  // charges/disputes/customers is enough — never request write scopes.
  stripeApiKey: z.string().min(1),
  // The signing secret Stripe shows when the merchant adds a webhook endpoint
  // in their dashboard pointed at this merchant's /api/webhooks/stripe/[merchantId] URL.
  webhookSecret: z.string().startsWith("whsec_"),
});

// Manual onboarding for the first pilot merchants (Week 4: "do it manually for the
// first 2 customers"). Call this once you've walked a merchant through adding the
// webhook endpoint and handed you their restricted API key and webhook secret.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createMerchantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, contactEmail, stripeApiKey, webhookSecret } = parsed.data;

  // Shown once, in this response only — the merchant's own app needs it to call
  // the delivery-proof endpoint below. We only ever store its encrypted form.
  const deliveryProofToken = randomBytes(32).toString("hex");

  const merchant = await prisma.merchant.create({
    data: {
      name,
      contactEmail,
      encryptedStripeApiKey: encryptSecret(stripeApiKey),
      encryptedWebhookSecret: encryptSecret(webhookSecret),
      encryptedDeliveryProofToken: encryptSecret(deliveryProofToken),
    },
    select: { id: true, name: true, contactEmail: true, createdAt: true },
  });

  const webhookUrl = `${process.env.APP_BASE_URL}/api/webhooks/stripe/${merchant.id}`;
  const deliveryProofUrl = `${process.env.APP_BASE_URL}/api/merchants/${merchant.id}/delivery-proof`;

  return NextResponse.json(
    { merchant, webhookUrl, deliveryProofUrl, deliveryProofToken },
    { status: 201 }
  );
}

export async function GET() {
  const merchants = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      contactEmail: true,
      createdAt: true,
      _count: { select: { disputes: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ merchants });
}
