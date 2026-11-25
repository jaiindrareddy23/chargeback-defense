"use client";

import { useState } from "react";

export function BillingSetupButton({ merchantId }: { merchantId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchants/${merchantId}/billing-setup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start billing setup");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <span>
      <button
        onClick={start}
        disabled={busy}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {busy ? "Starting…" : "Set up billing"}
      </button>
      {error && <span className="ml-2 text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
