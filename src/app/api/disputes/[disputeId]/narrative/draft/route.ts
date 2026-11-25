import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { draftAndSaveNarrative } from "@/lib/narrative";

type RouteParams = { disputeId: string };

// Manually (re)draft a dispute's narrative from whatever evidence is on file right
// now — useful after a delivery-proof webhook lands late, or to retry a draft that
// failed when the dispute was first recorded.
export async function POST(_request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  const { disputeId } = await ctx.params;

  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) {
    return NextResponse.json({ error: "Unknown dispute" }, { status: 404 });
  }

  try {
    const narrative = await draftAndSaveNarrative(disputeId);
    return NextResponse.json({ narrative, narrativeApprovedAt: null });
  } catch (err) {
    return NextResponse.json(
      { error: `Narrative drafting failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
