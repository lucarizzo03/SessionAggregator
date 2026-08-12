// One-time (re-runnable) backfill: reads persona_id/pal_id out of the
// conversations already in the database, fetches each distinct persona's
// name/objectives/guardrails from the real Tavus API, and populates the
// personas table plus conversations.persona_id.
//
// Going forward, /api/sync populates conversations.persona_id itself on
// every sync (see extractPersonaId in lib/tavus.ts) — this script exists
// for conversations that were already in the database before that existed,
// and to (re-)populate the personas table's rubric content, which sync
// never touches.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { neon } = require("@neondatabase/serverless");

const TAVUS_BASE_URL = "https://tavusapi.com";

async function fetchJson(path, apiKey) {
  const res = await fetch(`${TAVUS_BASE_URL}${path}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  return { ok: true, body: await res.json() };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.TAVUS_API_KEY;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set (checked .env.local and .env)");
  if (!apiKey) throw new Error("TAVUS_API_KEY is not set (checked .env.local and .env)");
  const sql = neon(databaseUrl);

  const rows = await sql`
    select conversation_id, raw->>'persona_id' as persona_id_field, raw->>'pal_id' as pal_id_field
    from conversations
  `;

  // CONFIRMED (see lib/tavus.ts extractPersonaId): persona_id and pal_id
  // are the same underlying reference, never both present on one row.
  const conversationPersonaIds = rows.map((r) => ({
    conversationId: r.conversation_id,
    personaId: r.persona_id_field ?? r.pal_id_field ?? null,
  }));

  const missing = conversationPersonaIds.filter((r) => !r.personaId);
  for (const m of missing) {
    console.warn(`[backfill] conversation ${m.conversationId} has no persona_id or pal_id`);
  }

  const distinctPersonaIds = [...new Set(conversationPersonaIds.map((r) => r.personaId).filter(Boolean))];
  console.log(`Found ${distinctPersonaIds.length} distinct persona id(s):`, distinctPersonaIds);

  for (const personaId of distinctPersonaIds) {
    const personaRes = await fetchJson(`/v2/personas/${personaId}`, apiKey);
    if (!personaRes.ok) {
      console.warn(`[backfill] GET /v2/personas/${personaId} failed (${personaRes.status}) — skipping`);
      continue;
    }
    const persona = personaRes.body;
    const name = persona.persona_name ?? null;

    let objectives = [];
    if (persona.objectives_id) {
      const objectivesRes = await fetchJson(`/v2/objectives/${persona.objectives_id}`, apiKey);
      if (objectivesRes.ok) {
        objectives = objectivesRes.body.data ?? [];
      } else {
        // CONFIRMED real case, not hypothetical: persona p1fec29e7f23's
        // objectives_id returns 400 "Objectives not found" — an orphaned
        // reference on Tavus's side. Store the persona with objectives: []
        // rather than skip it entirely, so guardrails (which do resolve)
        // still get scored.
        console.warn(
          `[backfill] persona ${personaId}: objectives_id ${persona.objectives_id} failed (${objectivesRes.status}) — storing empty objectives`,
        );
      }
    }

    let guardrails = [];
    if (persona.guardrails_id) {
      const guardrailsRes = await fetchJson(`/v2/guardrails/${persona.guardrails_id}`, apiKey);
      if (guardrailsRes.ok) {
        guardrails = guardrailsRes.body.data ?? [];
      } else {
        console.warn(
          `[backfill] persona ${personaId}: guardrails_id ${persona.guardrails_id} failed (${guardrailsRes.status}) — storing empty guardrails`,
        );
      }
    }

    await sql`
      insert into personas (persona_id, name, objectives, guardrails)
      values (${personaId}, ${name}, ${JSON.stringify(objectives)}::jsonb, ${JSON.stringify(guardrails)}::jsonb)
      on conflict (persona_id) do update set
        name = excluded.name,
        objectives = excluded.objectives,
        guardrails = excluded.guardrails
    `;
    console.log(`Upserted persona ${personaId} (${name}): ${objectives.length} objective(s), ${guardrails.length} guardrail(s)`);
  }

  for (const row of conversationPersonaIds) {
    if (!row.personaId) continue;
    await sql`
      update conversations set persona_id = ${row.personaId} where conversation_id = ${row.conversationId}
    `;
  }

  console.log(`Backfilled persona_id on ${conversationPersonaIds.filter((r) => r.personaId).length} conversation(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
