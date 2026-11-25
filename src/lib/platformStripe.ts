import Stripe from "stripe";
import { stripeHttpAgent } from "./stripeHttpAgent";

let client: Stripe | null = null;

/**
 * The business's OWN Stripe account — used to bill merchants the success fee.
 * Distinct from `stripeClientForMerchant` (src/lib/stripe.ts), which reads a
 * merchant's own disputes with their restricted key. Never conflate the two:
 * this client must never be given a merchant's key, and vice versa.
 */
export function platformStripe(): Stripe {
  if (!client) {
    const apiKey = process.env.STRIPE_PLATFORM_SECRET_KEY;
    if (!apiKey) {
      throw new Error("STRIPE_PLATFORM_SECRET_KEY is not set");
    }
    client = new Stripe(apiKey, { httpAgent: stripeHttpAgent });
  }
  return client;
}
