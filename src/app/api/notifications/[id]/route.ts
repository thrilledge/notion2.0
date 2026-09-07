import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { getAuthz } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, authz.userId)));
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to mark notification read:", error);
    return NextResponse.json(
      { error: "Failed to mark notification read" },
      { status: 500 }
    );
  }
}
