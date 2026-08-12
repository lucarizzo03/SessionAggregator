import Link from "next/link";
import { getAllMetrics } from "@/lib/metrics";
import { ExtractButton } from "@/components/ExtractButton";
import styles from "./page.module.css";

// Same reasoning as app/page.tsx: force per-request execution so Extract
// results and newly-scored sessions show up without a stale build-time
// snapshot.
export const dynamic = "force-dynamic";

// Query params drive the "click an objective/guardrail to filter the
// sessions list" interaction (see PLAN.md Step 4) entirely server-side —
// no client state needed, consistent with the rest of the app being
// Server Components. Only one filter applies at a time: each Link below
// sets exactly one param, so clicking a new one always replaces the other.
export default async function AggregatePage({
  searchParams,
}: {
  searchParams: Promise<{ objective?: string; guardrail?: string }>;
}) {
  const { objective, guardrail } = await searchParams;
  const metrics = await getAllMetrics();

  const sortedObjectives = [...metrics.objectives].sort(
    (a, b) => a.completionRate - b.completionRate,
  );
  const sortedGuardrails = [...metrics.guardrails].sort((a, b) => b.fireCount - a.fireCount);

  const filteredSessions = objective
    ? metrics.sessions.filter((s) =>
        s.objectives.some((o) => o.name === objective && o.status !== "completed"),
      )
    : guardrail
      ? metrics.sessions.filter((s) => s.guardrailFires.some((g) => g.name === guardrail))
      : metrics.sessions;

  const noExtractionsYet = metrics.sessions.length === 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1>Aggregate</h1>
          <p>Objective completion, guardrail fires, and turn latency across every scored session.</p>
        </div>
        <ExtractButton />
      </div>

      {noExtractionsYet ? (
        <p className={styles.empty}>
          No sessions have been scored yet. Click Extract to score any synced conversation
          against its persona&apos;s objectives and guardrails.
        </p>
      ) : (
        <>
          <div className={styles.statRow}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Turn latency (median)</span>
              <span className={styles.statValue}>
                {metrics.turnLatency.medianSeconds != null
                  ? metrics.turnLatency.medianSeconds.toFixed(1)
                  : "—"}
                <span className={styles.statUnit}>sec</span>
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Turn latency (p95)</span>
              <span className={styles.statValue}>
                {metrics.turnLatency.p95Seconds != null
                  ? metrics.turnLatency.p95Seconds.toFixed(1)
                  : "—"}
                <span className={styles.statUnit}>sec</span>
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Dropped off</span>
              <span className={styles.statValue}>
                {metrics.dropOff.droppedOff}
                <span className={styles.statUnit}>/ {metrics.dropOff.scoredSessions} sessions</span>
              </span>
            </div>
          </div>

          <section className={styles.section}>
            <h2>Objective completion</h2>
            <div className={styles.listWrap}>
              {sortedObjectives.map((o) => (
                <Link
                  key={o.name}
                  href={`/aggregate?objective=${encodeURIComponent(o.name)}`}
                  className={styles.row}
                >
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{o.name}</span>
                    <span className={styles.rowCounts}>
                      {o.completed}/{o.total} completed ({Math.round(o.completionRate * 100)}%)
                      {o.declined > 0 && ` · ${o.declined} declined`}
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{ width: `${o.completionRate * 100}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h2>Guardrails</h2>
            <div className={styles.listWrap}>
              {sortedGuardrails.map((g) => (
                <Link
                  key={g.name}
                  href={`/aggregate?guardrail=${encodeURIComponent(g.name)}`}
                  className={styles.row}
                >
                  <div className={styles.guardrailRow}>
                    <span className={styles.rowName}>{g.name}</span>
                    {g.fireCount === 0 ? (
                      <span className={styles.badgeInfo}>Never fired</span>
                    ) : (
                      <span className={styles.mono}>
                        {g.fireCount} fire{g.fireCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h2>Sessions</h2>
            {(objective || guardrail) && (
              <div className={styles.filterBanner}>
                {objective ? (
                  <span>
                    Showing sessions where <strong>{objective}</strong> was not completed
                  </span>
                ) : (
                  <span>
                    Showing sessions where <strong>{guardrail}</strong> fired
                  </span>
                )}
                <Link href="/aggregate">Clear filter</Link>
              </div>
            )}
            <div className={styles.listWrap}>
              {filteredSessions.length === 0 && (
                <p className={styles.empty}>No sessions match this filter.</p>
              )}
              {filteredSessions.map((s) => (
                <Link
                  key={s.conversationId}
                  href={`/sessions/${s.conversationId}`}
                  className={styles.row}
                >
                  <div className={styles.rowTop}>
                    <span className={`${styles.rowName} ${styles.mono}`}>
                      {s.conversationId}
                    </span>
                    <span className={styles.rowCounts}>
                      {s.personaName ?? "unknown persona"}
                      {s.dropOffTurn != null && ` · dropped off at turn ${s.dropOffTurn}`}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
