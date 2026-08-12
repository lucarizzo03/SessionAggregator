// Inserts two fake conversations (with transcripts shaped per the field
// guesses in lib/tavus.ts), so the UI can be exercised before any real
// calls have run. Real sessions land via /api/sync — this script is purely
// for viewing the UI in the meantime. Uses tagged-template sql calls (one
// literal per insert) rather than sql.query(), since every statement here
// is static and parameterized — the template form is the safer default and
// is what the app code uses elsewhere.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { neon } = require("@neondatabase/serverless");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set (checked .env.local and .env)");
  }
  const sql = neon(databaseUrl);

  const transcriptA = [
    {
      role: "agent",
      content: "Hi, thanks for joining — can you tell me a bit about what brought you in today?",
      timestamp: "2026-08-10T14:02:01.000Z",
      visual_analysis: "Neutral posture, direct eye contact with camera, slight forward lean suggesting engagement.",
      audio_analysis: "Even pacing, moderate pitch variation, no signs of hesitation.",
    },
    {
      role: "user",
      content: "Sure — we've been trying to get our onboarding flow to convert better and it's been rough.",
      timestamp: "2026-08-10T14:02:14.500Z",
      visual_analysis: "Brief downward glance before answering, then re-engages with camera.",
      audio_analysis: "Slightly hesitant onset, pace increases mid-sentence, tone flattens on 'rough'.",
    },
    {
      role: "agent",
      content: "Got it. When you say rough, is that a drop-off problem or more of a support-ticket-volume problem?",
      timestamp: "2026-08-10T14:02:29.000Z",
      visual_analysis: "Stable frontal gaze, minimal movement.",
      audio_analysis: "Clear articulation, question intonation on final clause.",
    },
  ];

  const transcriptB = [
    {
      role: "agent",
      content: "Let's pick up where we left off — did the change to the pricing page ship?",
      timestamp: "2026-08-11T09:15:00.000Z",
      visual_analysis: "Camera slightly off-center, participant adjusting position at start of turn.",
      audio_analysis: "Background noise present, speech otherwise clear.",
    },
    {
      role: "user",
      content: "It did, but we're already seeing some confusion around the annual toggle.",
      timestamp: "2026-08-11T09:15:12.000Z",
      visual_analysis: "Furrowed brow during 'confusion', otherwise steady gaze.",
      audio_analysis: "Downward pitch on 'confusion', pace slows.",
    },
  ];

  await sql`
    insert into conversations
      (conversation_id, status, duration, perception_analysis, transcript, raw, fetched_at)
    values (
      ${"seed-conversation-1"},
      ${"ended"},
      ${187},
      ${"Overall the participant appeared engaged throughout, with a brief dip in confidence when describing the onboarding problem. Tone stayed collaborative; no signs of frustration directed at the agent. Recommend following up on the drop-off vs. ticket-volume distinction raised near the start of the call."},
      ${JSON.stringify(transcriptA)}::jsonb,
      ${JSON.stringify({ conversation_id: "seed-conversation-1", status: "ended", transcript: transcriptA, seeded: true })}::jsonb,
      now()
    )
    on conflict (conversation_id) do update set
      status = excluded.status,
      duration = excluded.duration,
      perception_analysis = excluded.perception_analysis,
      transcript = excluded.transcript,
      raw = excluded.raw,
      fetched_at = excluded.fetched_at
  `;

  await sql`
    insert into conversations
      (conversation_id, status, duration, perception_analysis, transcript, raw, fetched_at)
    values (
      ${"seed-conversation-2"},
      ${"ended"},
      ${94},
      ${null},
      ${JSON.stringify(transcriptB)}::jsonb,
      ${JSON.stringify({ conversation_id: "seed-conversation-2", status: "ended", transcript: transcriptB, seeded: true })}::jsonb,
      now()
    )
    on conflict (conversation_id) do update set
      status = excluded.status,
      duration = excluded.duration,
      perception_analysis = excluded.perception_analysis,
      transcript = excluded.transcript,
      raw = excluded.raw,
      fetched_at = excluded.fetched_at
  `;

  console.log("Seeded 2 conversations.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
