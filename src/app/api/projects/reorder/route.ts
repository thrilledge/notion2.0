import { NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getAuthz, canEditProject } from "@/lib/authz";

const reorderSchema = z.object({
  id: z.string().uuid(),
  afterId: z.string().uuid().nullable().optional(),
  beforeId: z.string().uuid().nullable().optional(),
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

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id, afterId, beforeId } = parsed.data;

  try {
    if (!(await canEditProject(authz, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let newSort: number;

    if (afterId && beforeId) {
      const pair = await db
        .select({ id: projects.id, sortOrder: projects.sortOrder })
        .from(projects)
        .where(or(eq(projects.id, afterId), eq(projects.id, beforeId)));
      const after = pair.find((p) => p.id === afterId)?.sortOrder ?? 0;
      const before = pair.find((p) => p.id === beforeId)?.sortOrder ?? 0;
      newSort = (after + before) / 2;
    } else if (afterId || beforeId) {
      const neighborId = afterId ?? beforeId!;
      const [nb] = await db
        .select({ sortOrder: projects.sortOrder })
        .from(projects)
        .where(eq(projects.id, neighborId))
        .limit(1);
      const base = nb?.sortOrder ?? 0;
      newSort = afterId ? base + 20 : base - 20;
    } else {
      const [last] = await db
        .select({ sortOrder: projects.sortOrder })
        .from(projects)
        .orderBy(desc(projects.sortOrder))
        .limit(1);
      newSort = (last?.sortOrder ?? 0) + 20;
    }

    await db
      .update(projects)
      .set({ sortOrder: newSort })
      .where(eq(projects.id, id));

    return NextResponse.json({ data: { id, sortOrder: newSort } });
  } catch (error) {
    console.error("Failed to reorder project:", error);
    return NextResponse.json(
      { error: "Failed to reorder project" },
      { status: 500 }
    );
  }
}
