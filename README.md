# Chargeback Defense

Week 2 + 3 build from the [launch plan](https://claude.ai/artifact/Tr7A1686B9RQjSqZES8nfS): the pipeline that
watches a merchant's Stripe account for new disputes, collects evidence automatically, and drafts (for human
review) the narrative that goes back to Stripe.

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
- **Dashboard** (`/`) — lists every dispute across merchants with status, evidence, and narrative-review state
  (`—` / `needs review` / `approved`); click a merchant name for the detail page.

Not built yet: actually submitting evidence to Stripe (`POST /v1/disputes/:id`) and Stripe billing for the
success fee (both Week 4 per the plan).

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
| `APP_BASE_URL` | Base URL used to build each merchant's webhook URL (`http://localhost:3000` locally) |
| `ANTHROPIC_API_KEY` | For narrative drafting. If unset, drafting fails silently (logged, non-fatal) in the webhook/delivery-proof handlers, and returns a clear 502 from the manual `POST .../narrative/draft` route — the rest of the pipeline still works without it. |

```bash
npx prisma7 migrate dev   # creates tables
npm run dev
```

## Onboarding a pilot merchant (manual, by design — see "Don't skip" in the plan)

1. `POST /api/merchants` with `name`, `contactEmail`, `stripeApiKey` (their **restricted key**, read-only on
   Charges/Disputes/Customers — never ask for write scopes), and `webhookSecret` (see step 2 — chicken-and-egg,
   so create the merchant first with a placeholder and update it once you have the real secret, or create the
   webhook endpoint first and paste its secret in directly).
2. In the merchant's Stripe dashboard → Developers → Webhooks, add an endpoint at the `webhookUrl` the response
   returned, listening for `charge.dispute.created`. Stripe shows a signing secret (`whsec_...`) — that's what
   goes in `webhookSecret`.
3. Hand the merchant the `deliveryProofUrl` and `deliveryProofToken` from the onboarding response (shown once —
   it's not recoverable, only re-issuable by re-onboarding) so their app can report logins/downloads as evidence.
4. Trigger a test dispute (Stripe test mode has a "Create test dispute" action) and confirm it shows up at `/`.

## Deploying

Push to GitHub, import into Vercel, set the four env vars above in the project settings, and point
`DATABASE_URL` at a hosted Postgres (Neon, Railway, Supabase all work — the plan's own suggestion).
`npx prisma7 migrate deploy` applies migrations against the production database.
