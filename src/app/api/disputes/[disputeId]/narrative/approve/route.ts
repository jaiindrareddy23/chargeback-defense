import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

type RouteParams = { disputeId: string };

const approveSchema = z.object({
  // The narrative text as the human reviewer leaves it — may differ from the LLM
  // draft if they edited it. This is what gets recorded as approved, verbatim.
  narrative: z.string().min(1),
});

// The human-review step the plan calls for: a founder reads (and may edit) the
// drafted narrative, then approves this exact text. Approving does NOT submit
// anything to Stripe — that's still a manual copy-paste, by design (Week 4: "do it
// manually for the first 2 customers").
export async function POST(request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  const { disputeId } = await ctx.params;

  const body = await request.json();
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.evidenceSnapshot.findUnique({ where: { disputeId } });
  if (!existing) {
    return NextResponse.json(
      { error: "No evidence snapshot for this dispute yet — draft a narrative first" },
      { status: 404 }
    );
  }

  const updated = await prisma.evidenceSnapshot.update({
    where: { disputeId },
    data: { narrative: parsed.data.narrative, narrativeApprovedAt: new Date() },
  });

  return NextResponse.json({
    narrative: updated.narrative,
    narrativeApprovedAt: updated.narrativeApprovedAt,
  });
}
