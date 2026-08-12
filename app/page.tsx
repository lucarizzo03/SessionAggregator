import { getConversations } from "@/lib/queries";
import { SyncButton } from "@/components/SyncButton";
import { SessionRow } from "@/components/SessionRow";
import styles from "./page.module.css";

// Without this, Next would try to statically prerender this page at build
// time (there's no cookies()/headers() call for it to infer dynamism from)
// and cache that snapshot — meaning Sync would write fresh rows to Postgres
// that the page never shows until the next deploy. force-dynamic makes every
// request re-run the query.
export const dynamic = "force-dynamic";

// Server Component: runs on the server per request, queries Postgres
// directly via lib/queries, and streams HTML. No client-side fetch/loading
// state needed for the initial load — that's what app/loading.tsx (the
// skeleton) covers via Next's automatic Suspense boundary per route.
export default async function SessionsPage() {
  const conversations = await getConversations();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1>Sessions</h1>
          <p>Pulled conversation transcripts and end-of-call analysis.</p>
        </div>
        <SyncButton />
      </div>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Conversation ID</th>
              <th>Status</th>
              <th>Perception</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <SessionRow key={c.conversation_id} conversation={c} />
            ))}
            {conversations.length === 0 && (
              <tr>
                <td colSpan={3} className={styles.empty}>
                  No sessions yet. Run a sync, or seed the database to preview the UI.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
