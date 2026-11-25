import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function statusTone(status: string) {
  if (status === "won") return "bg-green-100 text-green-800";
  if (status === "lost") return "bg-red-100 text-red-800";
  if (status.startsWith("warning")) return "bg-amber-100 text-amber-800";
  return "bg-zinc-100 text-zinc-700";
}

// Reads live rows on every request — not cacheable, so it's wrapped in <Suspense>
// below rather than given `'use cache'`.
async function DisputesTable() {
  const disputes = await prisma.dispute.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      merchant: { select: { name: true } },
      evidence: {
        select: { id: true, customerEmail: true, receiptUrl: true, narrative: true, narrativeApprovedAt: true },
      },
    },
  });

  return (
    <>
      <p className="mt-1 text-sm text-zinc-500">
        {disputes.length} dispute{disputes.length === 1 ? "" : "s"} across all merchants.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">Merchant</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Evidence due</th>
              <th className="px-4 py-2">Evidence</th>
              <th className="px-4 py-2">Narrative</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {disputes.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  <Link href={`/disputes/${d.id}`} className="hover:underline">
                    {d.merchant.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{formatMoney(d.amount, d.currency)}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{d.reason.replaceAll("_", " ")}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(d.status)}`}>
                    {d.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {d.evidenceDueBy ? new Date(d.evidenceDueBy).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {d.evidence ? (d.evidence.customerEmail ?? "collected") : "pending"}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {d.evidence?.narrativeApprovedAt
                    ? "approved"
                    : d.evidence?.narrative
                      ? "needs review"
                      : "—"}
                </td>
              </tr>
            ))}
            {disputes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  No disputes yet. Onboard a merchant via POST /api/merchants, then point
                  their Stripe webhook at /api/webhooks/stripe/[merchantId].
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 dark:bg-black">
      <main className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Disputes</h1>
        <Suspense fallback={<p className="mt-1 text-sm text-zinc-400">Loading disputes…</p>}>
          <DisputesTable />
        </Suspense>
      </main>
    </div>
  );
}
