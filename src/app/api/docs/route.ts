import { NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { docs } from "@/lib/db/schema";
import { getAuthz, getAccessibleWorkspaceIds } from "@/lib/authz";

export async function GET() {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaceIds = await getAccessibleWorkspaceIds(authz);
    if (workspaceIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const rows = await db
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
      .where(inArray(docs.workspaceId, workspaceIds))
      .orderBy(asc(docs.title));

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("Failed to fetch docs:", error);
    return NextResponse.json({ error: "Failed to fetch docs" }, { status: 500 });
  }
}
