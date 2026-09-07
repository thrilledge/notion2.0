import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, projectAssignees } from "@/lib/db/schema";
import { getAuthz, canCreateProject } from "@/lib/authz";

const itemSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["client", "side_project"]).default("client"),
  status: z
    .enum(["not_started", "in_progress", "done", "archived"])
    .default("not_started"),
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
    .optional()
    .nullable(),
  summary: z.string().max(5000).optional().nullable(),
  comments: z.string().max(10000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeEmail: z.string().email().optional().nullable(),
});

const importSchema = z.object({
  items: z.array(itemSchema).min(1).max(500),
});

export async function POST(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Determine target workspace (same logic as POST /api/projects).
  const memberships = Array.from(authz.memberships.entries()).sort((a, b) => {
    const w = { owner: 3, admin: 2, member: 1, viewer: 0 };
    return (w[b[1]] ?? 0) - (w[a[1]] ?? 0);
  });
  const targetWorkspaceId = memberships[0]?.[0] ?? null;

  if (!targetWorkspaceId) {
    return NextResponse.json(
      { error: "You are not a member of any workspace" },
      { status: 403 }
    );
  }

  if (!canCreateProject(authz, targetWorkspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { users } = await import("@/lib/db/schema");
  const { inArray } = await import("drizzle-orm");
  try {
    // Resolve assignee emails -> user ids.
    const emails = Array.from(
      new Set(
        parsed.data.items
          .map((i) => i.assigneeEmail?.toLowerCase())
          .filter((e): e is string => !!e)
      )
    );
    let userByEmail: Map<string, string> = new Map();
    if (emails.length > 0) {
      const rows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.email, emails));
      userByEmail = new Map(rows.map((r) => [r.email, r.id]));
    }

    const created = [];
    for (const item of parsed.data.items) {
      const assigneeId = item.assigneeEmail
        ? (userByEmail.get(item.assigneeEmail.toLowerCase()) ?? null)
        : null;
      const [project] = await db
        .insert(projects)
        .values({
          name: item.name,
          type: item.type,
          status: item.status,
          result: item.result ?? null,
          summary: item.summary ?? null,
          comments: item.comments ?? null,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          assigneeId,
          workspaceId: targetWorkspaceId,
          createdById: authz.userId,
        })
        .returning();
      if (assigneeId) {
        await db
          .insert(projectAssignees)
          .values({ projectId: project.id, userId: assigneeId });
      }
      created.push(project);
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("Failed to import projects:", error);
    return NextResponse.json(
      { error: "Failed to import projects" },
      { status: 500 }
    );
  }
}
