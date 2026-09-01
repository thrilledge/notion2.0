import { NextResponse } from "next/server";
import { and, asc, desc, eq, ilike, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projectAssignees, projects } from "@/lib/db/schema";
import { getAuthz, getAccessibleProjectIds, canCreateProject } from "@/lib/authz";

const querySchema = z.object({
  type: z.enum(["client", "side_project"]).optional(),
  status: z.string().optional(),
  result: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z
    .enum(["sortOrder", "name", "updatedAt", "createdAt", "dueDate", "status"])
    .default("sortOrder"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
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

  const { type, status, result, assigneeId, search, limit, offset, sortBy, sortDir } =
    parsed.data;

  const ctx = await getAuthz();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accessibleIds = await getAccessibleProjectIds(ctx);
    if (accessibleIds.length === 0) {
      return NextResponse.json({
        data: [],
        meta: { total: 0, limit, offset },
      });
    }

    const conditions = [inArray(projects.id, accessibleIds)];

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
      const pairs = await db
        .select({
          projectId: projectAssignees.projectId,
          userId: projectAssignees.userId,
        })
        .from(projectAssignees)
        .where(inArray(projectAssignees.projectId, rows.map((r) => r.id)));

      const byProject = new Map<string, string[]>();
      for (const p of pairs) {
        const list = byProject.get(p.projectId) ?? [];
        list.push(p.userId);
        byProject.set(p.projectId, list);
      }

      data = rows.map((r) => ({
        ...r,
        assigneeIds: byProject.get(r.id) ?? [],
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
    const [project] = await db
      .insert(projects)
      .values({
        ...data,
        workspaceId: targetWorkspaceId,
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

    return NextResponse.json({ data: project }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
