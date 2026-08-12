import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  buildExtractionPrompt,
  callAnthropic,
  parseExtractionResponse,
  EXTRACTION_MODEL,
} from "@/lib/extraction";

interface ConversationForExtraction {
  conversation_id: string;
  transcript: unknown;
  persona_id: string | null;
}

interface PersonaForExtraction {
  name: string | null;
  objectives: unknown;
  guardrails: unknown;
}

// jsonb_typeof(...) = 'array' rather than "transcript is not null": a
// conversation whose pull-side extraction found no
// application.transcription_ready event stores transcript as the JSON
// null literal (via JSON.stringify(null)::jsonb in /api/sync), which is
// NOT the same as a SQL NULL column — "is not null" would incorrectly let
// those through.
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";

  const rows = (force
    ? await sql`
        select c.conversation_id, c.transcript, c.persona_id
        from conversations c
        where jsonb_typeof(c.transcript) = 'array'
      `
    : await sql`
        select c.conversation_id, c.transcript, c.persona_id
        from conversations c
        left join extractions e on e.conversation_id = c.conversation_id
        where e.conversation_id is null
          and jsonb_typeof(c.transcript) = 'array'
      `) as ConversationForExtraction[];

  const results: { conversation_id: string; ok: boolean; error?: string }[] = [];

  for (const row of rows) {
    if (!row.persona_id) {
      results.push({
        conversation_id: row.conversation_id,
        ok: false,
        error: "no persona_id on conversation",
      });
      continue;
    }

    const personaRows = (await sql`
      select name, objectives, guardrails from personas where persona_id = ${row.persona_id}
    `) as PersonaForExtraction[];
    const persona = personaRows[0];
    if (!persona) {
      results.push({
        conversation_id: row.conversation_id,
        ok: false,
        error: `persona ${row.persona_id} not found in personas table`,
      });
      continue;
    }

    const transcript = Array.isArray(row.transcript) ? row.transcript : [];
    const prompt = buildExtractionPrompt(
      {
        name: persona.name,
        objectives: persona.objectives as never,
        guardrails: persona.guardrails as never,
      },
      transcript,
    );

    let rawResponse: string;
    try {
      rawResponse = await callAnthropic(prompt, apiKey);
    } catch (err) {
      results.push({
        conversation_id: row.conversation_id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const parsed = parseExtractionResponse(rawResponse);

    await sql`
      insert into extractions
        (conversation_id, objectives, guardrail_checks, drop_off_turn, model, raw_response, extracted_at)
      values (
        ${row.conversation_id},
        ${parsed ? JSON.stringify(parsed.objectives) : null}::jsonb,
        ${parsed ? JSON.stringify(parsed.guardrailChecks) : null}::jsonb,
        ${parsed ? parsed.dropOffTurn : null},
        ${EXTRACTION_MODEL},
        ${rawResponse},
        now()
      )
      on conflict (conversation_id) do update set
        objectives = excluded.objectives,
        guardrail_checks = excluded.guardrail_checks,
        drop_off_turn = excluded.drop_off_turn,
        model = excluded.model,
        raw_response = excluded.raw_response,
        extracted_at = excluded.extracted_at
    `;

    results.push({
      conversation_id: row.conversation_id,
      ok: parsed !== null,
      error: parsed ? undefined : "model output did not parse as the expected JSON shape",
    });
  }

  return NextResponse.json({ extracted: results.length, results });
}
