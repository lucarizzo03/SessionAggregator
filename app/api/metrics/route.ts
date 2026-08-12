import { NextResponse } from "next/server";
import { getAllMetrics } from "@/lib/metrics";

// Same reasoning as app/api/conversations/route.ts: exists as a documented
// REST surface for testing/external callers, sharing the same computation
// functions the /aggregate page (Phase 2 Step 4) will call directly as a
// Server Component rather than fetching this route itself.
export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = await getAllMetrics();
  return NextResponse.json(metrics);
}
