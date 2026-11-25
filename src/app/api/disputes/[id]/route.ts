import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      merchant: { select: { name: true, email: true } },
      accessEvents: { orderBy: { occurredAt: "asc" } },
    },
  });

  if (!dispute) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(dispute);
}

const updateSchema = z.object({
  narrative: z.string().min(1).optional(),
  narrativeApproved: z.boolean().optional(),
  status: z
    .enum([
      "NEEDS_EVIDENCE",
      "DRAFTING",
      "READY_TO_SUBMIT",
      "SUBMITTED",
      "WON",
      "LOST",
    ])
    .optional(),
});

// Human-review step: edit the drafted narrative, approve it, or move the
// dispute's status forward (e.g. once it's been submitted to Stripe).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const dispute = await prisma.dispute.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(dispute);
}
