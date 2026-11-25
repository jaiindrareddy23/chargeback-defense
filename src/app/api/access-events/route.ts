import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// Merchants call this whenever a customer logs in, downloads the product,
// or otherwise proves they received it. We store it so it's ready to cite
// the moment a dispute comes in for that customer.
const accessEventSchema = z.object({
  customerEmail: z.string().email(),
  eventType: z.string().min(1).max(64),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const apiKey = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const merchant = await prisma.merchant.findUnique({ where: { apiKey } });
  if (!merchant) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accessEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { customerEmail, eventType, occurredAt, metadata } = parsed.data;

  // Link to any open dispute for this customer so the evidence is ready
  // to cite without a lookup later.
  const openDispute = await prisma.dispute.findFirst({
    where: {
      merchantId: merchant.id,
      customerEmail,
      status: { in: ["NEEDS_EVIDENCE", "DRAFTING", "READY_TO_SUBMIT"] },
    },
    orderBy: { createdAt: "desc" },
  });

  const event = await prisma.accessEvent.create({
    data: {
      merchantId: merchant.id,
      disputeId: openDispute?.id,
      customerEmail,
      eventType,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });

  return NextResponse.json({ id: event.id }, { status: 201 });
}
