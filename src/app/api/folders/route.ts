import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  folders,
  folderProjects,
  folderHostingClients,
  projects,
  hostingClients,
} from "@/lib/db/schema";
import { getAuthz, canManageWorkspace } from "@/lib/authz";

/**
 * Folder management. Only workspace managers (owner role / global owner) may
 * create/edit/delete folders and their contents. Access to a folder (who sees
 * it) is a separate concern handled by /api/admin/folder-access.
 */

const querySchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function GET(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const { workspaceId } = parsed.data;
  if (!canManageWorkspace(authz, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [folderRows, projectPairs, hostingPairs] = await Promise.all([
      db
        .select()
        .from(folders)
        .where(eq(folders.workspaceId, workspaceId))
        .orderBy(folders.sortOrder, folders.name),
      db
        .select({ folderId: folderProjects.folderId, projectId: folderProjects.projectId })
        .from(folderProjects)
        .innerJoin(folders, eq(folderProjects.folderId, folders.id))
        .where(eq(folders.workspaceId, workspaceId)),
      db
        .select({ folderId: folderHostingClients.folderId, hostingClientId: folderHostingClients.hostingClientId })
        .from(folderHostingClients)
        .innerJoin(folders, eq(folderHostingClients.folderId, folders.id))
        .where(eq(folders.workspaceId, workspaceId)),
    ]);

    const projectIdsByFolder = new Map<string, string[]>();
    for (const p of projectPairs) {
      const list = projectIdsByFolder.get(p.folderId) ?? [];
      list.push(p.projectId);
      projectIdsByFolder.set(p.folderId, list);
    }
    const hostingIdsByFolder = new Map<string, string[]>();
    for (const p of hostingPairs) {
      const list = hostingIdsByFolder.get(p.folderId) ?? [];
      list.push(p.hostingClientId);
      hostingIdsByFolder.set(p.folderId, list);
    }

    return NextResponse.json({
      data: folderRows.map((f) => ({
        ...f,
        projectIds: projectIdsByFolder.get(f.id) ?? [],
        hostingClientIds: hostingIdsByFolder.get(f.id) ?? [],
      })),
    });
  } catch (error) {
    console.error("Failed to fetch folders:", error);
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  kind: z.enum(["project", "hosting_client"]).default("project"),
  projectIds: z.array(z.string().uuid()).default([]),
  hostingClientIds: z.array(z.string().uuid()).default([]),
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { workspaceId, name, kind, projectIds, hostingClientIds } = parsed.data;

  if (!canManageWorkspace(authz, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Verify any provided project/hosting ids belong to this workspace.
    if (projectIds.length > 0) {
      const wsProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), inArray(projects.id, projectIds)));
      if (wsProjects.length !== projectIds.length) {
        return NextResponse.json(
          { error: "One or more projects do not belong to this workspace" },
          { status: 400 }
        );
      }
    }
    if (hostingClientIds.length > 0) {
      const wsClients = await db
        .select({ id: hostingClients.id })
        .from(hostingClients)
        .where(
          and(
            eq(hostingClients.workspaceId, workspaceId),
            inArray(hostingClients.id, hostingClientIds)
          )
        );
      if (wsClients.length !== hostingClientIds.length) {
        return NextResponse.json(
          { error: "One or more hosting clients do not belong to this workspace" },
          { status: 400 }
        );
      }
    }

    // Place after the current max sortOrder.
    const [maxRow] = await db
      .select({ maxSort: sql<number>`coalesce(max(${folders.sortOrder}), 0)` })
      .from(folders)
      .where(eq(folders.workspaceId, workspaceId));
    const nextSort = (maxRow?.maxSort ?? 0) + 10;

    const [folder] = await db
      .insert(folders)
      .values({
        workspaceId,
        name: name.trim(),
        kind,
        code: null,
        sortOrder: nextSort,
        createdById: authz.userId,
      })
      .returning();

    if (projectIds.length > 0) {
      await db
        .insert(folderProjects)
        .values(projectIds.map((projectId) => ({ folderId: folder.id, projectId })));
    }
    if (hostingClientIds.length > 0) {
      await db
        .insert(folderHostingClients)
        .values(
          hostingClientIds.map((hostingClientId) => ({
            folderId: folder.id,
            hostingClientId,
          }))
        );
    }

    return NextResponse.json({ data: folder }, { status: 201 });
  } catch (error) {
    console.error("Failed to create folder:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}

const patchSchema = z.object({
  folderId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  projectIds: z.array(z.string().uuid()).optional(),
  hostingClientIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(request: Request) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { folderId, name, projectIds, hostingClientIds } = parsed.data;

  try {
    const response = await db.transaction(async (tx) => {
      const [folder] = await tx
        .select()
        .from(folders)
        .where(eq(folders.id, folderId))
        .limit(1);
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
      if (!canManageWorkspace(authz, folder.workspaceId ?? "")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // System folders are immutable.
      if (folder.code) {
        return NextResponse.json(
          { error: "System folders cannot be edited" },
          { status: 400 }
        );
      }

      if (name) {
        await tx
          .update(folders)
          .set({ name: name.trim() })
          .where(eq(folders.id, folderId));
      }

      if (projectIds !== undefined && folder.kind === "project") {
        const wsProjects = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.workspaceId, folder.workspaceId ?? ""),
              inArray(projects.id, projectIds.length ? projectIds : [""])
            )
          );
        if (wsProjects.length !== projectIds.length) {
          return NextResponse.json(
            { error: "One or more projects do not belong to this workspace" },
            { status: 400 }
          );
        }
        await tx
          .delete(folderProjects)
          .where(eq(folderProjects.folderId, folderId));
        if (projectIds.length > 0) {
          await tx
            .insert(folderProjects)
            .values(projectIds.map((projectId) => ({ folderId, projectId })));
        }
      }

      if (hostingClientIds !== undefined && folder.kind === "hosting_client") {
        const wsClients = await tx
          .select({ id: hostingClients.id })
          .from(hostingClients)
          .where(
            and(
              eq(hostingClients.workspaceId, folder.workspaceId ?? ""),
              inArray(hostingClients.id, hostingClientIds.length ? hostingClientIds : [""])
            )
          );
        if (wsClients.length !== hostingClientIds.length) {
          return NextResponse.json(
            { error: "One or more hosting clients do not belong to this workspace" },
            { status: 400 }
          );
        }
        await tx
          .delete(folderHostingClients)
          .where(eq(folderHostingClients.folderId, folderId));
        if (hostingClientIds.length > 0) {
          await tx
            .insert(folderHostingClients)
            .values(
              hostingClientIds.map((hostingClientId) => ({ folderId, hostingClientId }))
            );
        }
      }

      return NextResponse.json({ data: { success: true } });
    });
    return response;
  } catch (error) {
    console.error("Failed to update folder:", error);
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }
}

const deleteSchema = z.object({
  folderId: z.string().uuid(),
});

export async function DELETE(request: Request) {
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

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { folderId } = parsed.data;

  try {
    const [folder] = await db
      .select()
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1);
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    if (!canManageWorkspace(authz, folder.workspaceId ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (folder.code) {
      return NextResponse.json(
        { error: "System folders cannot be deleted" },
        { status: 400 }
      );
    }

    // Cascades remove folder_projects / folder_hosting_clients / folder_access.
    await db.delete(folders).where(eq(folders.id, folderId));

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to delete folder:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}