"use client";

import { useState } from "react";

export function NarrativeReview({
  disputeId,
  initialNarrative,
  initialApprovedAt,
}: {
  disputeId: string;
  initialNarrative: string | null;
  initialApprovedAt: string | null;
}) {
  const [narrative, setNarrative] = useState(initialNarrative ?? "");
  const [approvedAt, setApprovedAt] = useState(initialApprovedAt);
  const [busy, setBusy] = useState<"draft" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy("draft");
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/narrative/draft`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to draft narrative");
      setNarrative(data.narrative);
      setApprovedAt(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/narrative/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ narrative }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve narrative");
      setApprovedAt(data.narrativeApprovedAt);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2">
      <textarea
        className="w-full rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        rows={6}
        value={narrative}
        onChange={(e) => {
          setNarrative(e.target.value);
          if (approvedAt) setApprovedAt(null); // editing invalidates the prior approval
        }}
        placeholder="No draft yet — click Regenerate draft."
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={regenerate}
          disabled={busy !== null}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {busy === "draft" ? "Drafting…" : "Regenerate draft"}
        </button>
        <button
          onClick={approve}
          disabled={busy !== null || narrative.trim().length === 0}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy === "approve" ? "Approving…" : "Approve this text"}
        </button>
        {approvedAt && (
          <span className="text-sm text-green-700 dark:text-green-400">
            Approved {new Date(approvedAt).toLocaleString()} — still submitted to Stripe manually.
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
