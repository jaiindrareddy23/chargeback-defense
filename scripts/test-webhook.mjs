// Exercises /api/webhooks/stripe's signature verification and routing
// without needing a live Stripe API call: Stripe's webhook signing is pure
// local HMAC, so we can construct real, validly-signed payloads here.
import Stripe from "stripe";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_placeholder";
const URL = "http://localhost:3000/api/webhooks/stripe";

function disputeEvent({ account } = {}) {
  return {
    id: "evt_demo_" + Math.random().toString(36).slice(2),
    object: "event",
    type: "charge.dispute.created",
    account,
    data: {
      object: {
        id: "dp_demo_webhook_test",
        object: "dispute",
        charge: "ch_demo_webhook_test",
        amount: 2500,
        currency: "usd",
        reason: "fraudulent",
        evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86400 },
      },
    },
  };
}

async function post(body, headers) {
  const res = await fetch(URL, { method: "POST", headers, body });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const results = [];

  // 1. No signature header at all -> 400
  {
    const r = await post(JSON.stringify(disputeEvent()), {
      "Content-Type": "application/json",
    });
    results.push(["no signature header", r.status === 400, r]);
  }

  // 2. Garbage signature -> 400 (tampered/forged payload rejected)
  {
    const r = await post(JSON.stringify(disputeEvent()), {
      "Content-Type": "application/json",
      "stripe-signature": "t=1,v1=deadbeef",
    });
    results.push(["bad signature rejected", r.status === 400, r]);
  }

  // 3. Validly signed, but no connected account on the event (platform-level
  // event) -> handler should skip it gracefully and still 200.
  {
    const payload = JSON.stringify(disputeEvent());
    const sig = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const r = await post(payload, {
      "Content-Type": "application/json",
      "stripe-signature": sig,
    });
    results.push(["valid signature, no connected account -> skipped", r.status === 200, r]);
  }

  // 4. Validly signed, connected account present but unknown to us -> still
  // 200 (merchant not found, logged, skipped) rather than erroring.
  {
    const payload = JSON.stringify(disputeEvent({ account: "acct_unknown_demo" }));
    const sig = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const r = await post(payload, {
      "Content-Type": "application/json",
      "stripe-signature": sig,
    });
    results.push(["valid signature, unknown merchant -> skipped", r.status === 200, r]);
  }

  console.log("\nWebhook test results:");
  let allPassed = true;
  for (const [name, passed, r] of results) {
    console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}  (HTTP ${r.status})`);
    if (!passed) allPassed = false;
  }
  if (!allPassed) process.exit(1);
}

main();
