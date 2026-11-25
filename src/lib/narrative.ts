import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const anthropic = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

// Reason-code-specific guidance on what actually wins a Stripe dispute.
// Keep this short — it steers the model, it isn't the whole evidence packet.
const REASON_GUIDANCE: Record<string, string> = {
  product_not_received:
    "Focus on proof the customer received or accessed the digital product: login timestamps, download events, active subscription usage. A receipt alone rarely wins this reason code.",
  fraudulent:
    "Focus on proof the transaction matches the account holder: billing address/CVC match results, IP address consistent with account history, prior non-disputed purchases, device/account tenure.",
  duplicate:
    "Focus on proof this is a distinct, separately-authorized charge: different charge ID, timestamp, and any distinguishing line items or invoice numbers.",
  subscription_canceled:
    "Focus on proof of the cancellation policy shown at signup and proof the subscription was still active and in use at the time of the charge (login/usage events).",
  product_unacceptable:
    "Focus on proof the product matched its description and was delivered as described: access logs, support correspondence, and the original listing/description text.",
};

const DEFAULT_GUIDANCE =
  "Focus on whatever evidence most directly contradicts the customer's stated reason for the dispute.";

export async function draftEvidenceNarrative(disputeId: string) {
  const dispute = await prisma.dispute.findUniqueOrThrow({
    where: { id: disputeId },
    include: {
      merchant: true,
      accessEvents: { orderBy: { occurredAt: "asc" } },
    },
  });

  const guidance = REASON_GUIDANCE[dispute.reason] ?? DEFAULT_GUIDANCE;

  const accessEventSummary = dispute.accessEvents.length
    ? dispute.accessEvents
        .map(
          (e) => `- ${e.eventType} at ${e.occurredAt.toISOString()}`
        )
        .join("\n")
    : "(none recorded)";

  const prompt = `You are drafting the "uncategorized_text" evidence field for a Stripe chargeback dispute. Write a factual, concise narrative (150-300 words) a merchant can submit to Stripe. Do not invent facts not given below. If evidence is thin, say so plainly rather than padding.

Dispute reason code: ${dispute.reason}
Guidance for this reason code: ${guidance}

Facts available:
- Charge amount: ${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()}
- Customer email on file: ${dispute.customerEmail ?? "unknown"}
- Receipt URL: ${dispute.receiptUrl ?? "none"}
- Billing details on file: ${
    dispute.billingDetails ? JSON.stringify(dispute.billingDetails) : "none"
  }
- Recorded access/usage events for this customer:
${accessEventSummary}

Write only the narrative text, no preamble or headers.`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const narrative = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return prisma.dispute.update({
    where: { id: disputeId },
    data: {
      narrative,
      narrativeApproved: false,
      status: "DRAFTING",
    },
  });
}
