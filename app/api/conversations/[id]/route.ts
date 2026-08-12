import { NextResponse } from "next/server";
import { getConversation } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // params is a Promise in this Next.js version (dynamic route params are
  // resolved asynchronously so the framework can start rendering before
  // routing is fully settled).
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(conversation);
}
