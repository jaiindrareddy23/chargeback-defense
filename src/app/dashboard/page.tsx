import Link from "next/link";
import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export default async function DashboardPage() {
  const disputes = await prisma.dispute.findMany({
    include: { merchant: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Disputes</h1>
      </div>

      {disputes.length === 0 ? (
        <p className={styles.empty}>
          No disputes yet. Once a merchant connects their Stripe account and a
          chargeback comes in, it will show up here.
        </p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Reason</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((d) => (
              <tr key={d.id}>
                <td>{d.merchant.name ?? d.merchant.email}</td>
                <td>{d.reason}</td>
                <td>{formatAmount(d.amount, d.currency)}</td>
                <td>
                  <span className={styles.badge}>{d.status}</span>
                </td>
                <td>
                  {d.evidenceDueBy
                    ? new Date(d.evidenceDueBy).toLocaleDateString()
                    : "—"}
                </td>
                <td>
                  <Link href={`/dashboard/${d.id}`}>Review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
