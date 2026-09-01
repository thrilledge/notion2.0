import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * All row-level access control lives here. The DB is reached through a shared
 * service connection (not Postgres RLS), so every read/write must be scoped by
 * these helpers to keep data isolated per user.
 *
 * Global Owner (super admin) = users.role === "owner". Everyone else is scoped
 * by workspace memberships: any member sees all workspace content and projects.
 */

export interface AuthzContext {
  userId: string;
  email: string;
  isGlobalOwner: boolean;
  /** workspaceId -> role for every workspace the user belongs to */
  memberships: Map<string, WorkspaceRole>;
}

/** Role hierarchy weight. Higher = more privileged. */
const ROLE_WEIGHT: Record<WorkspaceRole, number> = {
  member: 0,
  owner: 1,
};

export function roleGte(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[min];
}

/** Load the authenticated Supabase user (server-side). Returns null if none. */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Build the full AuthzContext for the current request. Returns null if unauthenticated. */
export async function getAuthz(): Promise<AuthzContext | null> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return null;

  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const memberRows = await db
    .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));

  const memberships = new Map<string, WorkspaceRole>();
  for (const m of memberRows) memberships.set(m.workspaceId, m.role);

  return {
    userId,
    email: user.email,
    isGlobalOwner: user.role === "owner",
    memberships,
  };
}

/** workspace role the user holds in a workspace, if any. */
export function roleInWorkspace(
  ctx: AuthzContext,
  workspaceId: string
): WorkspaceRole | null {
  return ctx.memberships.get(workspaceId) ?? null;
}

/**
 * Workspace ids the user can see content for. Global owner sees all; otherwise
 * only workspaces they are a member of.
 */
export async function getAccessibleWorkspaceIds(
  ctx: AuthzContext
): Promise<string[]> {
  if (ctx.isGlobalOwner) {
    const rows = await db.select({ id: workspaces.id }).from(workspaces);
    return rows.map((r) => r.id);
  }
  return Array.from(ctx.memberships.keys());
}

/**
 * Can the user view workspace-scoped content (docs/meetings/wiki/hosting) in
 * this workspace? Owner (global) or any workspace membership.
 */
export function canViewWorkspaceContent(
  ctx: AuthzContext,
  workspaceId: string
): boolean {
  if (ctx.isGlobalOwner) return true;
  return ctx.memberships.has(workspaceId);
}

/** Can the user edit/create workspace content? Viewer cannot. */
export function canEditWorkspaceContent(
  ctx: AuthzContext,
  workspaceId: string
): boolean {
  if (ctx.isGlobalOwner) return true;
  const role = ctx.memberships.get(workspaceId);
  return !!role && roleGte(role, "member");
}

/** Can the user manage the workspace (members, assignments, projects)? */
export function canManageWorkspace(
  ctx: AuthzContext,
  workspaceId: string
): boolean {
  if (ctx.isGlobalOwner) return true;
  const role = ctx.memberships.get(workspaceId);
  return role === "owner";
}

/** Can the user see ALL projects in this workspace (not just assigned ones)? */
export function canSeeAllProjectsInWorkspace(
  ctx: AuthzContext,
  workspaceId: string
): boolean {
  if (ctx.isGlobalOwner) return true;
  return ctx.memberships.has(workspaceId);
}

/**
 * Project ids the user can access, optionally limited to a workspace.
 * Global owner: all projects. Members and owners: every project in the
 * workspaces they belong to.
 */
export async function getAccessibleProjectIds(
  ctx: AuthzContext,
  workspaceId?: string
): Promise<string[]> {
  if (ctx.isGlobalOwner) {
    const rows =
      workspaceId
        ? await db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.workspaceId, workspaceId))
        : await db.select({ id: projects.id }).from(projects);
    return rows.map((r) => r.id);
  }

  const workspaceIds = Array.from(ctx.memberships.keys()).filter(
    (wid) => !workspaceId || wid === workspaceId
  );
  if (workspaceIds.length === 0) return [];

  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.workspaceId, workspaceIds));
  return rows.map((r) => r.id);
}

/** True if the user can view a specific project. */
export async function canViewProject(
  ctx: AuthzContext,
  projectId: string
): Promise<boolean> {
  if (ctx.isGlobalOwner) return true;
  const [project] = await db
    .select({ id: projects.id, workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return false;
  // Any member of the project's workspace can view it.
  return ctx.memberships.has(project.workspaceId ?? "");
}

/** Can the user edit a specific project (its properties/content)? Viewer cannot. */
export async function canEditProject(
  ctx: AuthzContext,
  projectId: string
): Promise<boolean> {
  if (!(await canViewProject(ctx, projectId))) return false;
  if (ctx.isGlobalOwner) return true;
  const [project] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const role = ctx.memberships.get(project?.workspaceId ?? "");
  return !!role && roleGte(role, "member");
}

/** True if the user can create a project inside a workspace. */
export function canCreateProject(
  ctx: AuthzContext,
  workspaceId: string
): boolean {
  if (ctx.isGlobalOwner) return true;
  const role = ctx.memberships.get(workspaceId);
  return !!role && roleGte(role, "member");
}
