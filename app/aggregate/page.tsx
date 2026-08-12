import Link from "next/link";
import { getAllMetrics } from "@/lib/metrics";
import { ExtractButton } from "@/components/ExtractButton";
import styles from "./page.module.css";

// Same reasoning as app/page.tsx: force per-request execution so Extract
// results and newly-scored sessions show up without a stale build-time
// snapshot.
export const dynamic = "force-dynamic";

// Objective filtering still drives the sessions list below via a query
// param ("click the worst objective, see who failed it") — that's a real
// navigation to a genuinely different view, so a page reload is fine.
// Guardrails are different: clicking one is a "tell me more about this
// specific row" action, not a navigation to a new view, so it's a <details>
// that expands in place below (see the Guardrails section) — no URL change,
// no scroll jump, nothing server-rendered has to happen for it.
export default async function AggregatePage({
  searchParams,
}: {
  searchParams: Promise<{ objective?: string }>;
}) {
  const { objective } = await searchParams;
  const metrics = await getAllMetrics();

  const sortedObjectives = [...metrics.objectives].sort(
    (a, b) => a.completionRate - b.completionRate,
  );
  const sortedGuardrails = [...metrics.guardrails].sort(
    (a, b) => b.violatedCount - a.violatedCount || b.heldCount - a.heldCount,
  );

  const filteredSessions = objective
    ? metrics.sessions.filter((s) =>
        s.objectives.some((o) => o.name === objective && o.status !== "completed"),
      )
    : metrics.sessions;

  const noExtractionsYet = metrics.sessions.length === 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1>Aggregate</h1>
          <p>Objective completion, guardrail checks, and turn latency across every scored session.</p>
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
              {sortedObjectives.map((o) => {
                const completedPct = o.total > 0 ? (o.completed / o.total) * 100 : 0;
                const declinedPct = o.total > 0 ? (o.declined / o.total) * 100 : 0;
                return (
                  <Link
                    key={o.name}
                    href={`/aggregate?objective=${encodeURIComponent(o.name)}`}
                    className={styles.row}
                  >
                    <div className={styles.rowTop}>
                      <span className={styles.rowName}>{o.name}</span>
                      <span className={styles.rowStat}>
                        {Math.round(o.completionRate * 100)}%
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barSegmentCompleted}
                        style={{ width: `${completedPct}%` }}
                      />
                      <div
                        className={styles.barSegmentDeclined}
                        style={{ width: `${declinedPct}%` }}
                      />
                    </div>
                    <div className={styles.rowDetail}>
                      {o.completed} completed
                      {o.declined > 0 && ` · ${o.declined} declined`}
                      {o.notCompleted > 0 && ` · ${o.notCompleted} not completed`}
                      {` of ${o.total}`}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className={styles.section}>
            <h2>Guardrails</h2>
            <div className={styles.listWrap}>
              {sortedGuardrails.map((g) => {
                const totalChecks = g.heldCount + g.violatedCount;
                const neverTested = totalChecks === 0;
                const hasViolation = g.violatedCount > 0;
                const dotClass = neverTested
                  ? styles.dotMuted
                  : hasViolation
                    ? styles.dotError
                    : styles.dotSuccess;
                const detail = neverTested
                  ? "Never tested"
                  : hasViolation
                    ? `${g.violatedCount} violated · ${g.heldCount} held`
                    : `Held ${g.heldCount} time${g.heldCount === 1 ? "" : "s"}`;

                const summary = (
                  <div className={styles.rowTop}>
                    <div className={styles.dotRow}>
                      <span className={`${styles.dot} ${dotClass}`} />
                      <span className={styles.rowName}>{g.name}</span>
                    </div>
                    <span className={styles.rowStat}>{neverTested ? "—" : totalChecks}</span>
                  </div>
                );

                // Never-tested guardrails have nothing to expand into, so
                // they're a plain row, not a <details> — no point offering
                // to expand an empty list.
                if (neverTested) {
                  return (
                    <div key={g.name} className={styles.row}>
                      {summary}
                      <div className={styles.rowDetail}>{detail}</div>
                    </div>
                  );
                }

                // Which sessions actually hit this guardrail, with each
                // one's own outcome — computed here rather than via a page
                // navigation, so expanding a row never moves the scroll
                // position (the whole point of switching this off the
                // query-param/Link pattern the objective rows still use).
                const matchingSessions = metrics.sessions
                  .map((s) => ({
                    session: s,
                    check: s.guardrailChecks.find((c) => c.name === g.name),
                  }))
                  .filter(
                    (m): m is { session: (typeof metrics.sessions)[number]; check: NonNullable<typeof m.check> } =>
                      m.check !== undefined,
                  );

                return (
                  <details key={g.name} className={styles.row}>
                    <summary className={styles.guardrailSummary}>
                      {summary}
                      <div className={styles.rowDetail}>{detail}</div>
                    </summary>
                    <div className={styles.guardrailSessions}>
                      {matchingSessions.map(({ session, check }) => (
                        <Link
                          key={session.conversationId}
                          href={`/sessions/${session.conversationId}`}
                          className={styles.guardrailSessionRow}
                        >
                          <span className={styles.mono}>{session.conversationId}</span>
                          <span
                            className={
                              check.outcome === "violated"
                                ? styles.outcomeViolated
                                : styles.outcomeHeld
                            }
                          >
                            {check.outcome === "violated" ? "Violated" : "Held"} at turn{" "}
                            {check.turn_idx}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>

          <section className={styles.section}>
            <h2>Sessions</h2>
            {objective && (
              <div className={styles.filterBanner}>
                <span>
                  Showing sessions where <strong>{objective}</strong> was not completed
                </span>
                <Link href="/aggregate">Clear filter</Link>
              </div>
            )}
            <div className={styles.listWrap}>
              {filteredSessions.length === 0 && (
                <p className={styles.empty}>No sessions match this filter.</p>
              )}
              {filteredSessions.map((s) => {
                const hasViolation = s.guardrailChecks.some((g) => g.outcome === "violated");
                const hasIncomplete = s.objectives.some((o) => o.status === "not_completed");
                const dotClass = hasViolation
                  ? styles.dotError
                  : hasIncomplete
                    ? styles.dotWarning
                    : styles.dotSuccess;
                return (
                  <Link
                    key={s.conversationId}
                    href={`/sessions/${s.conversationId}`}
                    className={styles.row}
                  >
                    <div className={styles.rowTop}>
                      <div className={styles.dotRow}>
                        <span className={`${styles.dot} ${dotClass}`} />
                        <span className={`${styles.rowName} ${styles.mono}`}>
                          {s.conversationId}
                        </span>
                      </div>
                      <span className={styles.rowCounts}>{s.personaName ?? "unknown persona"}</span>
                    </div>
                    {s.dropOffTurn != null && (
                      <div className={styles.rowDetail}>Dropped off at turn {s.dropOffTurn}</div>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
