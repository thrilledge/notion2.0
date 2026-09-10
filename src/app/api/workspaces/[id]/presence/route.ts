import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceMembers } from "@/lib/db/schema";
import { getAuthz } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

// Heartbeat: mark the current user as online in the given workspace.
export async function POST(_request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const isMember = authz.isGlobalOwner || authz.memberships.has(id);
  if (!isMember) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: id,
        userId: authz.userId,
        role: "member" as const,
      })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { lastSeenAt: sql`now()` },
      });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("Failed to record presence:", error);
    return NextResponse.json(
      { error: "Failed to record presence" },
      { status: 500 }
    );
  }
}