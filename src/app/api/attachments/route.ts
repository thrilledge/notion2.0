import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { attachments, hostingClients, docs, meetings, pages } from "@/lib/db/schema";
import { storeLocalFile } from "@/lib/storage";
import { isAllowedUpload, MAX_UPLOAD_BYTES } from "@/lib/security";
import {
  getAuthz,
  getAccessibleProjectIds,
  getAccessibleHostingClientIds,
  getAccessibleWorkspaceIds,
  canViewHostingClient,
  canEditProject,
  canEditWorkspaceContent,
} from "@/lib/authz";

const uploadSchema = z.object({
  projectId: z.string().uuid().optional(),
  hostingClientId: z.string().uuid().optional(),
  pageId: z.string().uuid().optional(),
  propertyName: z.string().max(255).optional(),
});

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

export async function GET(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = z
    .object({
      projectId: z.string().uuid().optional(),
      hostingClientId: z.string().uuid().optional(),
      pageId: z.string().uuid().optional(),
    })
    .safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const rows = await db
      .select()
      .from(attachments)
      .orderBy(attachments.position);

    const accessible = await (async () => {
      const projectIds = await getAccessibleProjectIds(authz);
      const projectSet = new Set(projectIds);
      const hostingIds = await getAccessibleHostingClientIds(authz);
      const hostingSet = new Set(hostingIds);
      const workspaceSet = new Set(await getAccessibleWorkspaceIds(authz));

      if (parsed.data.projectId) {
        if (!projectSet.has(parsed.data.projectId)) return [];
        return rows.filter((r) => r.projectId === parsed.data.projectId);
      }

      if (parsed.data.hostingClientId) {
        if (!hostingSet.has(parsed.data.hostingClientId)) return [];
        return rows.filter(
          (r) => r.hostingClientId === parsed.data.hostingClientId
        );
      }

      if (parsed.data.pageId) {
        const [page] = await db
          .select({ parentType: pages.parentType, parentId: pages.parentId })
          .from(pages)
          .where(eq(pages.id, parsed.data.pageId))
          .limit(1);
        let allowed = true;
        if (page) {
          if (page.parentType === "project") {
            allowed = !!page.parentId && projectSet.has(page.parentId);
          } else if (page.parentType === "hosting_client") {
            allowed = !!page.parentId && hostingSet.has(page.parentId);
          } else {
            allowed = workspaceSet.size > 0;
          }
        }
        if (!allowed) return [];
        return rows.filter((r) => r.pageId === parsed.data.pageId);
      }

      const pageIds = new Set(
        rows
          .map((r) => r.pageId)
          .filter((id): id is string => !!id)
      );
      const pageSet = new Set<string>();
      if (pageIds.size > 0) {
        const pageRows = await db
          .select({
            id: pages.id,
            parentType: pages.parentType,
            parentId: pages.parentId,
          })
          .from(pages)
          .where(inArray(pages.id, [...pageIds]));
        for (const p of pageRows) {
          if (p.parentType === "project") {
            if (p.parentId && projectSet.has(p.parentId)) pageSet.add(p.id);
          } else if (p.parentType === "hosting_client") {
            if (p.parentId && hostingSet.has(p.parentId)) pageSet.add(p.id);
          } else if (workspaceSet.size > 0) {
            pageSet.add(p.id);
          }
        }
      }

      const ownUploads = authz.isGlobalOwner
        ? () => true
        : (r: (typeof rows)[number]) => r.uploadedById === authz.userId;
      return rows.filter(
        (r) =>
          ownUploads(r) ||
          (r.projectId != null && projectSet.has(r.projectId)) ||
          (r.hostingClientId != null && hostingSet.has(r.hostingClientId)) ||
          (r.pageId != null && pageSet.has(r.pageId))
      );
    })();

    return NextResponse.json({ data: accessible });
  } catch (error) {
    console.error("Failed to list attachments:", error);
    return NextResponse.json(
      { error: "Failed to list attachments" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File exceeds the maximum allowed size" },
      { status: 413 }
    );
  }

  if (!isAllowedUpload(file.name)) {
    return NextResponse.json(
      { error: "File type is not allowed" },
      { status: 400 }
    );
  }

  const rawMeta = form.get("meta");
  let meta = {};
  if (typeof rawMeta === "string") {
    try {
      meta = JSON.parse(rawMeta);
    } catch {
      meta = {};
    }
  }

  const parsed = uploadSchema.safeParse(meta);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
  }

  // Verify the user may attach content to the target container.
  if (parsed.data.projectId) {
    if (!(await canEditProject(authz, parsed.data.projectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (parsed.data.hostingClientId || parsed.data.pageId) {
    const containerIds = [
      parsed.data.hostingClientId,
      parsed.data.pageId,
    ].filter((v): v is string => !!v);
    const ws = await resolveWorkspaceIds(containerIds);
    if (ws.length === 0 || !ws.every((w) => canEditWorkspaceContent(authz, w))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      parsed.data.hostingClientId &&
      !(await canViewHostingClient(authz, parsed.data.hostingClientId))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (parsed.data.pageId) {
      const [page] = await db
        .select({ parentType: pages.parentType, parentId: pages.parentId })
        .from(pages)
        .where(eq(pages.id, parsed.data.pageId))
        .limit(1);
      if (
        page?.parentType === "hosting_client" &&
        (!page.parentId ||
          !(await canViewHostingClient(authz, page.parentId)))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = storeLocalFile("attachments", authz.userId, file.name, buffer);

  try {
    const [row] = await db
      .insert(attachments)
      .values({
        storage: "local",
        storageKey: stored.key,
        publicUrl: stored.publicUrl,
        originalName: file.name,
        mimeType: file.type || null,
        size: stored.size,
        propertyName: parsed.data.propertyName ?? null,
        projectId: parsed.data.projectId ?? null,
        hostingClientId: parsed.data.hostingClientId ?? null,
        pageId: parsed.data.pageId ?? null,
        uploadedById: authz.userId,
      })
      .returning();

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    console.error("Failed to save attachment:", error);
    return NextResponse.json(
      { error: "Failed to save attachment" },
      { status: 500 }
    );
  }
}
