import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Dispute Shield</h1>
        <p>Automated chargeback evidence for Stripe-based SaaS and course sellers.</p>
        <div className={styles.ctas}>
          <Link className={styles.primary} href="/dashboard">
            Open dashboard
          </Link>
          <a className={styles.secondary} href="/api/connect/start">
            Connect a Stripe account
          </a>
        </div>
      </main>
    </div>
  );
}
