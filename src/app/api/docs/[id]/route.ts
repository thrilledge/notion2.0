import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { docs, pageBlocks } from "@/lib/db/schema";
import { getAuthz, canViewWorkspaceContent } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [doc] = await db
      .select({
        id: docs.id,
        title: docs.title,
        tags: docs.tags,
        pageId: docs.pageId,
        workspaceId: docs.workspaceId,
        createdAt: docs.createdAt,
        updatedAt: docs.updatedAt,
      })
      .from(docs)
      .where(eq(docs.id, id))
      .limit(1);

    if (!doc) {
      return NextResponse.json({ error: "Doc not found" }, { status: 404 });
    }

    if (!doc.workspaceId || !canViewWorkspaceContent(authz, doc.workspaceId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const blocks = doc.pageId
      ? await db
          .select({
            id: pageBlocks.id,
            pageId: pageBlocks.pageId,
            type: pageBlocks.type,
            content: pageBlocks.content,
            parentBlockId: pageBlocks.parentBlockId,
            position: pageBlocks.position,
          })
          .from(pageBlocks)
          .where(eq(pageBlocks.pageId, doc.pageId))
          .orderBy(asc(pageBlocks.position))
      : [];

    return NextResponse.json({ data: { doc, blocks } });
  } catch (error) {
    console.error("Failed to fetch doc:", error);
    return NextResponse.json({ error: "Failed to fetch doc" }, { status: 500 });
  }
}
