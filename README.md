# Chargeback Defense

Week 2 build from the [launch plan](https://claude.ai/artifact/Tr7A1686B9RQjSqZES8nfS): the core pipeline that
watches a merchant's Stripe account for new disputes and starts collecting evidence automatically.

## What's here

- **Merchant onboarding** (`POST /api/merchants`) — stores a merchant's Stripe restricted/secret key and
  per-merchant webhook signing secret, both AES-256-GCM encrypted at rest (`src/lib/crypto.ts`).
- **Webhook handler** (`POST /api/webhooks/stripe/[merchantId]`) — verifies the Stripe signature, records
  `charge.dispute.created` events as `Dispute` rows (idempotent on `stripeDisputeId`, so retried webhook
  deliveries don't duplicate).
- **Evidence collector** (`src/lib/evidence.ts`) — on each new dispute, pulls the underlying charge and
  stores billing details, receipt URL, and customer email as an `EvidenceSnapshot`.
- **Dashboard** (`/`) — lists every dispute across merchants with status and whether evidence was collected.

Not built yet (Week 3 per the plan): the merchant-side "did the user log in/download?" delivery-proof webhook,
the LLM-drafted evidence narrative, and actually submitting evidence back to Stripe.

## Stack

Next.js 16 (App Router, Cache Components) + Prisma ORM **7** (not 8 — 8 is still a pre-release tied to
Prisma's own hosting platform; 7 is the stable classic `schema.prisma` + migrate workflow, which deploys
cleanly to Vercel with any Postgres provider) + Stripe SDK + Postgres.

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
| `ANTHROPIC_API_KEY` | Not needed until Week 3 (evidence narratives) |

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
3. Trigger a test dispute (Stripe test mode has a "Create test dispute" action) and confirm it shows up at `/`.

## Deploying

Push to GitHub, import into Vercel, set the four env vars above in the project settings, and point
`DATABASE_URL` at a hosted Postgres (Neon, Railway, Supabase all work — the plan's own suggestion).
`npx prisma7 migrate deploy` applies migrations against the production database.
