import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageBlocks, pages } from "@/lib/db/schema";
import { getAuthz, canViewProject } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    if (!(await canViewProject(authz, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const projectPages = await db
      .select({
        id: pages.id,
        title: pages.title,
        iconEmoji: pages.iconEmoji,
        iconUrl: pages.iconUrl,
        position: pages.position,
        notionPageId: pages.notionPageId,
      })
      .from(pages)
      .where(
        and(eq(pages.parentId, id), eq(pages.parentType, "project"))
      )
      .orderBy(asc(pages.position));

    const pageIds = projectPages.map((p) => p.id);

    const blocks =
      pageIds.length > 0
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
            .where(inArray(pageBlocks.pageId, pageIds))
            .orderBy(asc(pageBlocks.position))
        : [];

    return NextResponse.json({
      data: { pages: projectPages, blocks },
    });
  } catch (error) {
    console.error("Failed to fetch project content:", error);
    return NextResponse.json(
      { error: "Failed to fetch project content" },
      { status: 500 }
    );
  }
}
