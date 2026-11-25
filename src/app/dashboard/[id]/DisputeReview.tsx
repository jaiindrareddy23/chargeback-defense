"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./page.module.css";

type Status =
  | "NEEDS_EVIDENCE"
  | "DRAFTING"
  | "READY_TO_SUBMIT"
  | "SUBMITTED"
  | "WON"
  | "LOST";

export function DisputeReview({
  disputeId,
  initialNarrative,
  initialApproved,
  initialStatus,
}: {
  disputeId: string;
  initialNarrative: string;
  initialApproved: boolean;
  initialStatus: Status;
}) {
  const router = useRouter();
  const [narrative, setNarrative] = useState(initialNarrative);
  const [approved, setApproved] = useState(initialApproved);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function redraft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/redraft`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setNarrative(data.narrative ?? "");
      setApproved(false);
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.review}>
      <h2>Evidence narrative</h2>
      <textarea
        className={styles.textarea}
        value={narrative}
        onChange={(e) => setNarrative(e.target.value)}
        rows={12}
      />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button
          disabled={busy}
          onClick={() => save({ narrative, narrativeApproved: false })}
        >
          Save draft
        </button>
        <button disabled={busy} onClick={redraft}>
          Redraft with AI
        </button>
        <button
          disabled={busy || approved}
          onClick={async () => {
            await save({
              narrative,
              narrativeApproved: true,
              status: "READY_TO_SUBMIT",
            });
            setApproved(true);
            setStatus("READY_TO_SUBMIT");
          }}
        >
          Approve
        </button>
        <button
          disabled={busy || status !== "READY_TO_SUBMIT"}
          onClick={async () => {
            await save({ status: "SUBMITTED" });
            setStatus("SUBMITTED");
          }}
        >
          Mark submitted to Stripe
        </button>
      </div>

      <p className={styles.hint}>
        {approved
          ? "Approved — ready to paste into Stripe's evidence form."
          : "Review and edit before approving. Nothing is sent to Stripe automatically."}
      </p>
    </div>
  );
}
