import { NextResponse } from "next/server";
import { asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
import { getAuthz, getAccessibleWorkspaceIds } from "@/lib/authz";

export async function GET() {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ids = await getAccessibleWorkspaceIds(authz);
    if (ids.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        createdById: workspaces.createdById,
        createdAt: workspaces.createdAt,
        memberCount: count(workspaceMembers.userId),
      })
      .from(workspaces)
      .leftJoin(
        workspaceMembers,
        eq(workspaceMembers.workspaceId, workspaces.id)
      )
      .where(inArray(workspaces.id, ids))
      .groupBy(workspaces.id)
      .orderBy(asc(workspaces.name));

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("Failed to fetch workspaces:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
});

export async function POST(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Any authenticated user may create a workspace; they become its owner.
  // (Global owner and workspace owners manage members/access via the API.)

  try {
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: parsed.data.name, createdById: authz.userId })
      .returning();

    // The creator becomes the owner of the new workspace.
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: authz.userId, role: "owner" });

    return NextResponse.json({ data: workspace }, { status: 201 });
  } catch (error) {
    console.error("Failed to create workspace:", error);
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}
