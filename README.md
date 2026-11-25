# Dispute Shield

Automated chargeback evidence for Stripe-based SaaS, course, and membership sellers. A merchant connects their Stripe account; when a dispute comes in, this collects the available evidence (charge details, receipt, customer info, and any proof-of-access events the merchant reports) and drafts a Stripe evidence narrative with Claude, which a human reviews and approves before it's submitted.

This is the Week 2–3 core from the launch plan: it does not submit evidence to Stripe automatically. You copy the approved narrative into Stripe's dispute evidence form (or wire that up later via the Stripe API).

## Stack

Next.js (App Router) + TypeScript, Prisma + Postgres, Stripe API, Claude API (`@anthropic-ai/sdk`).

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start Postgres locally** (or point `DATABASE_URL` at a hosted database — Railway, Supabase, Neon, etc.)

   ```bash
   docker compose up -d
   ```

3. **Copy env vars and fill them in**

   ```bash
   cp .env.example .env
   ```

   | Variable | Where to get it |
   | --- | --- |
   | `DATABASE_URL` | `postgresql://dispute_shield:dispute_shield@localhost:5432/dispute_shield` for the local Postgres above |
   | `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
   | `STRIPE_CONNECT_CLIENT_ID` | Stripe Dashboard → Settings → Connect → Platform settings |
   | `STRIPE_WEBHOOK_SECRET` | see "Testing webhooks locally" below |
   | `ANTHROPIC_API_KEY` | console.anthropic.com |

4. **Run migrations**

   ```bash
   npx prisma migrate dev --name init
   ```

5. **Start the app**

   ```bash
   npm run dev
   ```

   Visit `http://localhost:3000`.

## Testing webhooks locally

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), then:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the `whsec_...` secret it prints into `STRIPE_WEBHOOK_SECRET`, then trigger a test dispute:

```bash
stripe trigger charge.dispute.created
```

Note: `stripe trigger` fires events on your own platform account, not a connected account, so there's no `event.account` and the webhook handler will skip it (it looks up the merchant by connected account id). To test the full flow, connect a real Stripe test-mode account via `/api/connect/start` and create a test dispute from within that account, or use `stripe trigger --stripe-account acct_...` if your CLI version supports it.

## How it fits together

- **`/api/connect/start`, `/api/connect/callback`** — Stripe Connect (Standard) OAuth. A merchant clicks through, Stripe hands back an access token scoped to their account, and we store it on a `Merchant` row along with a generated `apiKey`.
- **`/api/webhooks/stripe`** — listens for `charge.dispute.created`. On a new dispute, it pulls charge/customer/receipt data from Stripe (`src/lib/evidence.ts`) and kicks off a first narrative draft (`src/lib/narrative.ts`).
- **`/api/access-events`** — merchants POST here (using their `apiKey` as a bearer token) whenever a customer logs in, downloads the product, or otherwise proves they received it. This is the evidence that actually wins "product not received" disputes — a receipt alone usually doesn't.
- **`/dashboard`** — list of disputes across all connected merchants (no auth yet — see Known gaps). Click into one to see the collected evidence, the recorded access events, and the AI-drafted narrative, which you edit and approve before copying into Stripe's dispute form.

## Testing

`scripts/` has a small smoke-test harness that runs against the real app (no mocks):

- `scripts/seed-demo-data.ts` — seeds a merchant, two disputes (one with rich proof-of-access evidence, one thin), and the access events behind them. Run with `npx tsx scripts/seed-demo-data.ts`.
- `scripts/test-webhook.mjs` — posts real, validly-HMAC-signed Stripe webhook payloads at `/api/webhooks/stripe` (signing is local, no Stripe API call needed) and checks signature rejection, forged-signature rejection, and graceful skipping of events with no known merchant.
- `scripts/run-tests.sh` — the full suite: disputes API (list/detail/404), access-events API (valid key, missing key, wrong key, bad payload), the approve/status-update flow, and the webhook tests above. Run with `./scripts/run-tests.sh` while `npm run dev` is up and seeded.

Last run: 13/13 passed against a real local Postgres instance and a running `next dev` server.

**Not covered by the above, and why:** collecting evidence from a *real* Stripe charge (`stripe.charges.retrieve`) and drafting a narrative with a *real* Claude call both need live credentials this environment doesn't have wired up correctly yet — the saved Stripe key is being rejected by Stripe itself (`Invalid API Key provided`), and no `ANTHROPIC_API_KEY` is set. The rest of the pipeline (dashboard, review/approve/submit, access-event ingestion, webhook routing) was exercised end-to-end for real and is recorded in the demo video.

## Known gaps (fine for running 2 pilot merchants by hand, not for self-serve)

- No authentication on the dashboard or the merchant-facing API routes beyond the per-merchant `apiKey` on `/api/access-events`.
- `stripeAccessToken` is stored in plaintext — encrypt at rest before onboarding real merchants beyond a manual pilot.
- Evidence submission to Stripe is manual (copy/paste the approved narrative). Automating that submission via `stripe.disputes.update(..., { evidence: {...} })` is the natural next step once the narrative format is proven out with pilot merchants.
- No success-fee billing yet (Week 4 in the launch plan).
