// Phase 2 Step 3: pure computation over what's already in Postgres — no LLM
// calls here, everything is either read straight from extractions (already
// LLM-scored in Step 2) or computed from transcript turns with plain math.
// Kept separate from lib/queries.ts since these do real aggregation instead
// of single-table reads/upserts, matching how lib/extraction.ts was split
// out from the sync route for the same reason.

import { sql } from "./db";

export interface ObjectiveStat {
  name: string;
  completed: number;
  declined: number;
  notCompleted: number;
  total: number;
  completionRate: number;
}

// Objective completion rate, per objective name, across every scored
// session. Every extraction lists all of a persona's objectives (the
// extraction prompt requires it, see lib/extraction.ts), so this can just
// fan out extractions.objectives directly — no need to separately join
// personas to know the full objective set, unlike guardrails below.
export async function getObjectiveCompletionStats(): Promise<ObjectiveStat[]> {
  const rows = (await sql`
    select objectives from extractions where objectives is not null
  `) as { objectives: unknown }[];

  const counts = new Map<string, { completed: number; declined: number; notCompleted: number }>();
  for (const row of rows) {
    const objectives = row.objectives as { name: string; status: string }[] | null;
    if (!Array.isArray(objectives)) continue;
    for (const obj of objectives) {
      const entry = counts.get(obj.name) ?? { completed: 0, declined: 0, notCompleted: 0 };
      if (obj.status === "completed") entry.completed++;
      else if (obj.status === "declined") entry.declined++;
      else entry.notCompleted++;
      counts.set(obj.name, entry);
    }
  }

  return Array.from(counts.entries()).map(([name, c]) => {
    const total = c.completed + c.declined + c.notCompleted;
    return { name, ...c, total, completionRate: total > 0 ? c.completed / total : 0 };
  });
}

export interface GuardrailStat {
  personaId: string;
  name: string;
  fireCount: number;
}

// Guardrail fire counts, including guardrails that have NEVER fired.
// Unlike objectives, extractions.guardrail_fires only lists guardrails that
// actually fired (the extraction prompt says so explicitly) — a guardrail
// with zero fires never appears in any extraction row at all, so the only
// way to know it exists and report its count as 0 is to start from the
// persona's full guardrail list and left-join fire counts onto it, not the
// other way around.
export async function getGuardrailFireStats(): Promise<GuardrailStat[]> {
  const personaRows = (await sql`
    select persona_id, guardrails from personas
  `) as { persona_id: string; guardrails: unknown }[];

  const fireRows = (await sql`
    select c.persona_id, e.guardrail_fires
    from extractions e
    join conversations c on c.conversation_id = e.conversation_id
    where e.guardrail_fires is not null and c.persona_id is not null
  `) as { persona_id: string; guardrail_fires: unknown }[];

  const fireCounts = new Map<string, number>();
  for (const row of fireRows) {
    const fires = row.guardrail_fires as { name: string }[] | null;
    if (!Array.isArray(fires)) continue;
    for (const f of fires) {
      const key = `${row.persona_id}::${f.name}`;
      fireCounts.set(key, (fireCounts.get(key) ?? 0) + 1);
    }
  }

  const stats: GuardrailStat[] = [];
  for (const persona of personaRows) {
    const guardrails = persona.guardrails as { guardrail_name: string }[] | null;
    if (!Array.isArray(guardrails)) continue;
    for (const g of guardrails) {
      const key = `${persona.persona_id}::${g.guardrail_name}`;
      stats.push({
        personaId: persona.persona_id,
        name: g.guardrail_name,
        fireCount: fireCounts.get(key) ?? 0,
      });
    }
  }
  return stats;
}

export interface DropOffStats {
  scoredSessions: number;
  droppedOff: number;
  completed: number;
  dropOffTurns: number[];
}

