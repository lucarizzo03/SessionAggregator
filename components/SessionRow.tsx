"use client";

import { useRouter } from "next/navigation";
import type { ConversationListRow } from "@/lib/queries";
import styles from "./SessionRow.module.css";

// A <tr> can't hold an <a> as a valid child (table row children must be
// <td>/<th>), so "click anywhere in the row" needs either CSS trickery
// (a Link stretched with display:contents) or a small onClick handler. This
// is the one place router.push() is used directly rather than <Link>; kept
// as its own component so the page above it stays a plain Server Component.
export function SessionRow({ conversation }: { conversation: ConversationListRow }) {
  const router = useRouter();

  return (
    <tr className={styles.row} onClick={() => router.push(`/sessions/${conversation.conversation_id}`)}>
      <td className={styles.mono}>{conversation.conversation_id}</td>
      <td>{conversation.status ?? <span className={styles.muted}>—</span>}</td>
      <td className={styles.mono}>
        {conversation.duration != null ? `${conversation.duration}s` : <span className={styles.muted}>—</span>}
      </td>
      <td>{conversation.event_count}</td>
      <td>{conversation.has_perception ? "Yes" : "No"}</td>
    </tr>
  );
}
