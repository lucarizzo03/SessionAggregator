import { NextResponse } from "next/server";
import { getConversations } from "@/lib/queries";

// Same reasoning as app/page.tsx: force per-request execution so this never
// serves a build-time-cached list.
export const dynamic = "force-dynamic";

// The UI's own pages call getConversations() directly as a Server
// Component (see app/page.tsx) rather than fetching this route, since a
// server-rendered page fetching its own API is an extra network hop with no
// benefit. This route exists as the documented REST surface for external
// callers/testing, sharing the same query function so there's one
// definition of "list conversations," not two.
export async function GET() {
  const conversations = await getConversations();
  return NextResponse.json(conversations);
}
