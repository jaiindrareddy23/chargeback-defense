import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { NarrativeReview } from "./NarrativeReview";

type DeliveryProofEntry = {
  receivedAt: string;
  loggedInAt: string | null;
  downloadedAt: string | null;
  ipAddress: string | null;
};

async function DisputeDetail({ id }: { id: string }) {
  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: { merchant: { select: { name: true } }, evidence: true },
  });

  if (!dispute) {
    return <p className="text-zinc-500">Dispute not found.</p>;
  }

  const proof = dispute.evidence?.deliveryProof as { entries?: DeliveryProofEntry[] } | null;
  const entries = Array.isArray(proof?.entries) ? proof.entries : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{dispute.merchant.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: dispute.currency.toUpperCase(),
          }).format(dispute.amount / 100)}
          {" · "}
          {dispute.reason.replaceAll("_", " ")}
          {" · "}
          {dispute.status.replaceAll("_", " ")}
          {dispute.evidenceDueBy && <> · evidence due {new Date(dispute.evidenceDueBy).toLocaleDateString()}</>}
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Evidence collected from Stripe
        </h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-500">Customer email</dt>
          <dd>{dispute.evidence?.customerEmail ?? "—"}</dd>
          <dt className="text-zinc-500">Receipt</dt>
          <dd>
            {dispute.evidence?.receiptUrl ? (
              <a className="underline" href={dispute.evidence.receiptUrl} target="_blank" rel="noreferrer">
                view
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-zinc-500">Billing address on file</dt>
          <dd>{dispute.evidence?.billingDetails ? "yes" : "—"}</dd>
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Delivery proof from merchant
        </h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">
            None received yet — the merchant&apos;s app can POST to /api/merchants/[id]/delivery-proof.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
            {entries.map((entry, i) => (
              <li key={i}>
                {new Date(entry.receivedAt).toLocaleString()} — logged in: {entry.loggedInAt ?? "—"}, downloaded:{" "}
                {entry.downloadedAt ?? "—"}, ip: {entry.ipAddress ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Evidence narrative — draft, review before submitting to Stripe
        </h2>
        <NarrativeReview
          disputeId={dispute.id}
          initialNarrative={dispute.evidence?.narrative ?? null}
          initialApprovedAt={dispute.evidence?.narrativeApprovedAt?.toISOString() ?? null}
        />
      </section>
    </div>
  );
}

export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 dark:bg-black">
      <main className="mx-auto max-w-3xl">
        <Suspense fallback={<p className="text-zinc-400">Loading…</p>}>
          {params.then(({ id }) => (
            <DisputeDetail id={id} />
          ))}
        </Suspense>
      </main>
    </div>
  );
}
