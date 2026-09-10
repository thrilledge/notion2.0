import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, projectAssignees, pages, pageBlocks, notifications } from "@/lib/db/schema";
import {
  getAuthz,
  canViewProject,
  canEditProject,
} from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

const actionSchema = z.object({
  action: z.enum(["trash", "restore", "duplicate"]),
  // For duplicate-as: optional new name
  name: z.string().min(1).max(255).optional(),
});

export async function POST(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  if (!(await canViewProject(authz, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { action } = parsed.data;

  const [project] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Trash & restore are allowed for any member who can edit the project —
  // anyone who can create a project in the workspace can also delete one.
  if (!(await canEditProject(authz, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (action === "trash") {
      const [updated] = await db
        .update(projects)
        .set({ deletedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ data: updated });
    }

    if (action === "restore") {
      const [updated] = await db
        .update(projects)
        .set({ deletedAt: null })
        .where(eq(projects.id, id))
        .returning();
      return NextResponse.json({ data: updated });
    }

    // duplicate (optionally "duplicate as" a new name)
    const source = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!source[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const src = source[0];

    const newName = parsed.data.name?.trim() ?? `${src.name} (copy)`;

    const [copy] = await db
      .insert(projects)
      .values({
        workspaceId: src.workspaceId,
        name: newName,
        type: src.type,
        status: src.status,
        result: src.result,
        summary: src.summary,
        comments: src.comments,
        dueDate: src.dueDate,
        assigneeId: src.assigneeId,
        createdById: authz.userId,
        sortOrder: src.sortOrder + 0.001,
      })
      .returning();

    // Copy assignees
    const assignees = await db
      .select({ userId: projectAssignees.userId })
      .from(projectAssignees)
      .where(eq(projectAssignees.projectId, id));
    if (assignees.length > 0) {
      await db.insert(projectAssignees).values(
        assignees.map((a) => ({ projectId: copy.id, userId: a.userId }))
      );
    }

    // Copy page + blocks
    const pagesOfProject = await db
      .select()
      .from(pages)
      .where(eq(pages.parentId, id));
    for (const page of pagesOfProject) {
      const parentType = page.parentType;
      const isProjectPage = parentType === "project";
      const isHosting = parentType === "hosting_client";
      const isDoc = parentType === "doc";
      const parentIdCol =
        isHosting || isDoc ? page.parentId : isProjectPage ? copy.id : null;
      const [newPage] = await db
        .insert(pages)
        .values({
          title: page.title,
          parentType: isProjectPage ? "project" : parentType,
          parentId: parentIdCol,
          iconEmoji: page.iconEmoji,
          iconUrl: page.iconUrl,
          coverUrl: page.coverUrl,
          content: page.content,
          position: page.position,
          createdById: authz.userId,
        })
        .returning();

      const blocks = await db
        .select()
        .from(pageBlocks)
        .where(eq(pageBlocks.pageId, page.id))
        .orderBy(pageBlocks.position);
      if (blocks.length > 0) {
        await db.insert(pageBlocks).values(
          blocks.map((b) => ({
            pageId: newPage.id,
            blockId: b.blockId,
            type: b.type,
            content: b.content,
            parentBlockId: b.parentBlockId,
            position: b.position,
          }))
        );
      }
    }

    // Notify assignees that a duplicate was created (system notification)
    if (assignees.length > 0) {
      await db.insert(notifications).values(
        assignees.map((a) => ({
          userId: a.userId,
          type: "system" as const,
          title: `${newName} created`,
          body: `${src.name} was duplicated by a team member`,
          link: `/projects/${copy.id}`,
          projectId: copy.id,
        }))
      );
    }

    return NextResponse.json({ data: copy }, { status: 201 });
  } catch (error) {
    console.error("Failed to run project action:", error);
    return NextResponse.json(
      { error: "Failed to run project action" },
      { status: 500 }
    );
  }
}
