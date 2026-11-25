import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DisputeReview } from "./DisputeReview";
import styles from "./page.module.css";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export default async function DisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      merchant: { select: { name: true, email: true } },
      accessEvents: { orderBy: { occurredAt: "desc" } },
    },
  });

  if (!dispute) notFound();

  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/dashboard">
        ← All disputes
      </Link>
      <h1>{dispute.merchant.name ?? dispute.merchant.email}</h1>

      <dl className={styles.summary}>
        <dt>Reason</dt>
        <dd>{dispute.reason}</dd>
        <dt>Amount</dt>
        <dd>{formatAmount(dispute.amount, dispute.currency)}</dd>
        <dt>Status</dt>
        <dd>{dispute.status}</dd>
        <dt>Evidence due</dt>
        <dd>
          {dispute.evidenceDueBy
            ? new Date(dispute.evidenceDueBy).toLocaleString()
            : "—"}
        </dd>
        <dt>Customer</dt>
        <dd>{dispute.customerEmail ?? "unknown"}</dd>
        <dt>Receipt</dt>
        <dd>
          {dispute.receiptUrl ? (
            <a href={dispute.receiptUrl} target="_blank" rel="noreferrer">
              View receipt
            </a>
          ) : (
            "—"
          )}
        </dd>
      </dl>

      <div className={styles.events}>
        <h2>Proof-of-access events ({dispute.accessEvents.length})</h2>
        {dispute.accessEvents.length === 0 ? (
          <p>No login/download events recorded for this customer.</p>
        ) : (
          <ul>
            {dispute.accessEvents.map((e) => (
              <li key={e.id}>
                {e.eventType} — {new Date(e.occurredAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>

      <DisputeReview
        disputeId={dispute.id}
        initialNarrative={dispute.narrative ?? ""}
        initialApproved={dispute.narrativeApproved}
        initialStatus={dispute.status}
      />
    </div>
  );
}
