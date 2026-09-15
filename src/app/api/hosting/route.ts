import { NextResponse } from "next/server";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { hostingClients } from "@/lib/db/schema";
import { getAuthz, getAccessibleWorkspaceIds, canEditWorkspaceContent, getAccessibleHostingClientIds } from "@/lib/authz";

const querySchema = z.object({
  status: z.string().optional(),
  result: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z
    .enum(["domain", "updatedAt", "createdAt", "dueDate", "status"])
    .default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
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
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 }
    );
  }

  const { status, result, assigneeId, folderId, workspaceId, search, limit, offset, sortBy, sortDir } =
    parsed.data;

  try {
    const workspaceIds = await getAccessibleWorkspaceIds(authz);
    if (workspaceIds.length === 0) {
      return NextResponse.json({
        data: [],
        meta: { total: 0, limit, offset },
      });
    }

    const accessibleIds = workspaceId
      ? await getAccessibleHostingClientIds(authz, workspaceId)
      : await getAccessibleHostingClientIds(authz);
    if (accessibleIds.length === 0) {
      return NextResponse.json({
        data: [],
        meta: { total: 0, limit, offset },
      });
    }

    const conditions = [
      inArray(hostingClients.id, accessibleIds),
      inArray(hostingClients.workspaceId, workspaceIds),
    ];

    if (workspaceId) conditions.push(eq(hostingClients.workspaceId, workspaceId));

    if (status)
      conditions.push(
        eq(
          hostingClients.status,
          status as "not_started" | "in_progress" | "done" | "archived"
        )
      );
    if (result)
      conditions.push(
        eq(
          hostingClients.result,
          result as
            | "company_work"
            | "not_started"
            | "stuck"
            | "pending_review"
            | "in_progress"
            | "upcoming_renewal"
            | "done"
        )
      );
    if (assigneeId)
      conditions.push(eq(hostingClients.assigneeId, assigneeId));
    if (folderId)
      conditions.push(sql`exists (
        select 1 from folder_hosting_clients fhc
        where fhc.folder_id = ${folderId} and fhc.hosting_client_id = hosting_clients.id
      )`);
    if (search) conditions.push(ilike(hostingClients.domain, `%${search}%`));

    const where = and(...conditions);

    const sortColumn =
      sortBy === "domain"
        ? hostingClients.domain
        : sortBy === "createdAt"
          ? hostingClients.createdAt
          : sortBy === "dueDate"
            ? hostingClients.dueDate
            : hostingClients.updatedAt;
    const sortDirFn = sortDir === "asc" ? asc : desc;

    const [rows, total] = await Promise.all([
      db
        .select()
        .from(hostingClients)
        .where(where)
        .orderBy(sortDirFn(sortColumn))
        .limit(limit)
        .offset(offset),
      db.$count(hostingClients, where),
    ]);

    return NextResponse.json({
      data: rows,
      meta: { total, limit, offset },
    });
  } catch (error) {
    console.error("Failed to fetch hosting clients:", error);
    return NextResponse.json(
      { error: "Failed to fetch hosting clients" },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  domain: z.string().min(1).max(255),
  workspaceId: z.string().uuid().optional(),
  clientName: z.string().max(255).optional(),
  projectId: z.string().uuid().optional(),
  status: z.enum(["not_started", "in_progress", "done", "archived"]).default("not_started"),
  result: z
    .enum([
      "company_work",
      "not_started",
      "stuck",
      "pending_review",
      "in_progress",
      "upcoming_renewal",
      "done",
    ])
    .optional(),
  summary: z.string().max(5000).optional(),
  comments: z.string().max(10000).optional(),
  text: z.string().max(10000).optional(),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().uuid().optional(),
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

  const { dueDate, workspaceId, ...data } = parsed.data;

  let targetWorkspaceId = workspaceId;
  if (!targetWorkspaceId) {
    const memberships = Array.from(authz.memberships.entries()).sort((a, b) => {
      const w = { owner: 3, admin: 2, member: 1, viewer: 0 };
      return (w[b[1]] ?? 0) - (w[a[1]] ?? 0);
    });
    targetWorkspaceId = memberships[0]?.[0] ?? null;
  }

  if (!targetWorkspaceId) {
    return NextResponse.json(
      { error: "You are not a member of any workspace" },
      { status: 403 }
    );
  }

  if (!canEditWorkspaceContent(authz, targetWorkspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [client] = await db
      .insert(hostingClients)
      .values({
        ...data,
        workspaceId: targetWorkspaceId,
        dueDate: dueDate ? new Date(dueDate) : null,
      })
      .returning();

    return NextResponse.json({ data: client }, { status: 201 });
  } catch (error) {
    console.error("Failed to create hosting client:", error);
    return NextResponse.json(
      { error: "Failed to create hosting client" },
      { status: 500 }
    );
  }
}
