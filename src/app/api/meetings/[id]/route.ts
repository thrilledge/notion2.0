import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { meetings, meetingAttendees, users, pageBlocks } from "@/lib/db/schema";
import { getAuthz, canViewWorkspaceContent } from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [meeting] = await db
      .select({
        id: meetings.id,
        name: meetings.name,
        type: meetings.type,
        eventTime: meetings.eventTime,
        pageId: meetings.pageId,
        workspaceId: meetings.workspaceId,
        createdAt: meetings.createdAt,
        updatedAt: meetings.updatedAt,
      })
      .from(meetings)
      .where(eq(meetings.id, id))
      .limit(1);

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (!meeting.workspaceId || !canViewWorkspaceContent(authz, meeting.workspaceId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const attendees = await db
      .select({
        userId: meetingAttendees.userId,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        email: users.email,
      })
      .from(meetingAttendees)
      .leftJoin(users, eq(meetingAttendees.userId, users.id))
      .where(eq(meetingAttendees.meetingId, id));

    const blocks = meeting.pageId
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
          .where(eq(pageBlocks.pageId, meeting.pageId))
          .orderBy(asc(pageBlocks.position))
      : [];

    return NextResponse.json({ data: { meeting, attendees, blocks } });
  } catch (error) {
    console.error("Failed to fetch meeting:", error);
    return NextResponse.json({ error: "Failed to fetch meeting" }, { status: 500 });
  }
}
