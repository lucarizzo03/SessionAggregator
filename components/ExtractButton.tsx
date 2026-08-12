"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./ExtractButton.module.css";

// Mirrors SyncButton: the one other place besides Sync that triggers real
// work (an LLM pass) rather than reading data, so it stays a client
// component for the same reason.
export function ExtractButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "extracting" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("extracting");
    setMessage(null);
    try {
      const res = await fetch("/api/extract", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extract failed");
      setMessage(`Scored ${data.extracted} session${data.extracted === 1 ? "" : "s"}`);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Extract failed");
    }
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.button} onClick={handleClick} disabled={status === "extracting"}>
        {status === "extracting" ? "Extracting…" : "Extract"}
      </button>
      {message && (
        <span className={status === "error" ? styles.error : styles.message}>{message}</span>
      )}
    </div>
  );
}
