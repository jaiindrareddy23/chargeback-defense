import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const client = new Anthropic();

export interface NarrativeInput {
  merchantName: string;
  reason: string;
  amount: number;
  currency: string;
  customerEmail: string | null;
  billingDetails: unknown;
  hasReceipt: boolean;
  deliveryProof: unknown;
}

const SYSTEM_PROMPT = `You draft the written narrative a merchant submits as evidence when contesting a Stripe card-network dispute (chargeback). You are given structured facts about one dispute as JSON and must write a draft a human will review and edit before it is submitted to Stripe.

Rules:
- Use only the facts provided. Never invent transaction details, dates, or customer statements.
- Write for the dispute's specific reason code (e.g. a "product_not_received" dispute should center on proof of delivery/access; a "fraudulent" dispute should center on proof the cardholder authorized and used the purchase).
- If a fact that would normally be central to this reason code is missing (e.g. no delivery proof on a product_not_received dispute), say so plainly in one sentence rather than glossing over it — the merchant needs to know what's missing before they submit.
- One paragraph, plain prose, no headers or bullet points, no placeholder brackets.
- This is a draft for human review, not a final submission — do not claim certainty you don't have.`;

export async function draftNarrative(input: NarrativeInput): Promise<string> {
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  if (!textBlock) {
    throw new Error(`No text content in Claude response (stop_reason: ${response.stop_reason})`);
  }
  return textBlock.text.trim();
}

/**
 * Drafts (or redrafts) the narrative for a dispute from whatever evidence is on file
 * right now, and saves it. Clears any prior human approval, since that approval was
 * for different text — a regenerated draft always needs a fresh look.
 */
export async function draftAndSaveNarrative(disputeId: string): Promise<string> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { merchant: { select: { name: true } }, evidence: true },
  });
  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found`);
  }

  const narrative = await draftNarrative({
    merchantName: dispute.merchant.name,
    reason: dispute.reason,
    amount: dispute.amount,
    currency: dispute.currency,
    customerEmail: dispute.evidence?.customerEmail ?? null,
    billingDetails: dispute.evidence?.billingDetails ?? null,
    hasReceipt: Boolean(dispute.evidence?.receiptUrl),
    deliveryProof: dispute.evidence?.deliveryProof ?? null,
  });

  await prisma.evidenceSnapshot.upsert({
    where: { disputeId },
    create: { disputeId, narrative },
    update: { narrative, narrativeApprovedAt: null },
  });

  return narrative;
}
