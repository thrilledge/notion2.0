import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { getAuthz, canManageWorkspace } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

const renameSchema = z.object({
  name: z.string().min(1).max(255),
});

export async function PATCH(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  if (!canManageWorkspace(authz, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const [existing] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(workspaces)
      .set({ name: parsed.data.name.trim() })
      .where(eq(workspaces.id, id))
      .returning({ id: workspaces.id, name: workspaces.name });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Failed to rename workspace:", error);
    return NextResponse.json(
      { error: "Failed to rename workspace" },
      { status: 500 }
    );
  }
}
