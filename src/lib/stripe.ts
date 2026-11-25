import Stripe from "stripe";
import { decryptSecret } from "./crypto";
import { stripeHttpAgent } from "./stripeHttpAgent";
import type { Merchant } from "@/generated/prisma/client";

/** A Stripe client scoped to one merchant's own (restricted or secret) API key. */
export function stripeClientForMerchant(merchant: Pick<Merchant, "encryptedStripeApiKey">): Stripe {
  const apiKey = decryptSecret(merchant.encryptedStripeApiKey);
  return new Stripe(apiKey, { httpAgent: stripeHttpAgent });
}
