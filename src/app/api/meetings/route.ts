import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { meetings, meetingAttendees, users } from "@/lib/db/schema";
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
      .where(inArray(meetings.workspaceId, workspaceIds))
      .orderBy(asc(meetings.eventTime));

    const meetingIds = rows.map((m) => m.id);
    const attendeeRows =
      meetingIds.length > 0
        ? await db
            .select({
              meetingId: meetingAttendees.meetingId,
              userId: meetingAttendees.userId,
              fullName: users.fullName,
              avatarUrl: users.avatarUrl,
              email: users.email,
            })
            .from(meetingAttendees)
            .leftJoin(users, eq(meetingAttendees.userId, users.id))
            .where(inArray(meetingAttendees.meetingId, meetingIds))
        : [];

    const attendeesByMeeting = new Map<string, typeof attendeeRows>();
    for (const a of attendeeRows) {
      const list = attendeesByMeeting.get(a.meetingId) ?? [];
      list.push(a);
      attendeesByMeeting.set(a.meetingId, list);
    }

    const data = rows.map((m) => ({
      ...m,
      attendees: attendeesByMeeting.get(m.id) ?? [],
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Failed to fetch meetings:", error);
    return NextResponse.json({ error: "Failed to fetch meetings" }, { status: 500 });
  }
}
