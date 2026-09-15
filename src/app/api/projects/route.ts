import { NextResponse } from "next/server";
import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projectAssignees, projects, pages, workspaces } from "@/lib/db/schema";
import { getAuthz, getAccessibleProjectIds, canCreateProject } from "@/lib/authz";
import { notifyProjectAssignees } from "@/lib/assignment-mail";

const querySchema = z.object({
  type: z.enum(["client", "side_project"]).optional(),
  status: z.string().optional(),
  result: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z
    .enum(["sortOrder", "name", "updatedAt", "createdAt", "dueDate", "status"])
    .default("sortOrder"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  trashed: z.coerce.boolean().default(false),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { type, status, result, assigneeId, folderId, workspaceId, search, limit, offset, sortBy, sortDir, trashed } =
    parsed.data;

  const ctx = await getAuthz();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accessibleIds = workspaceId
      ? await getAccessibleProjectIds(ctx, workspaceId)
      : await getAccessibleProjectIds(ctx);
    if (accessibleIds.length === 0) {
      return NextResponse.json({
        data: [],
        meta: { total: 0, limit, offset },
      });
    }

    const conditions = [inArray(projects.id, accessibleIds)];

    // Folder membership filter (custom folders only): restrict to projects
    // explicitly linked to this folder. The server already ensures the folder
    // itself is accessible before the UI ever calls this with a folderId.
    if (folderId) {
      conditions.push(sql`exists (
        select 1 from folder_projects fp
        where fp.folder_id = ${folderId} and fp.project_id = projects.id
      )`);
    }

    // Trash filter: by default exclude trashed projects; when requested, only
    // show trashed ones.
    conditions.push(trashed ? sql`${projects.deletedAt} is not null` : isNull(projects.deletedAt));

    if (type) conditions.push(eq(projects.type, type));
    if (status)
      conditions.push(
        eq(
          projects.status,
          status as "not_started" | "in_progress" | "done" | "archived"
        )
      );
    if (result)
      conditions.push(
        eq(
          projects.result,
          result as
            | "company_work"
            | "not_started"
            | "stuck"
            | "pending_review"
            | "in_progress"
            | "upcoming_renewal"
            | "done"
        )
      );
    if (assigneeId) conditions.push(eq(projects.assigneeId, assigneeId));
    if (search) conditions.push(ilike(projects.name, `%${search}%`));

    const where = and(...conditions);

    const sortColumn =
      sortBy === "name"
        ? projects.name
        : sortBy === "createdAt"
          ? projects.createdAt
          : sortBy === "dueDate"
            ? projects.dueDate
            : sortBy === "status"
              ? projects.status
              : sortBy === "sortOrder" || sortBy === "updatedAt"
                ? projects.sortOrder
                : projects.updatedAt;
    const sortDirFn = sortDir === "asc" ? asc : desc;

    const [rows, total] = await Promise.all([
      db
        .select()
        .from(projects)
        .where(where)
        .orderBy(sortDirFn(sortColumn))
        .limit(limit)
        .offset(offset),
      db.$count(projects, where),
    ]);

    let data = rows;
    if (rows.length > 0) {
      const wsIds = [
        ...new Set(rows.map((r) => r.workspaceId).filter((id): id is string => !!id)),
      ];

      const [pairsResult, wsRows] = await Promise.all([
        db
          .select({
            projectId: projectAssignees.projectId,
            userId: projectAssignees.userId,
          })
          .from(projectAssignees)
          .where(inArray(projectAssignees.projectId, rows.map((r) => r.id))),
        wsIds.length
          ? db
              .select({ id: workspaces.id, name: workspaces.name })
              .from(workspaces)
              .where(inArray(workspaces.id, wsIds))
          : Promise.resolve([] as { id: string; name: string }[]),
      ]);

      const byProject = new Map<string, string[]>();
      for (const p of pairsResult) {
        const list = byProject.get(p.projectId) ?? [];
        list.push(p.userId);
        byProject.set(p.projectId, list);
      }

      const nameById = new Map(wsRows.map((w) => [w.id, w.name]));

      data = rows.map((r) => ({
        ...r,
        assigneeIds: byProject.get(r.id) ?? [],
        workspaceName: r.workspaceId ? (nameById.get(r.workspaceId) ?? null) : null,
      }));
    }

    return NextResponse.json({
      data,
      meta: { total, limit, offset },
    });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  workspaceId: z.string().uuid().optional(),
  type: z.enum(["client", "side_project"]).default("client"),
  status: z.enum(["not_started", "in_progress", "done", "archived"]).default("not_started"),
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
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().uuid().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
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

  const { dueDate, assigneeIds, workspaceId, ...data } = parsed.data;

  // Determine target workspace: explicit workspaceId, else owner/member's
  // primary workspace. Members may only create where they have create rights.
  let targetWorkspaceId = workspaceId;
  if (!targetWorkspaceId) {
    const memberships = Array.from(authz.memberships.entries()).sort((a, b) => {
      const w = { owner: 3, admin: 2, member: 1, viewer: 0 };
      return (w[b[1]] ?? 0) - (w[a[1]] ?? 0);
    });
    targetWorkspaceId = memberships[0]?.[0] ?? null;
  }

  if (!targetWorkspaceId) {
    return NextResponse.json(
      { error: "You are not a member of any workspace" },
      { status: 403 }
    );
  }

  if (!canCreateProject(authz, targetWorkspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Place new projects at the top of the list: give them a sortOrder above
    // the current maximum so the DESC sort shows them first.
    const [maxRow] = await db
      .select({ maxSort: sql<number>`coalesce(max(${projects.sortOrder}), 0)` })
      .from(projects)
      .where(eq(projects.workspaceId, targetWorkspaceId));
    const nextSort = (maxRow?.maxSort ?? 0) + 20;

    const [project] = await db
      .insert(projects)
      .values({
        ...data,
        workspaceId: targetWorkspaceId,
        sortOrder: nextSort,
        ...(data.assigneeId === undefined && assigneeIds && assigneeIds.length > 0
          ? { assigneeId: assigneeIds[0] }
          : {}),
        dueDate: dueDate ? new Date(dueDate) : null,
        createdById: authz.userId,
      })
      .returning();

    if (assigneeIds && assigneeIds.length > 0) {
      await db.insert(projectAssignees).values(
        assigneeIds.map((userId) => ({ projectId: project.id, userId }))
      );
    }

    // Every project starts with one empty page so the content editor is
    // immediately ready to write in — without a page the project detail
    // renders no editor at all.
    await db.insert(pages).values({
      title: project.name,
      parentType: "project",
      parentId: project.id,
      position: 0,
      createdById: authz.userId,
    });

    // Notify newly-assigned users by email (no-op when SMTP unconfigured).
    const newAssigneeIds = assigneeIds ?? (data.assigneeId ? [data.assigneeId] : []);
    if (newAssigneeIds.length > 0) {
      const [workspaceRow] = await db
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, targetWorkspaceId));
      await notifyProjectAssignees(newAssigneeIds, {
        projectId: project.id,
        projectName: project.name,
        workspaceName: workspaceRow?.name ?? "Workspace",
      });
    }

    return NextResponse.json({ data: project }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
