import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  users,
  workspaces,
  workspaceMembers,
  type WorkspaceRole,
} from "@/lib/db/schema";
import { getAuthz, canManageWorkspace } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

const ONLINE_WINDOW_MS = 60_000;

export async function GET(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    if (!workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Any member may view the roster; only managers may modify it.
    const isMember = authz.isGlobalOwner || authz.memberships.has(id);
    if (!isMember) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const memberRows = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        lastSeenAt: workspaceMembers.lastSeenAt,
        createdAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, id));

    const userIds = memberRows.map((m) => m.userId);
    const userRows =
      userIds.length > 0
        ? await db
            .select({
              id: users.id,
              email: users.email,
              fullName: users.fullName,
              avatarUrl: users.avatarUrl,
              role: users.role,
              status: users.status,
            })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];
    const usersById = new Map(userRows.map((u) => [u.id, u]));

    const data = memberRows.map((m) => ({
      workspaceId: m.workspaceId,
      userId: m.userId,
      role: m.role,
      joinedAt: m.createdAt,
      lastSeenAt: m.lastSeenAt,
      isOnline:
        m.lastSeenAt != null &&
        Date.now() - new Date(m.lastSeenAt).getTime() < ONLINE_WINDOW_MS,
      ...usersById.get(m.userId),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Failed to fetch workspace members:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspace members" },
      { status: 500 }
    );
  }
}

const addSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "member"]).default("member"),
});

export async function POST(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  if (!canManageWorkspace(authz, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email.toLowerCase()))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { error: "No user found with that email" },
        { status: 404 }
      );
    }

    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: id,
        userId: targetUser.id,
        role: parsed.data.role as WorkspaceRole,
      })
      .onConflictDoNothing();

    return NextResponse.json({ data: { success: true } }, { status: 201 });
  } catch (error) {
    console.error("Failed to add workspace member:", error);
    return NextResponse.json(
      { error: "Failed to add workspace member" },
      { status: 500 }
    );
  }
}
