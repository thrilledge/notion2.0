import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { pageBlocks, pages, projects } from "@/lib/db/schema";
import { getAuthz, canEditProject } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

const spanSchema = z.object({
  text: z.string().max(5000),
  href: z.string().max(4000).nullable().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  underline: z.boolean().optional(),
  code: z.boolean().optional(),
});

const createSchema = z.object({
  text: z.string().max(20000).optional(),
  spans: z.array(spanSchema).optional(),
  type: z
    .enum(["paragraph", "heading_1", "heading_2", "heading_3", "to_do", "bulleted_list", "numbered_list", "quote"])
    .default("paragraph"),
  clientKey: z.string().max(64).optional(),
});

const batchCreateSchema = z.object({
  blocks: z.array(createSchema).min(1).max(200),
});

type CreateInput = {
  text?: string;
  spans?: z.infer<typeof spanSchema>[];
  type?: string;
  clientKey?: string;
};

function buildContent(type: string, text: string, spans: Record<string, unknown>[]): Record<string, unknown> {
  if (type === "heading_1" || type === "heading_2" || type === "heading_3") {
    return { text, spans, level: Number(type.slice(-1)) };
  }
  if (type === "to_do") {
    return { text, spans, checked: false };
  }
  return { text, spans };
}

const updateSchema = z.object({
  blockId: z.string().uuid(),
  text: z.string().max(20000).optional(),
  spans: z.array(spanSchema).optional(),
  checked: z.boolean().optional(),
  type: z
    .enum(["paragraph", "heading_1", "heading_2", "heading_3", "to_do", "bulleted_list", "numbered_list", "quote"])
    .optional(),
});

const deleteSchema = z.object({
  blockIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function DELETE(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if (!(await canEditProject(authz, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only delete blocks that live on a page belonging to THIS project.
    const blocks = await db
      .select({ id: pageBlocks.id })
      .from(pageBlocks)
      .innerJoin(pages, eq(pages.id, pageBlocks.pageId))
      .where(
        and(
          eq(pages.parentId, id),
          eq(pages.parentType, "project"),
          inArray(pageBlocks.id, parsed.data.blockIds)
        )
      );

    if (blocks.length > 0) {
      await db.delete(pageBlocks).where(
        inArray(
          pageBlocks.id,
          blocks.map((b) => b.id)
        )
      );
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to delete blocks:", error);
    return NextResponse.json(
      { error: "Failed to delete blocks" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Try the batch shape first (`{ blocks: [...] }`); fall back to a single
  // block shaped like the legacy API (`{ text, spans, type }`).
  // We must check for the `blocks` key explicitly because zod strips unknown
  // keys by default — `{ blocks: [...] }` would happily parse as a single
  // block with `blocks` simply ignored.
  const hasBatchKey =
    typeof body === "object" && body !== null && "blocks" in body;
  if (!hasBatchKey) {
    const single = createSchema.safeParse(body);
    if (single.success) {
      body = { blocks: [single.data] };
    }
  }
  const parsed = batchCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const inputs: CreateInput[] = parsed.data.blocks;

  try {
    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Only users who can edit this project may add content.
    if (!(await canEditProject(authz, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const inserted = await db.transaction(async (tx) => {
      // Find the first linked page for this project, or create one.
      const pageIds = await tx
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.parentId, id), eq(pages.parentType, "project")))
        .limit(1);

      let pageId: string;
      if (pageIds.length === 0) {
        const [newPage] = await tx
          .insert(pages)
          .values({
            title: project.name,
            parentType: "project",
            parentId: id,
            position: 0,
            createdById: authz.userId,
          })
          .returning({ id: pages.id });
        pageId = newPage.id;
      } else {
        pageId = pageIds[0].id;
      }

      // Compute the start position ONCE so a multi-block write can't race
      // on per-row max+1.
      const lastBlock = await tx
        .select({ position: pageBlocks.position })
        .from(pageBlocks)
        .where(eq(pageBlocks.pageId, pageId))
        .orderBy(desc(pageBlocks.position))
        .limit(1);
      const start = lastBlock.length > 0 ? lastBlock[0].position : -1;

      const rows: { id: string; pageId: string; blockId: string; type: string; content: Record<string, unknown>; parentBlockId: string | null; position: number; createdAt: Date; clientKey?: string }[] = [];
      for (let i = 0; i < inputs.length; i += 1) {
        const item = inputs[i];
        const type = (item.type || "paragraph") as string;
        const spans = (item.spans ?? (item.text ? [{ text: item.text }] : [])) as Record<string, unknown>[];
        const text = item.spans ? item.spans.map((s) => s.text).join("") : (item.text ?? "");
        const [row] = await tx
          .insert(pageBlocks)
          .values({
            pageId,
            blockId: randomUUID(),
            type,
            content: buildContent(type, text, spans),
            position: start + 1 + i,
          })
          .returning();
        rows.push({ ...row, clientKey: item.clientKey });
      }

      return rows;
    });

    return NextResponse.json({ data: inserted }, { status: 201 });
  } catch (error) {
    console.error("Failed to create blocks:", error);
    return NextResponse.json(
      { error: "Failed to create blocks" },
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Verify this project is accessible and editable by the current user.
    if (!(await canEditProject(authz, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The block must live on a page that belongs to THIS project.
    const block = await db
      .select({
        id: pageBlocks.id,
        pageId: pageBlocks.pageId,
        content: pageBlocks.content,
        type: pageBlocks.type,
      })
      .from(pageBlocks)
      .innerJoin(pages, eq(pages.id, pageBlocks.pageId))
      .where(
        and(
          eq(pageBlocks.id, parsed.data.blockId),
          eq(pages.parentId, id),
          eq(pages.parentType, "project")
        )
      )
      .limit(1);
    if (!block[0]) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    const currentContent = (block[0].content ?? {}) as Record<string, unknown>;
    const nextContent = { ...currentContent };
    if (parsed.data.spans !== undefined) {
      nextContent.spans = parsed.data.spans;
      nextContent.text = parsed.data.spans.map((s) => s.text).join("");
    } else if (parsed.data.text !== undefined) {
      nextContent.text = parsed.data.text;
      nextContent.spans = [{ text: parsed.data.text }];
    }
    if (parsed.data.checked !== undefined) {
      nextContent.checked = parsed.data.checked;
    }
    const nextType = parsed.data.type ?? block[0].type;
    if (nextType.startsWith("heading_")) {
      nextContent.level = Number(nextType.slice(-1));
    } else if (!nextType.startsWith("heading_")) {
      delete nextContent.level;
    }
    const updated = await db
      .update(pageBlocks)
      .set({ content: nextContent, ...(nextType !== block[0].type ? { type: nextType } : {}) })
      .where(eq(pageBlocks.id, block[0].id))
      .returning();

    return NextResponse.json({ data: updated[0] });
  } catch (error) {
    console.error("Failed to update block:", error);
    return NextResponse.json(
      { error: "Failed to update block" },
      { status: 500 }
    );
  }
}
