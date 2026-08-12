import Link from "next/link";
import { notFound } from "next/navigation";
import { getConversation } from "@/lib/queries";
import { normalizeTranscript } from "@/lib/tavus";
import styles from "./page.module.css";

// See app/page.tsx for why this is needed: without it, Next would try to
// statically prerender this route at build time instead of reading fresh
// data (and a new conversation would 404 forever, since a static build
// could only ever have prerendered ids that existed at build time).
export const dynamic = "force-dynamic";

// Dynamic route params arrive as a Promise in this Next.js version.
export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) notFound();

  const turns = normalizeTranscript(conversation.transcript);

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>
        ← Sessions
      </Link>
      <h1 className={styles.title}>{conversation.conversation_id}</h1>

      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Status</span>
          <span className={styles.metaValue}>{conversation.status ?? "—"}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Last synced</span>
          <span className={`${styles.metaValue} ${styles.mono}`}>
            {new Date(conversation.fetched_at).toISOString()}
          </span>
        </div>
      </div>

      <section className={styles.perception}>
        <h2>End-of-call perception analysis</h2>
        {/* Rendered as preformatted text, not markdown-rendered: Tavus
            returns this as free-text prose and this version deliberately
            doesn't parse or render it beyond preserving line breaks.
            Fraunces + amber border (see page.module.css .interpretive) mark
            this as the model's read, not measured data. */}
        <pre className={styles.interpretive}>
          {conversation.perception_analysis ?? "Not available for this conversation."}
        </pre>
      </section>

      <section className={styles.transcriptSection}>
        <h2>Transcript</h2>
        {turns.length === 0 && <p className={styles.empty}>No transcript available.</p>}
        {turns.map((t, i) => (
          <div key={i} className={styles.turn}>
            <div className={styles.turnMeta}>
              <span className={styles.mono}>{t.timestamp ?? "—"}</span>
              <span className={styles.role}>{t.role ?? "unknown"}</span>
            </div>
            <pre className={styles.prose}>{t.text ?? "—"}</pre>
          </div>
        ))}
      </section>

      {/* Exists for schema discovery, not as a planned feature: since the
          transcript/perception field names above are guesses (lib/tavus.ts),
          being able to see exactly what Tavus sent is how those guesses get
          corrected once real calls run. */}
      <details className={styles.rawSection}>
        <summary>Raw conversation payload ({`/api/sync` } response, as stored)</summary>
        <pre className={styles.prose}>{JSON.stringify(conversation.raw, null, 2)}</pre>
      </details>
    </div>
  );
}