// drop_off_turn is null when a session's extraction reached its natural end
// (see the extraction prompt) — completed here means "the objective chain
// was resolved," not "every objective was completed" (a session can
// legitimately end with a declined objective and still not be a drop-off).
export async function getDropOffStats(): Promise<DropOffStats> {
  const rows = (await sql`select drop_off_turn from extractions`) as {
    drop_off_turn: number | null;
  }[];
  const dropOffTurns = rows
    .map((r) => r.drop_off_turn)
    .filter((v): v is number => v !== null);

  return {
    scoredSessions: rows.length,
    droppedOff: dropOffTurns.length,
    completed: rows.length - dropOffTurns.length,
    dropOffTurns,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export interface TurnLatencyStats {
  sampleCount: number;
  medianSeconds: number | null;
  p95Seconds: number | null;
}

interface RawTranscriptTurn {
  role: string | null;
  seconds_from_start: number | null;
}

// Deltas between consecutive user/assistant turns' seconds_from_start, not
// each turn's own "duration" field: duration is confirmed missing on some
// user turns and always missing on system turns (checked against real
// data), so it'd silently undercount. seconds_from_start is present on
// 100% of turns and already correctly ordered (confirmed against real
// data too), making it the reliable basis for latency. System turns are
// excluded before computing deltas so the (near-zero) gaps between
// system-prompt turns at the start of a call don't pollute the sample.
export async function getTurnLatencyStats(): Promise<TurnLatencyStats> {
  const rows = (await sql`
    select transcript from conversations where jsonb_typeof(transcript) = 'array'
  `) as { transcript: unknown }[];

  const deltas: number[] = [];
  for (const row of rows) {
    const allTurns = row.transcript as RawTranscriptTurn[];
    const turns = allTurns.filter((t) => t?.role === "user" || t?.role === "assistant");
    for (let i = 1; i < turns.length; i++) {
      const prev = turns[i - 1].seconds_from_start;
      const cur = turns[i].seconds_from_start;
      if (typeof prev === "number" && typeof cur === "number") {
        const delta = cur - prev;
        if (delta >= 0) deltas.push(delta);
      }
    }
  }

  return {
    sampleCount: deltas.length,
    medianSeconds: median(deltas),
    p95Seconds: percentile(deltas, 95),
  };
}

export interface TurnCountStat {
  conversationId: string;
  userTurns: number;
  assistantTurns: number;
}

export async function getTurnCountStats(): Promise<TurnCountStat[]> {
  const rows = (await sql`
    select conversation_id, transcript from conversations
    where jsonb_typeof(transcript) = 'array'
  `) as { conversation_id: string; transcript: unknown }[];

  return rows.map((row) => {
    const turns = row.transcript as { role: string | null }[];
    return {
      conversationId: row.conversation_id,
      userTurns: turns.filter((t) => t?.role === "user").length,
      assistantTurns: turns.filter((t) => t?.role === "assistant").length,
    };
  });
}

export interface ScoredSession {
  conversationId: string;
  status: string | null;
  personaName: string | null;
  objectives: { name: string; status: string; turn_idx: number | null }[];
  guardrailFires: { name: string; turn_idx: number }[];
  dropOffTurn: number | null;
}

// Backs the /aggregate page's sessions list — every scored session, with
// enough per-session detail (not just aggregate counts) that the page can
// filter it client-side by objective/guardrail without a second query per
// filter click.
export async function getScoredSessions(): Promise<ScoredSession[]> {
  const rows = (await sql`
    select
      e.conversation_id,
      c.status,
      p.name as persona_name,
      e.objectives,
      e.guardrail_fires,
      e.drop_off_turn
    from extractions e
    join conversations c on c.conversation_id = e.conversation_id
    left join personas p on p.persona_id = c.persona_id
    order by e.extracted_at desc
  `) as {
    conversation_id: string;
    status: string | null;
    persona_name: string | null;
    objectives: unknown;
    guardrail_fires: unknown;
    drop_off_turn: number | null;
  }[];

  return rows.map((r) => ({
    conversationId: r.conversation_id,
    status: r.status,
    personaName: r.persona_name,
    objectives: (r.objectives as ScoredSession["objectives"] | null) ?? [],
    guardrailFires: (r.guardrail_fires as ScoredSession["guardrailFires"] | null) ?? [],
    dropOffTurn: r.drop_off_turn,
  }));
}

export interface AllMetrics {
  objectives: ObjectiveStat[];
  guardrails: GuardrailStat[];
  dropOff: DropOffStats;
  turnLatency: TurnLatencyStats;
  turnCounts: TurnCountStat[];
  sessions: ScoredSession[];
}

export async function getAllMetrics(): Promise<AllMetrics> {
  const [objectives, guardrails, dropOff, turnLatency, turnCounts, sessions] = await Promise.all([
    getObjectiveCompletionStats(),
    getGuardrailFireStats(),
    getDropOffStats(),
    getTurnLatencyStats(),
    getTurnCountStats(),
    getScoredSessions(),
  ]);
  return { objectives, guardrails, dropOff, turnLatency, turnCounts, sessions };
}
