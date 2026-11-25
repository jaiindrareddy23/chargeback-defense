// Seeds realistic demo data for the dashboard: a merchant, two disputes in
// different states, and the access events (login/download) that act as
// delivery proof for the "product not received" dispute.
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { email: "founder@indiecourse.dev" },
    create: {
      email: "founder@indiecourse.dev",
      name: "IndieCourse Academy",
    },
    update: {},
  });

  console.log("Merchant:", merchant.id, merchant.email, "apiKey:", merchant.apiKey);

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // Dispute 1: "product not received" with strong delivery-proof evidence.
  const d1 = await prisma.dispute.upsert({
    where: { stripeDisputeId: "dp_demo_pnr_001" },
    create: {
      merchantId: merchant.id,
      stripeDisputeId: "dp_demo_pnr_001",
      stripeChargeId: "ch_demo_pnr_001",
      reason: "product_not_received",
      amount: 14900,
      currency: "usd",
      status: "NEEDS_EVIDENCE",
      evidenceDueBy: new Date(now + 6 * day),
      customerEmail: "skeptical.customer@example.com",
      receiptUrl: "https://pay.stripe.com/receipts/demo_pnr_001",
      billingDetails: {
        name: "J. Customer",
        email: "skeptical.customer@example.com",
        address: { city: "Austin", country: "US" },
      },
    },
    update: {},
  });

  for (const [eventType, offsetDays] of [
    ["login", -40],
    ["download", -40],
    ["login", -20],
    ["login", -3],
  ]) {
    await prisma.accessEvent.create({
      data: {
        merchantId: merchant.id,
        disputeId: d1.id,
        customerEmail: "skeptical.customer@example.com",
        eventType,
        occurredAt: new Date(now + offsetDays * day),
        metadata: { source: "seed-demo-data" },
      },
    });
  }

  // Dispute 2: "fraudulent" with thinner evidence, to show the honest case
  // where the narrative should say evidence is thin rather than pad it out.
  await prisma.dispute.upsert({
    where: { stripeDisputeId: "dp_demo_fraud_002" },
    create: {
      merchantId: merchant.id,
      stripeDisputeId: "dp_demo_fraud_002",
      stripeChargeId: "ch_demo_fraud_002",
      reason: "fraudulent",
      amount: 4900,
      currency: "usd",
      status: "NEEDS_EVIDENCE",
      evidenceDueBy: new Date(now + 5 * day),
      customerEmail: "new.signup@example.com",
      receiptUrl: "https://pay.stripe.com/receipts/demo_fraud_002",
      billingDetails: {
        name: "N. Signup",
        email: "new.signup@example.com",
        address: { city: "Remote", country: "US" },
      },
    },
    update: {},
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
