import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { SUCCESS_FEE_RATE } from "@/lib/billing";

const feePercent = Math.round(SUCCESS_FEE_RATE * 100);
const contactEmail = process.env.CONTACT_EMAIL ?? "founders@example.com";

function Hero() {
  return (
    <section className="px-6 pt-20 pb-16 text-center sm:pt-28">
      <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
        Stop losing revenue to Stripe disputes you never got a real chance to fight
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
        Built for Stripe-based course creators, indie SaaS, and membership sites. We watch your
        Stripe account, pull the evidence that actually proves delivery — logins, downloads,
        access logs — and draft your dispute response. You review and approve it; we only get
        paid when you win.
      </p>
      <div className="mt-8">
        <a
          href={`mailto:${contactEmail}?subject=Chargeback%20Defense%20pilot`}
          className="inline-flex items-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Talk to us about a pilot
        </a>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Connect Stripe",
      body: "Hand over a read-only restricted key — we never ask for write access, and we never touch your money.",
    },
    {
      title: "We collect evidence and draft your response",
      body: "The moment a dispute comes in, we pull billing details and receipts from Stripe, add any login/download proof your app reports, and draft the narrative for that specific dispute reason.",
    },
    {
      title: "You approve — we bill only on wins",
      body: `You review and approve the draft before anything goes to Stripe. If the dispute is won, we charge ${feePercent}% of the recovered amount. Nothing recovered, nothing charged.`,
    },
  ];
  return (
    <section className="border-t border-zinc-200 px-6 py-16 dark:border-zinc-800">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-zinc-500">
          How it works
        </h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title}>
              <div className="text-sm font-semibold text-zinc-400">{i + 1}</div>
              <h3 className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{step.title}</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="border-t border-zinc-200 px-6 py-16 dark:border-zinc-800">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Pricing</h2>
        <p className="mt-4 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          {feePercent}% of what we recover
        </p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          No contract, no monthly fee, no setup cost. If a dispute isn&apos;t won, you owe nothing.
        </p>
      </div>
    </section>
  );
}

// Live aggregate numbers from the database — never hand-written. Not cacheable
// (reads current rows on every request), so it's wrapped in <Suspense> below.
async function ResultsStats() {
  const [totalDisputes, wonCount, lostCount, recoveredByCurrency] = await Promise.all([
    prisma.dispute.count(),
    prisma.dispute.count({ where: { status: "won" } }),
    prisma.dispute.count({ where: { status: "lost" } }),
    prisma.dispute.groupBy({ by: ["currency"], where: { status: "won" }, _sum: { amount: true } }),
  ]);

  const closedCount = wonCount + lostCount;

  if (totalDisputes === 0) {
    return (
      <p className="text-center text-zinc-600 dark:text-zinc-400">
        We&apos;re just getting started — ask about joining as one of our first pilot merchants.
      </p>
    );
  }

  const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : null;
  const recoveredLines = recoveredByCurrency
    .filter((row) => (row._sum.amount ?? 0) > 0)
    .map((row) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency.toUpperCase() }).format(
        (row._sum.amount ?? 0) / 100
      )
    );

  return (
    <div className="grid grid-cols-1 gap-8 text-center sm:grid-cols-3">
      <div>
        <div className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{totalDisputes}</div>
        <div className="mt-1 text-sm text-zinc-500">disputes handled</div>
      </div>
      <div>
        <div className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          {winRate !== null ? `${winRate}%` : "—"}
        </div>
        <div className="mt-1 text-sm text-zinc-500">win rate so far</div>
      </div>
      <div>
        <div className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          {recoveredLines.length > 0 ? recoveredLines.join(" + ") : "$0"}
        </div>
        <div className="mt-1 text-sm text-zinc-500">recovered for merchants</div>
      </div>
    </div>
  );
}

function Results() {
  return (
    <section className="border-t border-zinc-200 px-6 py-16 dark:border-zinc-800">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Early pilot results
        </h2>
        <div className="mt-8">
          <Suspense fallback={<p className="text-center text-zinc-400">Loading…</p>}>
            <ResultsStats />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Hero />
      <HowItWorks />
      <Pricing />
      <Results />
      <footer className="border-t border-zinc-200 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
        Questions? <a className="underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>
      </footer>
    </div>
  );
}
