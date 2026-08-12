import Link from "next/link";
import { notFound } from "next/navigation";
import { getConversationWithEvents } from "@/lib/queries";
import { normalizeTranscript, extractUtteranceAnalysis } from "@/lib/tavus";
import styles from "./page.module.css";

// See app/page.tsx for why this is needed: without it, Next would try to
// statically prerender this route at build time instead of reading fresh
// data (and a new conversation's events would 404 forever, since a static
// build could only ever have prerendered ids that existed at build time).
export const dynamic = "force-dynamic";

// Dynamic route params arrive as a Promise in this Next.js version.
export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getConversationWithEvents(id);
  if (!result) notFound();
  const { conversation, events } = result;

  // Transcript turns come from the pull side (conversation.transcript);
  // per-utterance visual/audio analysis comes from the push side (events
  // pushed live to the webhook during the call) and only exists for user
  // turns using the Raven-1 persona — see lib/tavus.ts. The two are joined
  // by inference_id, the one field that appears on both a pulled transcript
  // entry and its corresponding pushed conversation.utterance event.
  const turns = normalizeTranscript(conversation.transcript);
  const utteranceAnalysis = extractUtteranceAnalysis(events);

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
          <span className={styles.metaLabel}>Duration</span>
          <span className={`${styles.metaValue} ${styles.mono}`}>
            {conversation.duration != null ? `${conversation.duration}s` : "—"}
          </span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Events received</span>
          <span className={styles.metaValue}>{events.length}</span>
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

      <div className={styles.columns}>
        <div className={styles.column}>
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
        </div>

        <div className={styles.column}>
          <h2>Per-utterance analysis</h2>
          {turns.length === 0 && <p className={styles.empty}>No per-utterance analysis available.</p>}
          {/* Only ever populated for user turns on a Raven-1 persona, and
              only if the webhook was live (deployed, callback_url pointed
              here) during this specific call — see lib/tavus.ts. */}
          {turns.map((t, i) => {
            const analysis = t.inferenceId ? utteranceAnalysis.get(t.inferenceId) : undefined;
            return (
              <div key={i} className={styles.turn}>
                <div className={styles.turnMeta}>
                  <span className={styles.mono}>{t.timestamp ?? "—"}</span>
                </div>
                <p className={styles.label}>Visual</p>
                <pre className={styles.interpretive}>{analysis?.visual ?? "—"}</pre>
                <p className={styles.label}>Audio</p>
                <pre className={styles.interpretive}>{analysis?.audio ?? "—"}</pre>
              </div>
            );
          })}
        </div>
      </div>

      {/* These two panels exist for schema discovery, not as a planned
          feature: since the transcript/perception field names above are
          guesses (lib/tavus.ts), being able to see exactly what Tavus sent
          is how those guesses get corrected once real calls run. */}
      <details className={styles.rawSection}>
        <summary>Raw conversation payload ({`/api/sync` } response, as stored)</summary>
        <pre className={styles.prose}>{JSON.stringify(conversation.raw, null, 2)}</pre>
      </details>

      <details className={styles.rawSection}>
        <summary>Raw events ({events.length})</summary>
        <div className={styles.eventsTableWrap}>
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Type</th>
                <th>Raw</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className={styles.mono}>{new Date(e.received_at).toISOString()}</td>
                  <td>{e.event_type ?? "—"}</td>
                  <td className={styles.eventRaw}>
                    <pre>{JSON.stringify(e.raw, null, 2)}</pre>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={3} className={styles.empty}>
                    No events received for this conversation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
