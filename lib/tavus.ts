// Every field-name guess about Tavus's JSON shapes lives in this file and
// nowhere else. The webhook event schema and the exact verbose=true
// conversation shape are not fully documented, so extraction here is
// deliberately defensive: try a short list of plausible key paths, return
// null if none match, never throw. Once real payloads have been captured
// (they're preserved in full in events.raw / conversations.raw regardless
// of whether extraction succeeds), update the candidate paths below against
// what was actually observed.

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

// ASSUMPTION: webhook bodies carry the conversation id either at the top
// level or nested under a "conversation"/"data"/"properties" envelope.
// Verify against the docs / a captured payload.
export function extractConversationId(body: unknown): string | null {
  return firstString(body, [
    ["conversation_id"],
    ["conversation", "conversation_id"],
    ["data", "conversation_id"],
    ["properties", "conversation_id"],
  ]);
}

// ASSUMPTION: the event discriminator is called "event_type", but callback
// payloads across similar platforms often use "type" or "event" instead.
export function extractEventType(body: unknown): string | null {
  return firstString(body, [
    ["event_type"],
    ["type"],
    ["event"],
    ["message_type"],
  ]);
}

export interface ConversationDetailFields {
  status: string | null;
  duration: number | null;
  perceptionAnalysis: string | null;
  transcript: unknown;
}

// ASSUMPTION: the GET /v2/conversations/{id}?verbose=true response exposes
// status/duration/perception_analysis/transcript at the top level. duration
// might instead be something the API omits entirely (computed client-side
// from transcript timestamps) — if so this will just come back null, which
// the UI already renders as "—".
export function extractConversationDetail(detail: unknown): ConversationDetailFields {
  return {
    status: firstString(detail, [["status"]]),
    duration: firstNumber(detail, [
      ["duration"],
      ["call_duration"],
      ["duration_seconds"],
    ]),
    perceptionAnalysis: firstString(detail, [
      ["perception_analysis"],
      ["perception"],
      ["analysis"],
    ]),
    transcript: firstDefined(detail, [["transcript"], ["events"]]),
  };
}

export interface NormalizedTurn {
  role: string | null;
  text: string | null;
  timestamp: string | null;
  visual: string | null;
  audio: string | null;
}

// ASSUMPTION: each transcript entry carries its own visual/audio perception
// prose "aligned to the same turns" per the brief. If verbose=true actually
// returns transcript text and perception analysis as separate arrays that
// need matching up (e.g. by index or timestamp), this will silently return
// nulls for visual/audio rather than misaligning them — safer than a wrong
// guess, but worth checking against a real payload.
export function normalizeTranscript(transcript: unknown): NormalizedTurn[] {
  if (!Array.isArray(transcript)) return [];
  return transcript.map((turn) => ({
    role: firstString(turn, [["role"], ["speaker"], ["participant"]]),
    text: firstString(turn, [["content"], ["text"], ["transcript"]]),
    timestamp: firstString(turn, [["timestamp"], ["start_time"], ["time"]]),
    visual: firstString(turn, [
      ["visual_analysis"],
      ["perception_visual"],
      ["visual"],
    ]),
    audio: firstString(turn, [
      ["audio_analysis"],
      ["perception_audio"],
      ["audio"],
    ]),
  }));
}
