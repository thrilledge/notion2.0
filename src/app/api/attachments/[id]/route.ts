import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments, hostingClients, docs, meetings } from "@/lib/db/schema";
import {
  getAuthz,
  canEditProject,
  canEditWorkspaceContent,
} from "@/lib/authz";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveWorkspaceIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const [hostingRows, docRows, meetingRows] = await Promise.all([
    db
      .select({ id: hostingClients.id, workspaceId: hostingClients.workspaceId })
      .from(hostingClients)
      .where(inArray(hostingClients.id, ids)),
    db
      .select({ id: docs.id, workspaceId: docs.workspaceId })
      .from(docs)
      .where(inArray(docs.id, ids)),
    db
      .select({ id: meetings.id, workspaceId: meetings.workspaceId })
      .from(meetings)
      .where(inArray(meetings.id, ids)),
  ]);
  return [
    ...hostingRows.map((r) => r.workspaceId),
    ...docRows.map((r) => r.workspaceId),
    ...meetingRows.map((r) => r.workspaceId),
  ].filter((w): w is string => !!w);
}

export async function DELETE(
  request: Request,
  ctx: RouteContext
) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let allowed = authz.isGlobalOwner;
    if (!allowed && attachment.projectId) {
      allowed = await canEditProject(authz, attachment.projectId);
    } else if (!allowed && (attachment.hostingClientId || attachment.pageId)) {
      const containerIds = [
        attachment.hostingClientId,
        attachment.pageId,
      ].filter((v): v is string => !!v);
      const ws = await resolveWorkspaceIds(containerIds);
      allowed =
        ws.length > 0 && ws.every((w) => canEditWorkspaceContent(authz, w));
    } else if (!allowed) {
      allowed = attachment.uploadedById === authz.userId;
    }

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(attachments).where(eq(attachments.id, id));
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to delete attachment:", error);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 }
    );
  }
}
