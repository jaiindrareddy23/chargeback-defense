# Chargeback Defense

Weeks 2–4 build from the [launch plan](https://claude.ai/artifact/Tr7A1686B9RQjSqZES8nfS): the pipeline that
watches a merchant's Stripe account for new disputes, collects evidence automatically, drafts (for human
review) the narrative that goes back to Stripe, and bills the success fee on wins. A public landing page and
an internal ops dashboard sit on top.

## What's here

**Week 2 — core pipeline:**

- **Merchant onboarding** (`POST /api/merchants`) — stores a merchant's Stripe restricted/secret key, their
  per-merchant webhook signing secret, and a delivery-proof bearer token (see below), all AES-256-GCM
  encrypted at rest (`src/lib/crypto.ts`). The token and secrets are returned once, in this response only.
- **Webhook handler** (`POST /api/webhooks/stripe/[merchantId]`) — verifies the Stripe signature, records
  `charge.dispute.created` events as `Dispute` rows (idempotent on `stripeDisputeId`, so retried webhook
  deliveries don't duplicate).
- **Evidence collector** (`src/lib/evidence.ts`) — on each new dispute, pulls the underlying charge and
  stores billing details, receipt URL, and customer email as an `EvidenceSnapshot`.

**Week 3 — make it useful:**

- **Delivery-proof endpoint** (`POST /api/merchants/[merchantId]/delivery-proof`) — the one data source Stripe
  itself can't supply: the merchant's own app tells us "this customer logged in / downloaded on X, from IP Y".
  Authenticated with the bearer token from onboarding (not a Stripe webhook, so it needs its own auth). Matches
  the proof to a dispute by `disputeId`, `stripeChargeId`, or `customerEmail`, and appends it to that dispute's
  evidence.
- **LLM-drafted narrative** (`src/lib/narrative.ts`, Claude Opus 5.5) — drafts the evidence narrative text for
  a dispute's specific reason code from whatever evidence is on file, and says plainly when something a strong
  case would need (e.g. delivery proof on a `product_not_received` dispute) is missing. Drafted automatically
  right after evidence collection, and redrafted automatically whenever delivery proof arrives.
- **Human review step** (`/disputes/[id]`, `POST .../narrative/draft`, `POST .../narrative/approve`) — the
  dispute detail page shows the draft in an editable textarea. "Regenerate draft" redrafts from current
  evidence; "Approve this text" records exactly what a human signed off on (editing the text after approval
  un-approves it). Approving does **not** submit anything to Stripe — that's still a manual copy-paste, same as
  the plan's "do it manually for the first 2 customers."
- **Dashboard** (`/dashboard`, HTTP Basic-authed) — lists every dispute across merchants with status, evidence,
  and narrative-review state (`—` / `needs review` / `approved`); click a merchant name for the detail page.

**Week 4 — launch and charge:**

- **Platform billing** (`src/lib/platformStripe.ts`, `src/lib/billing.ts`) — a *second*, separate Stripe
  integration: OUR OWN Stripe account (never a merchant's), used only to bill the success fee. A merchant's
  `POST /api/merchants/[id]/billing-setup` starts a Checkout Session (setup mode) to collect a card; our own
  webhook (`POST /api/webhooks/platform`) saves the resulting payment method. When a merchant's own webhook
  reports `charge.dispute.closed` with `status: "won"`, `chargeSuccessFee` charges 25% (`SUCCESS_FEE_RATE` in
  `src/lib/billing.ts`) of the recovered amount off-session against that card and records a `SuccessFee` row — idempotent (one fee per
  dispute, checked before charging) and resilient (no card on file → `no_payment_method`; a decline or other
  Stripe error → `failed` with the reason, and the webhook still acks 200 so Stripe never retries a billing
  attempt that might double-charge).
- **Dashboard moved to `/dashboard`** and is now gated behind HTTP Basic Auth (`DASHBOARD_USER` /
  `DASHBOARD_PASSWORD`, checked in `src/proxy.ts` — Next.js 16 renamed Middleware to Proxy) — it shows real
  merchant and dispute data, so it can no longer sit unauthenticated at a guessable URL. This is a floor, not
  real auth; replace it before this has more than a couple of trusted operators.
- **Public landing page** (`/`) — value prop, how it works, pricing, and a results section that queries real
  aggregate numbers (disputes handled, win rate, amount recovered) straight from the database. It never
  fabricates a number: with zero disputes on record it says so plainly instead of inventing results.

Not built yet: actually submitting the approved evidence narrative to Stripe (`POST /v1/disputes/:id`) — that
stays a manual copy-paste from the dispute detail page, which the plan itself calls for at this stage.

## Stack

Next.js 16 (App Router, Cache Components) + Prisma ORM **7** (not 8 — 8 is still a pre-release tied to
Prisma's own hosting platform; 7 is the stable classic `schema.prisma` + migrate workflow, which deploys
cleanly to Vercel with any Postgres provider) + Stripe SDK + Anthropic SDK (`claude-opus-5-5`) + Postgres.

## Local setup

Requires Node 22+ and a local or hosted Postgres.

```bash
npm install
```

Copy `.env` and fill in:

| Var | What |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `ENCRYPTION_KEY` | 32-byte hex key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_BASE_URL` | Base URL used to build each merchant's webhook/billing URLs (`http://localhost:3000` locally) |
| `ANTHROPIC_API_KEY` | For narrative drafting. If unset, drafting fails silently (logged, non-fatal) in the webhook/delivery-proof handlers, and returns a clear 502 from the manual `POST .../narrative/draft` route — the rest of the pipeline still works without it. |
| `STRIPE_PLATFORM_SECRET_KEY` | **OUR OWN** Stripe account's secret key — never a merchant's. Used only to bill the success fee. |
| `STRIPE_PLATFORM_WEBHOOK_SECRET` | Signing secret for the one webhook endpoint on our own Stripe account (`/api/webhooks/platform`). |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | HTTP Basic Auth for `/dashboard` and `/disputes/*`. |
| `CONTACT_EMAIL` | Shown on the public landing page's CTA. Set this before actually publishing it. |

```bash
npx prisma7 migrate dev   # creates tables
npm run dev
```

If Stripe calls fail with a DNS error behind a corporate/sandbox proxy, see `src/lib/stripeHttpAgent.ts` —
Stripe's Node SDK talks to the API with Node's `https` module directly, which doesn't read `HTTPS_PROXY` on
its own; that file wires in an explicit proxy agent when one is set, and is a no-op everywhere else (Vercel
included).

## Onboarding a pilot merchant (manual, by design — see "Don't skip" in the plan)

1. `POST /api/merchants` with `name`, `contactEmail`, `stripeApiKey` (their **restricted key**, read-only on
   Charges/Disputes/Customers — never ask for write scopes), and `webhookSecret` (see step 2 — chicken-and-egg,
   so create the merchant first with a placeholder and update it once you have the real secret, or create the
   webhook endpoint first and paste its secret in directly).
2. In the merchant's Stripe dashboard → Developers → Webhooks, add an endpoint at the `webhookUrl` the response
   returned, listening for `charge.dispute.created`. Stripe shows a signing secret (`whsec_...`) — that's what
   goes in `webhookSecret`.
   Also subscribe the endpoint to `charge.dispute.closed` — that's how a win gets detected and billed.
3. Hand the merchant the `deliveryProofUrl` and `deliveryProofToken` from the onboarding response (shown once —
   it's not recoverable, only re-issuable by re-onboarding) so their app can report logins/downloads as evidence.
4. From `/dashboard`, click **Set up billing** next to the merchant — it starts a Checkout Session on OUR OWN
   Stripe account (not theirs) to collect a card for the success fee. Once they add one, billing shows "card
   on file."
5. Trigger a test dispute (Stripe test mode has a "Create test dispute" action), confirm it shows up at
   `/dashboard`, and separately resolve it as won in test mode to confirm the success fee gets charged.

## Deploying

Push to GitHub, import into Vercel, set the env vars above in the project settings, and point `DATABASE_URL`
at a hosted Postgres (Neon, Railway, Supabase all work — the plan's own suggestion). `npx prisma7 migrate
deploy` applies migrations against the production database. In your **own** Stripe account's dashboard, add
one webhook endpoint at `{APP_BASE_URL}/api/webhooks/platform` listening for `checkout.session.completed`,
`payment_intent.succeeded`, and `payment_intent.payment_failed`.
