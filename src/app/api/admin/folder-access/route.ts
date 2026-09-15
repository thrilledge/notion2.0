import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  folders,
  folderAccess,
  users,
  workspaceMembers,
} from "@/lib/db/schema";
import { getAuthz, canManageWorkspace } from "@/lib/authz";

/**
 * Folder access management for a workspace. Only workspace managers may use
 * this. Grants decide which folders (and therefore which projects / hosting
 * clients inside them) a non-owner member can see. Workspace owners and the
 * global owner always see everything regardless of these rows.
 *
 * GET ?workspaceId=  -> folders (with code/kind) + workspace users with their
 *                       granted folder ids.
 * POST {workspaceId, userId, folderIds} -> replace the user's folder grants.
 */
export async function GET(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 }
    );
  }

  if (!canManageWorkspace(authz, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [folderRows, userRows, grantPairs] = await Promise.all([
      db
        .select()
        .from(folders)
        .where(eq(folders.workspaceId, workspaceId))
        .orderBy(folders.sortOrder, folders.name),
      db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .orderBy(users.fullName),
      db
        .select({ folderId: folderAccess.folderId, userId: folderAccess.userId })
        .from(folderAccess)
        .innerJoin(folders, eq(folderAccess.folderId, folders.id))
        .where(eq(folders.workspaceId, workspaceId)),
    ]);

    const byUser = new Map<string, string[]>();
    for (const g of grantPairs) {
      const list = byUser.get(g.userId) ?? [];
      list.push(g.folderId);
      byUser.set(g.userId, list);
    }

    return NextResponse.json({
      data: {
        folders: folderRows.map((f) => ({
          id: f.id,
          name: f.name,
          kind: f.kind,
          code: f.code,
        })),
        users: userRows.map((u) => ({
          ...u,
          grantedFolderIds: byUser.get(u.id) ?? [],
        })),
      },
    });
  } catch (error) {
    console.error("Failed to fetch folder access:", error);
    return NextResponse.json(
      { error: "Failed to fetch folder access" },
      { status: 500 }
    );
  }
}

const setSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  folderIds: z.array(z.string().uuid()),
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

  const parsed = setSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { workspaceId, userId, folderIds } = parsed.data;

  if (!canManageWorkspace(authz, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Target must be a workspace member.
    const [targetMember] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId)
        )
      )
      .limit(1);
    if (!targetMember) {
      return NextResponse.json(
        { error: "User is not a member of this workspace" },
        { status: 400 }
      );
    }

    // Requested folders must belong to this workspace.
    const allowedIds = new Set(await allFolderIdsFor(workspaceId));
    for (const fid of folderIds) {
      if (!allowedIds.has(fid)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const existing = await db
      .select({ folderId: folderAccess.folderId })
      .from(folderAccess)
      .innerJoin(folders, eq(folderAccess.folderId, folders.id))
      .where(
        and(
          eq(folderAccess.userId, userId),
          eq(folders.workspaceId, workspaceId)
        )
      );
    const existingSet = new Set(existing.map((r) => r.folderId));
    const requestedSet = new Set(folderIds);

    const toAdd = folderIds.filter((fid) => !existingSet.has(fid));
    const toRemove = Array.from(existingSet).filter((fid) => !requestedSet.has(fid));

    if (toAdd.length > 0) {
      await db
        .insert(folderAccess)
        .values(toAdd.map((folderId) => ({ folderId, userId })))
        .onConflictDoNothing();
    }
    if (toRemove.length > 0) {
      await db.delete(folderAccess).where(
        and(
          eq(folderAccess.userId, userId),
          inArray(folderAccess.folderId, toRemove)
        )
      );
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to set folder access:", error);
    return NextResponse.json(
      { error: "Failed to set folder access" },
      { status: 500 }
    );
  }
}

async function allFolderIdsFor(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId));
  return rows.map((r) => r.id);
}