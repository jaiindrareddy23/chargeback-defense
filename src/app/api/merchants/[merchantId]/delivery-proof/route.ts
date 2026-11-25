import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decryptSecret, secureEquals } from "@/lib/crypto";
import { draftAndSaveNarrative } from "@/lib/narrative";
import type { Prisma } from "@/generated/prisma/client";

type RouteParams = { merchantId: string };

const deliveryProofSchema = z
  .object({
    // Match this proof to a dispute by whichever of these the merchant's system has on hand.
    disputeId: z.string().uuid().optional(),
    stripeChargeId: z.string().optional(),
    customerEmail: z.string().email().optional(),
    loggedInAt: z.string().datetime().optional(),
    downloadedAt: z.string().datetime().optional(),
    ipAddress: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => data.disputeId || data.stripeChargeId || data.customerEmail, {
    message: "Provide disputeId, stripeChargeId, or customerEmail so this can be matched to a dispute",
  });

// Not a Stripe webhook — this is the merchant's own app telling us "this customer did
// log in / download", which Stripe has no way to know. Authenticated with the bearer
// token handed back once at onboarding (see POST /api/merchants).
export async function POST(request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  const { merchantId } = await ctx.params;

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) {
    return NextResponse.json({ error: "Unknown merchant" }, { status: 404 });
  }

  const authHeader = request.headers.get("authorization");
  const presentedToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const expectedToken = decryptSecret(merchant.encryptedDeliveryProofToken);
  if (!presentedToken || !secureEquals(presentedToken, expectedToken)) {
    return NextResponse.json({ error: "Invalid or missing bearer token" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deliveryProofSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { disputeId, stripeChargeId, customerEmail, loggedInAt, downloadedAt, ipAddress, details } =
    parsed.data;

  const dispute = disputeId
    ? await prisma.dispute.findFirst({ where: { id: disputeId, merchantId: merchant.id } })
    : stripeChargeId
      ? await prisma.dispute.findFirst({
          where: { stripeChargeId, merchantId: merchant.id },
          orderBy: { createdAt: "desc" },
        })
      : await prisma.dispute.findFirst({
          where: { merchantId: merchant.id, evidence: { customerEmail } },
          orderBy: { createdAt: "desc" },
        });

  if (!dispute) {
    return NextResponse.json(
      { error: "No matching dispute found for this merchant" },
      { status: 404 }
    );
  }

  const existing = await prisma.evidenceSnapshot.findUnique({ where: { disputeId: dispute.id } });
  const priorEntries = Array.isArray((existing?.deliveryProof as { entries?: unknown[] } | null)?.entries)
    ? ((existing!.deliveryProof as { entries: unknown[] }).entries)
    : [];

  const newEntry = {
    receivedAt: new Date().toISOString(),
    loggedInAt: loggedInAt ?? null,
    downloadedAt: downloadedAt ?? null,
    ipAddress: ipAddress ?? null,
    details: details ?? null,
  };

  const deliveryProof = { entries: [...priorEntries, newEntry] } as unknown as Prisma.InputJsonValue;

  await prisma.evidenceSnapshot.upsert({
    where: { disputeId: dispute.id },
    create: {
      disputeId: dispute.id,
      customerIp: ipAddress ?? null,
      deliveryProof,
    },
    update: {
      customerIp: ipAddress ?? existing?.customerIp ?? null,
      deliveryProof,
    },
  });

  try {
    await draftAndSaveNarrative(dispute.id);
  } catch (err) {
    console.error(`Narrative re-draft failed for dispute ${dispute.id}:`, err);
  }

  return NextResponse.json({ received: true, disputeId: dispute.id });
}
