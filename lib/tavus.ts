// Every field-name guess about Tavus's JSON shapes lives in this file and
// nowhere else. The exact verbose=true conversation shape is not fully
// documented, so extraction here is deliberately defensive: try a short
// list of plausible key paths, return null if none match, never throw.
// Once real payloads have been captured (they're preserved in full in
// conversations.raw regardless of whether extraction succeeds), update the
// candidate paths below against what was actually observed.

type JsonObject = Record<string, unknown>;

function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as JsonObject)[key];
  }
  return cur;
}

function firstString(obj: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const val = get(obj, path);
    if (typeof val === "string" && val.length > 0) return val;
  }
  return null;
}

function firstNumber(obj: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const val = get(obj, path);
    if (typeof val === "number") return val;
  }
  return null;
}

function firstDefined(obj: unknown, paths: string[][]): unknown {
  for (const path of paths) {
    const val = get(obj, path);
    if (val !== undefined && val !== null) return val;
  }
  return null;
}

// CONFIRMED against two real conversations (2026-08-11 and 2026-08-12):
// transcript[].timestamp is not consistently typed. One call's transcript
// had it as an ISO 8601 string ("2026-08-11T23:02:15.957838Z"); another
// had it as a Unix epoch float ("1786505572.3161497", seconds since
// epoch) — same field, same application.transcription_ready event type,
// genuinely inconsistent across payloads rather than a guess. A plain
// firstString here would silently return null for every turn on the
// number-typed payloads, which is exactly what happened before this was
// caught: every timestamp rendered as "—" for a conversation whose
// transcript used the numeric form.
function firstTimestamp(obj: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const val = get(obj, path);
    if (typeof val === "string" && val.length > 0) return val;
    if (typeof val === "number") return new Date(val * 1000).toISOString();
  }
  return null;
}

export interface ConversationDetailFields {
  status: string | null;
  duration: number | null;
  perceptionAnalysis: string | null;
  transcript: unknown;
  personaId: string | null;
}

// CONFIRMED against 4 real conversations (2026-08-11): the top-level
// persona-reference field is named inconsistently across rows from the
// same account — "persona_id" on 3, "pal_id" on the 4th (same ID value
// format, e.g. "p1fec29e7f23"), never both on the same row. This isn't a
// guess-chain papering over an unknown field name; it's Tavus mid-rename
// from "Persona" to "Pal" terminology (confirmed further by GET /v2/pals
// returning the identical resource as GET /v2/personas, field-for-field
// renamed persona_* -> pal_*). A row with neither is logged by the caller
// rather than silently written as null — see scripts/backfill-personas.js.
export function extractPersonaId(detail: unknown): string | null {
  return firstString(detail, [["persona_id"], ["pal_id"]]);
}

// CONFIRMED against a real GET /v2/conversations/{id}?verbose=true response
// (4 live conversations, 2026-08-11): there is no top-level "duration",
// "perception_analysis", or "transcript" field. Instead the response has a
// flat "events" array — the same event log that gets pushed to callback_url
// during the call, replayed in full — and both transcript and perception
// analysis are nested inside specific entries of it:
//   - one "application.transcription_ready" event, whose
//     properties.transcript is the full turn-by-turn array (role/content/
//     timestamp per turn — those three field names were guessed correctly).
//   - at most one "application.perception_analysis" event (some calls get
//     "application.perception_unavailable" instead, e.g. reason
//     "no_vision_history"), whose properties.analysis is the end-of-call
//     prose. This appeared exactly once per call regardless of transcript
//     length (seen with 2 turns and with 43 turns) — perception is a single
//     whole-call summary, not one entry per turn.
// duration remains an open guess: no field carries it anywhere in the
// payload observed, so it's left null (rendered as "—") rather than
// computed from timestamps, which would be a real feature add, not
// extraction.
function findEvent(events: unknown, eventType: string): JsonObject | null {
  if (!Array.isArray(events)) return null;
  const found = events.find(
    (e) => e && typeof e === "object" && (e as JsonObject).event_type === eventType,
  );
  return (found as JsonObject | undefined) ?? null;
}

export function extractConversationDetail(detail: unknown): ConversationDetailFields {
  const events = get(detail, ["events"]);

  const transcriptionReady = findEvent(events, "application.transcription_ready");
  const perceptionAnalysis = findEvent(events, "application.perception_analysis");

  return {
    status: firstString(detail, [["status"]]),
    duration: firstNumber(detail, [
      ["duration"],
      ["call_duration"],
      ["duration_seconds"],
    ]),
    perceptionAnalysis: firstString(perceptionAnalysis, [["properties", "analysis"]]),
    transcript: firstDefined(transcriptionReady, [["properties", "transcript"]]),
    personaId: extractPersonaId(detail),
  };
}

export interface NormalizedTurn {
  role: string | null;
  text: string | null;
  timestamp: string | null;
}

// role/content/timestamp field names CONFIRMED against a real
// application.transcription_ready payload.
export function normalizeTranscript(transcript: unknown): NormalizedTurn[] {
  if (!Array.isArray(transcript)) return [];
  return transcript.map((turn) => ({
    role: firstString(turn, [["role"], ["speaker"], ["participant"]]),
    text: firstString(turn, [["content"], ["text"], ["transcript"]]),
    timestamp: firstTimestamp(turn, [["timestamp"], ["start_time"], ["time"]]),
  }));
}
