import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, projectAssignees, users } from "@/lib/db/schema";
import { getAuthz, canManageWorkspace } from "@/lib/authz";

/**
 * Assignment management for a workspace. Only workspace managers may use this.
 *
 * GET ?workspaceId=   -> projects (with assigneeIds) + workspace users.
 * POST {workspaceId, userId, projectIds} -> set a user's project assignments
 *    (create/delete project_assignees rows) for the given workspace's projects.
 */
export async function GET(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  if (!canManageWorkspace(authz, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [projectRows, assigneePairs, userRows] = await Promise.all([
      db
        .select({
          id: projects.id,
          name: projects.name,
          type: projects.type,
          status: projects.status,
        })
        .from(projects)
        .where(eq(projects.workspaceId, workspaceId))
        .orderBy(projects.name),
      db
        .select({
          projectId: projectAssignees.projectId,
          userId: projectAssignees.userId,
        })
        .from(projectAssignees)
        .innerJoin(projects, eq(projectAssignees.projectId, projects.id))
        .where(eq(projects.workspaceId, workspaceId)),
      db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .orderBy(users.fullName),
    ]);

    const assigneeUserIds = new Set(assigneePairs.map((a) => a.userId));
    const byProject = new Map<string, string[]>();
    for (const a of assigneePairs) {
      const list = byProject.get(a.projectId) ?? [];
      list.push(a.userId);
      byProject.set(a.projectId, list);
    }

    return NextResponse.json({
      data: {
        projects: projectRows.map((p) => ({
          ...p,
          assigneeIds: byProject.get(p.id) ?? [],
        })),
        users: userRows.map((u) => ({ ...u, assigned: assigneeUserIds.has(u.id) })),
      },
    });
  } catch (error) {
    console.error("Failed to fetch assignments:", error);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

const setSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  projectIds: z.array(z.string().uuid()),
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

  const parsed = setSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { workspaceId, userId, projectIds } = parsed.data;

  if (!canManageWorkspace(authz, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Only allow assigning projects that belong to this workspace.
    const workspaceProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId));
    const allowedTargets = new Set(workspaceProjects.map((p) => p.id));

    // Verify every requested project id is in the workspace.
    for (const pid of projectIds) {
      if (!allowedTargets.has(pid)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Existing assignments of this user within the workspace.
    const existingRows = await db
      .select({ projectId: projectAssignees.projectId })
      .from(projectAssignees)
      .innerJoin(projects, eq(projectAssignees.projectId, projects.id))
      .where(
        and(
          eq(projectAssignees.userId, userId),
          eq(projects.workspaceId, workspaceId)
        )
      );
    const existing = new Set(existingRows.map((r) => r.projectId));
    const requested = new Set(projectIds);

    const toAdd = projectIds.filter((pid) => !existing.has(pid));
    const toRemove = Array.from(existing).filter((pid) => !requested.has(pid));

    if (toAdd.length > 0) {
      await db.insert(projectAssignees).values(
        toAdd.map((projectId) => ({ projectId, userId }))
      );
    }
    if (toRemove.length > 0) {
      await db.delete(projectAssignees).where(
        and(
          eq(projectAssignees.userId, userId),
          inArray(projectAssignees.projectId, toRemove)
        )
      );
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to set assignments:", error);
    return NextResponse.json({ error: "Failed to set assignments" }, { status: 500 });
  }
}
