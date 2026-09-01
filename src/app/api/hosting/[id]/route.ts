import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { hostingClients } from "@/lib/db/schema";
import {
  getAuthz,
  canViewWorkspaceContent,
  canEditWorkspaceContent,
  canManageWorkspace,
} from "@/lib/authz";

const updateSchema = z.object({
  domain: z.string().min(1).max(255).optional(),
  clientName: z.string().max(255).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "done", "archived"]).optional(),
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
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [client] = await db
      .select()
      .from(hostingClients)
      .where(eq(hostingClients.id, id))
      .limit(1);

    if (!client) {
      return NextResponse.json(
        { error: "Hosting client not found" },
        { status: 404 }
      );
    }

    if (!client.workspaceId || !canViewWorkspaceContent(authz, client.workspaceId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: client });
  } catch (error) {
    console.error("Failed to fetch hosting client:", error);
    return NextResponse.json(
      { error: "Failed to fetch hosting client" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { dueDate, ...data } = parsed.data;

  try {
    const [existing] = await db
      .select({ workspaceId: hostingClients.workspaceId })
      .from(hostingClients)
      .where(eq(hostingClients.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      !existing.workspaceId ||
      !canEditWorkspaceContent(authz, existing.workspaceId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const values = {
      ...data,
      ...(dueDate !== undefined && {
        dueDate: dueDate ? new Date(dueDate) : null,
      }),
    };

    const [client] = await db
      .update(hostingClients)
      .set(values)
      .where(eq(hostingClients.id, id))
      .returning();

    return NextResponse.json({ data: client });
  } catch (error) {
    console.error("Failed to update hosting client:", error);
    return NextResponse.json(
      { error: "Failed to update hosting client" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [existing] = await db
      .select({ workspaceId: hostingClients.workspaceId })
      .from(hostingClients)
      .where(eq(hostingClients.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      !existing.workspaceId ||
      !canManageWorkspace(authz, existing.workspaceId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(hostingClients).where(eq(hostingClients.id, id));
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to delete hosting client:", error);
    return NextResponse.json(
      { error: "Failed to delete hosting client" },
      { status: 500 }
    );
  }
}
