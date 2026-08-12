"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./SyncButton.module.css";

// This has to be a client component: it needs onClick and fetch(). The rest
// of the app is server components reading straight from Postgres, so this
// is the one place that talks to the API layer instead of lib/queries
// directly — which is correct here, since triggering a sync is a real user
// action, not a data read.
export function SyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("syncing");
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setMessage(`Synced ${data.synced} conversation${data.synced === 1 ? "" : "s"}`);
      setStatus("idle");
      // Re-runs the Server Component tree for the current route, so the
      // table picks up whatever /api/sync just wrote without a full reload.
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Sync failed");
    }
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.button} onClick={handleClick} disabled={status === "syncing"}>
        {status === "syncing" ? "Syncing…" : "Sync"}
      </button>
      {message && (
        <span className={status === "error" ? styles.error : styles.message}>{message}</span>
      )}
    </div>
  );
}
