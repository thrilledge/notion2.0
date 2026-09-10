import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projectAssignees, projects, notifications, workspaces } from "@/lib/db/schema";
import { getAuthz, canViewProject, canEditProject, roleInWorkspace } from "@/lib/authz";
import { notifyProjectAssignees } from "@/lib/assignment-mail";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["client", "side_project"]).optional(),
  status: z.enum(["not_started", "in_progress", "done", "archived"]).optional(),
  result: z
    .enum([
      "company_work",
      "not_started",
      "stuck",
      "pending_review",
      "in_progress",
      "upcoming_renewal",
      "done",
    ])
    .optional(),
  summary: z.string().max(5000).optional(),
  comments: z.string().max(10000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  try {
    if (!(await canViewProject(authz, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const assigneeRows = await db
      .select({ userId: projectAssignees.userId })
      .from(projectAssignees)
      .where(eq(projectAssignees.projectId, id));
    const assigneeIds = assigneeRows.map((r) => r.userId);

    return NextResponse.json({ data: { ...project, assigneeIds } });
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  if (!(await canViewProject(authz, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Viewers cannot edit at all.
  if (!(await canEditProject(authz, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { dueDate, assigneeIds, ...data } = parsed.data;

  // Only workspace admins/owners may mutate the assignee list.
  const [project] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  const wsRole = project?.workspaceId ? roleInWorkspace(authz, project.workspaceId) : null;
  const isManager =
    authz.isGlobalOwner || wsRole === "owner";

  if (
    (data.assigneeId !== undefined || assigneeIds !== undefined) &&
    !isManager
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Capture prior assignees so we can notify newly-assigned users and
    // comment watchers below.
    let previousAssigneeIds: string[] = [];
    if (assigneeIds !== undefined) {
      const prevRows = await db
        .select({ userId: projectAssignees.userId })
        .from(projectAssignees)
        .where(eq(projectAssignees.projectId, id));
      previousAssigneeIds = prevRows.map((r) => r.userId);
    }

    const values = {
      ...data,
      ...(dueDate !== undefined && {
        dueDate: dueDate ? new Date(dueDate) : null,
      }),
      ...(assigneeIds !== undefined && {
        // Keep the single-assignee column in sync: clear it when the list is empty.
        assigneeId: assigneeIds.length > 0 ? assigneeIds[0] : null,
      }),
    };

    // Drop undefined keys so an update with no concrete fields doesn't throw
    // "No values to set".
    const setValues = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined)
    );

    let updated: typeof project & { name: string };
    if (Object.keys(setValues).length === 0) {
      const [current] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);
      updated = (current ?? project) as typeof updated;
    } else {
      [updated] = await db
        .update(projects)
        .set(setValues)
        .where(eq(projects.id, id))
        .returning();
    }

    if (assigneeIds !== undefined) {
      await db
        .delete(projectAssignees)
        .where(eq(projectAssignees.projectId, id));
      if (assigneeIds.length > 0) {
        await db.insert(projectAssignees).values(
          assigneeIds.map((userId) => ({ projectId: id, userId }))
        );
      }
    }

    // ---- Notifications ----
    const assignmentsThatChanged =
      assigneeIds !== undefined &&
      JSON.stringify([...assigneeIds].sort()) !==
        JSON.stringify([...previousAssigneeIds].sort());

    // Notify newly-assigned users.
    if (assignmentsThatChanged) {
      const newlyAssigned = assigneeIds!.filter(
        (u) => !previousAssigneeIds.includes(u) && u !== authz.userId
      );
      if (newlyAssigned.length > 0) {
        await db.insert(notifications).values(
          newlyAssigned.map((uid) => ({
            userId: uid,
            type: "assignment" as const,
            title: "New assignment",
            body: `You were assigned to ${updated.name}`,
            link: `/projects/${id}`,
            projectId: id,
          }))
        );
      }

      // Emails go to newly-assigned users (no-op when SMTP unconfigured).
      if (newlyAssigned.length > 0 && project?.workspaceId) {
        const [workspaceRow] = await db
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, project.workspaceId));
        await notifyProjectAssignees(newlyAssigned, {
          projectId: id,
          projectName: updated.name,
          workspaceName: workspaceRow?.name ?? "Workspace",
        });
      }
    }

    // Notify current assignees (except the actor) when comments changed.
    if (
      data.comments !== undefined &&
      data.comments !== null &&
      data.comments.trim().length > 0
    ) {
      let watcherIds = assigneeIds ?? previousAssigneeIds;
      watcherIds = watcherIds.filter((u) => u !== authz.userId);
      if (watcherIds.length > 0) {
        await db.insert(notifications).values(
          watcherIds.map((uid) => ({
            userId: uid,
            type: "comment" as const,
            title: "New comment",
            body: `${updated.name}`,
            link: `/projects/${id}`,
            projectId: id,
          }))
        );
      }
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  try {
    if (!(await canViewProject(authz, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [project] = await db
      .select({ workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Any member who can create/edit projects in this workspace may also
    // delete them (matches the create permission set).
    if (!(await canEditProject(authz, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
