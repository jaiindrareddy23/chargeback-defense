import { NextRequest, NextResponse } from "next/server";
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

  const merchant = await prisma.merchant.create({
    data: {
      name,
      contactEmail,
      encryptedStripeApiKey: encryptSecret(stripeApiKey),
      encryptedWebhookSecret: encryptSecret(webhookSecret),
    },
    select: { id: true, name: true, contactEmail: true, createdAt: true },
  });

  const webhookUrl = `${process.env.APP_BASE_URL}/api/webhooks/stripe/${merchant.id}`;

  return NextResponse.json({ merchant, webhookUrl }, { status: 201 });
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
