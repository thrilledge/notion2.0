import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaceMembers, type WorkspaceRole } from "@/lib/db/schema";
import { getAuthz, canManageWorkspace } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

const roleSchema = z.object({
  role: z.enum(["owner", "member"]),
});

export async function PATCH(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, userId } = await ctx.params;

  if (!canManageWorkspace(authz, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const [existing] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, userId)
        )
      )
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Prevent demoting/removing the last owner, or changing a global owner's
    // workspace role to something below admin.
    if (existing.role === "owner") {
      if (parsed.data.role !== "owner") {
        const ownerCount = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.role, "owner"))
          );
        if (ownerCount.length <= 1) {
          return NextResponse.json(
            { error: "Cannot demote the last workspace owner" },
            { status: 400 }
          );
        }
      }
    }

    await db
      .update(workspaceMembers)
      .set({ role: parsed.data.role as WorkspaceRole })
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, userId)
        )
      );

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to update workspace member:", error);
    return NextResponse.json(
      { error: "Failed to update workspace member" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, userId } = await ctx.params;

  if (!canManageWorkspace(authz, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A user cannot remove themselves (must be a deliberate admin/owner action),
  // and cannot remove the workspace's last owner.
  try {
    const [existing] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, userId)
        )
      )
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.role === "owner") {
      const ownerCount = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, id),
            eq(workspaceMembers.role, "owner")
          )
        );
      if (ownerCount.length <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last workspace owner" },
          { status: 400 }
        );
      }
    }

    await db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, userId)
        )
      );

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to remove workspace member:", error);
    return NextResponse.json(
      { error: "Failed to remove workspace member" },
      { status: 500 }
    );
  }
}
