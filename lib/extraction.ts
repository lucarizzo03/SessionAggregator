// Step 2 of the Phase 2 spec: one Claude pass per session, scoring the
// transcript against the persona's objectives/guardrails. Kept separate
// from app/api/extract/route.ts the same way lib/tavus.ts is kept separate
// from the routes that use it — this file is the one place that builds the
// prompt, calls the model, and parses its output.

// CORRECTION: PLAN.md's Step 2 spec named the model "claude-sonnet-4-6",
// which isn't a real Anthropic model id. Using "claude-sonnet-5" instead —
// the current Sonnet model — since that's what the id actually maps to.
export const EXTRACTION_MODEL = "claude-sonnet-5";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface PersonaObjective {
  objective_name: string;
  objective_prompt: string;
  next_required_objective?: string;
}

interface PersonaGuardrail {
  guardrail_name: string;
  guardrail_prompt: string;
}

interface TranscriptTurn {
  role: string | null;
  content: string | null;
}

// Tri-state, not boolean: a real session showed a patient explicitly
// decline to answer ("I don't want to answer") and the assistant correctly
// moving on without pressing further (the persona's own
// prevent_interrogation guardrail working as intended) — but a
// completed/not-completed boolean scored that as completed, since the
// topic was raised and closed off even though no information was actually
// gathered. "declined" distinguishes "asked, patient declined, model
// correctly backed off" from either a genuine completion or an objective
// that was never addressed at all — Step 3's metrics need to be able to
// tell those apart.
export type ObjectiveStatus = "completed" | "not_completed" | "declined";

export interface ExtractedObjective {
  name: string;
  status: ObjectiveStatus;
  turn_idx: number | null;
}

export interface ExtractedGuardrailFire {
  name: string;
  turn_idx: number;
}

export interface ExtractionResult {
  objectives: ExtractedObjective[];
  guardrailFires: ExtractedGuardrailFire[];
  dropOffTurn: number | null;
}

// turn_idx here is OUR definition, not a Tavus field: it's the 0-based
// index into the conversation's raw transcript array (the same array
// app/sessions/[id]/page.tsx renders via turns.map((t, i) => ...)), so a
// turn_idx returned by the model points at the same position the UI
// already shows. Real transcript turns have no turn_idx or ordering field
// of their own (confirmed against real data, see PLAN.md) — this is why
// one had to be defined rather than read.
//
// System turns (the rendered system prompt) are excluded from what the
// model sees — they're not something a patient or the assistant "did" in
// the conversation, and the persona's objectives/guardrails are already
// passed in structured form, so re-sending the compiled system prompt back
// to the model would be redundant. Original array indices are preserved
// even with system turns skipped, so a turn_idx gap (e.g. jumping from 0
// to 4) is expected, not a bug.
function buildIndexedTranscript(transcript: unknown[]): string {
  return transcript
    .map((turn, i) => ({ i, turn: turn as TranscriptTurn }))
    .filter(({ turn }) => turn?.role === "user" || turn?.role === "assistant")
    .map(({ i, turn }) => `[turn_idx ${i}] ${turn.role}: ${turn.content ?? ""}`)
    .join("\n");
}

export function buildExtractionPrompt(
  persona: { name: string | null; objectives: PersonaObjective[]; guardrails: PersonaGuardrail[] },
  transcript: unknown[],
): string {
  const objectivesList = persona.objectives
    .map((o) => `- ${o.objective_name}: ${o.objective_prompt}`)
    .join("\n");
  const guardrailsList = persona.guardrails
    .map((g) => `- ${g.guardrail_name}: ${g.guardrail_prompt}`)
    .join("\n");
  const transcriptText = buildIndexedTranscript(transcript);

  return `You are scoring a transcript from a conversation between an AI persona ("assistant") and a user, against the persona's defined objectives and guardrails.

PERSONA: ${persona.name ?? "unknown"}

OBJECTIVES (in intended order):
${objectivesList}

GUARDRAILS (must not be violated):
${guardrailsList}

TRANSCRIPT (user/assistant turns only; each line is tagged with its turn_idx, the position of that turn in the original transcript array):
${transcriptText}

Score this conversation. For each objective, determine its status:
- "completed": the objective's actual goal was satisfied — the specific information was actually gathered, or the specific action actually taken. Merely asking the question is NOT completion; the user has to have actually provided what was asked for.
- "declined": the objective was raised (the assistant asked for it), but the user explicitly refused or declined to answer, and the assistant appropriately did not press further. This is a distinct outcome from "completed" — no information was gathered — and distinct from "not_completed" — the topic WAS raised, just not resolved with an answer.
- "not_completed": the objective was never raised at all, or the conversation ended before it could be resolved either way.

For "completed", turn_idx is the turn where the goal was actually satisfied (usually the user's answer). For "declined", turn_idx is the turn where the user declined. For "not_completed", turn_idx is null.

For each guardrail, determine whether it was violated at any point, and if so, the turn_idx where the violation occurred; a guardrail that was never violated should not appear in guardrail_fires at all. Note that a user declining to answer and the assistant backing off is NOT a guardrail violation by itself — that's the "declined" objective status above, not a guardrail fire.

Determine drop_off_turn: the turn_idx of the last turn before the conversation ended prematurely relative to the objective chain (i.e. before all objectives were addressed and the conversation was closed out), or null if the conversation reached its natural end (all objectives addressed or declined, closing turn present).

Respond with ONLY raw JSON, no markdown code fences, no prose before or after, matching exactly this shape:
{
  "objectives": [{"name": "objective_name", "status": "completed", "turn_idx": 4}],
  "guardrail_fires": [{"name": "guardrail_name", "turn_idx": 7}],
  "drop_off_turn": null
}

Include every objective from the OBJECTIVES list above in "objectives", in the same order. Only include guardrails that actually fired in "guardrail_fires".`;
}

export async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    // No temperature param: the Anthropic API rejects it for this model
    // with "`temperature` is deprecated for this model" (confirmed via a
    // real 400 response, not a guess) — PLAN.md's Step 2 spec called for
    // temperature 0, but that knob doesn't exist here to set.
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const body = await res.json();
  // CONFIRMED against a real response: this model returns extended-thinking
  // blocks by default (content[0].type === "thinking"), with the actual
  // answer in a later block of type "text" — content[0].text is NOT
  // reliably the answer, it doesn't exist on a thinking block at all. Find
  // the text block by type instead of assuming a fixed index.
  const blocks = body?.content;
  const textBlock = Array.isArray(blocks)
    ? blocks.find((b: { type?: string }) => b?.type === "text")
    : undefined;
  const text = textBlock?.text;
  if (typeof text !== "string") {
    throw new Error(`Unexpected Anthropic response shape: ${JSON.stringify(body)}`);
  }
  return text;
}

// Defensive strip of a markdown code fence, in case the model wraps its
// JSON despite being told not to — this is one well-justified strip step
// for a known failure mode, not a chain of guesses about the response
// shape.
export function parseExtractionResponse(raw: string): ExtractionResult | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }

  const obj = parsed as {
    objectives?: unknown;
    guardrail_fires?: unknown;
    drop_off_turn?: unknown;
  };

  if (!Array.isArray(obj.objectives) || !Array.isArray(obj.guardrail_fires)) {
    return null;
  }

  return {
    objectives: obj.objectives as ExtractedObjective[],
    guardrailFires: obj.guardrail_fires as ExtractedGuardrailFire[],
    dropOffTurn: typeof obj.drop_off_turn === "number" ? obj.drop_off_turn : null,
  };
}
