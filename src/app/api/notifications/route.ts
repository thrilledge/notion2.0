import { NextResponse } from "next/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { getAuthz } from "@/lib/authz";

export async function GET(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 30, 1), 200);

  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, authz.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const [unreadRow] = await db
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, authz.userId),
          isNull(notifications.readAt)
        )
      );

    return NextResponse.json({
      data: rows,
      meta: { unread: unreadRow?.n ?? 0 },
    });
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function POST() {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.userId, authz.userId));
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to mark notifications read:", error);
    return NextResponse.json(
      { error: "Failed to mark notifications read" },
      { status: 500 }
    );
  }
}
