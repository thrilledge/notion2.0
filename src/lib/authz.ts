import { eq, inArray, and, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  folders,
  folderAccess,
  folderProjects,
  folderHostingClients,
  hostingClients,
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

export const SYSTEM_FOLDERS = {
  ALL_PROJECTS: "all_projects",
  SIDE_PROJECTS: "side_projects",
  HOSTING_CLIENTS: "hosting_clients",
} as const;

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

/**
 * Folder ids the user can see. Global owners and workspace owners see every
 * folder in the workspace; ordinary members only see folders they have been
 * granted via `folder_access`.
 */
export async function getAccessibleFolderIds(
  ctx: AuthzContext,
  workspaceId?: string
): Promise<string[]> {
  if (ctx.isGlobalOwner) {
    const rows = workspaceId
      ? await db
          .select({ id: folders.id })
          .from(folders)
          .where(eq(folders.workspaceId, workspaceId))
      : await db.select({ id: folders.id }).from(folders);
    return rows.map((r) => r.id);
  }

  // Workspace owners can manage -> they see all folders in owned workspaces.
  const ownedWorkspaceIds = Array.from(ctx.memberships.entries())
    .filter(([, role]) => role === "owner")
    .map(([wid]) => wid);

  const ownedRows =
    ownedWorkspaceIds.length > 0
      ? await db
          .select({ id: folders.id })
          .from(folders)
          .where(
            and(
              inArray(folders.workspaceId, ownedWorkspaceIds),
              workspaceId ? eq(folders.workspaceId, workspaceId) : undefined
            )
          )
      : [];

  const ownedSet = new Set(ownedRows.map((r) => r.id));

  // Folders granted to this specific user.
  const memberWhere = workspaceId
    ? and(eq(folderAccess.userId, ctx.userId), eq(folders.workspaceId, workspaceId))
    : eq(folderAccess.userId, ctx.userId);
  const memberRows = await db
    .select({ id: folders.id })
    .from(folderAccess)
    .innerJoin(folders, eq(folderAccess.folderId, folders.id))
    .where(memberWhere);

  return [...ownedSet, ...memberRows.map((r) => r.id)];
}

/**
 * Grant a user access to every folder in a workspace (idempotent). Used when a
 * user joins a workspace so current members keep seeing the same content until
 * the owner explicitly narrows their access.
 */
export async function grantAllFolders(
  workspaceId: string,
  userId: string
): Promise<void> {
  await db.execute(sql`
    INSERT INTO folder_access (folder_id, user_id)
    SELECT f.id, ${userId}
    FROM folders f
    WHERE f.workspace_id = ${workspaceId}
    ON CONFLICT (folder_id, user_id) DO NOTHING
  `);
}

/**
 * True when a member has access to (virtually) any project of the given
 * project type — i.e. they hold the corresponding system folder
 * ("all_projects" for client, "side_projects" for side projects) OR are an
 * owner. Non-owner members must have the folder granted explicitly.
 */
export async function canSeeProjectType(
  ctx: AuthzContext,
  workspaceId: string,
  type: "client" | "side_project"
): Promise<boolean> {
  if (ctx.isGlobalOwner) return true;
  const role = ctx.memberships.get(workspaceId);
  if (role === "owner") return true;

  const code = type === "client" ? SYSTEM_FOLDERS.ALL_PROJECTS : SYSTEM_FOLDERS.SIDE_PROJECTS;
  const grants = await db
    .select({ id: folderAccess.folderId })
    .from(folderAccess)
    .innerJoin(folders, eq(folderAccess.folderId, folders.id))
    .where(
      and(
        eq(folderAccess.userId, ctx.userId),
        eq(folders.workspaceId, workspaceId),
        eq(folders.code, code)
      )
    )
    .limit(1);
  return grants.length > 0;
}

/**
 * Can this user see hosting clients at all in the workspace? Owners always
 * can; members need the "hosting_clients" system folder granted.
 */
export async function canSeeHostingClients(
  ctx: AuthzContext,
  workspaceId: string
): Promise<boolean> {
  if (ctx.isGlobalOwner) return true;
  const role = ctx.memberships.get(workspaceId);
  if (role === "owner") return true;

  const grants = await db
    .select({ id: folderAccess.folderId })
    .from(folderAccess)
    .innerJoin(folders, eq(folderAccess.folderId, folders.id))
    .where(
      and(
        eq(folderAccess.userId, ctx.userId),
        eq(folders.workspaceId, workspaceId),
        eq(folders.code, SYSTEM_FOLDERS.HOSTING_CLIENTS)
      )
    )
    .limit(1);
  return grants.length > 0;
}

/**
 * Project ids the user can access, optionally limited to a workspace.
 * Global + workspace owners: all projects. Members: only the projects inside
 * folders they have been granted — derived from the system folders by type and
 * from explicit memberships on custom folders.
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

  const ownedWorkspaceIds = workspaceIds.filter(
    (wid) => ctx.memberships.get(wid) === "owner"
  );
  const memberWorkspaceIds = workspaceIds.filter(
    (wid) => ctx.memberships.get(wid) !== "owner"
  );

  const result = new Set<string>();

  if (ownedWorkspaceIds.length > 0) {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(inArray(projects.workspaceId, ownedWorkspaceIds));
    for (const r of rows) result.add(r.id);
  }

  if (memberWorkspaceIds.length > 0) {
    // Folders granted to this user inside their member workspaces.
    const granted = await db
      .select({ id: folders.id, code: folders.code, workspaceId: folders.workspaceId, kind: folders.kind })
      .from(folderAccess)
      .innerJoin(folders, eq(folderAccess.folderId, folders.id))
      .where(
        and(
          eq(folderAccess.userId, ctx.userId),
          inArray(folders.workspaceId, memberWorkspaceIds)
        )
      );

    const systemProject = new Set<string>();
    const systemSide = new Set<string>();
    const customFolderIds: string[] = [];
    for (const f of granted) {
      if (f.kind !== "project") continue;
      if (f.code === SYSTEM_FOLDERS.ALL_PROJECTS) systemProject.add(f.workspaceId);
      else if (f.code === SYSTEM_FOLDERS.SIDE_PROJECTS) systemSide.add(f.workspaceId);
      else customFolderIds.push(f.id);
    }

    if (systemProject.size > 0) {
      const rows = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            inArray(projects.workspaceId, Array.from(systemProject)),
            eq(projects.type, "client")
          )
        );
      for (const r of rows) result.add(r.id);
    }
    if (systemSide.size > 0) {
      const rows = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            inArray(projects.workspaceId, Array.from(systemSide)),
            eq(projects.type, "side_project")
          )
        );
      for (const r of rows) result.add(r.id);
    }
    if (customFolderIds.length > 0) {
      const rows = await db
        .select({ projectId: folderProjects.projectId })
        .from(folderProjects)
        .where(inArray(folderProjects.folderId, customFolderIds));
      for (const r of rows) result.add(r.projectId);
    }
  }

  if (workspaceId) {
    // Restrict to the requested workspace via an additional membership check
    // (projects may live in owned workspaces too).
    const inWs = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(inArray(projects.id, Array.from(result)), eq(projects.workspaceId, workspaceId)));
    return inWs.map((r) => r.id);
  }

  return Array.from(result);
}

/**
 * Hosting client ids the user can access. Owners: all in the workspace(s).
 * Members: hosting clients inside folders they are granted — the system
 * "hosting_clients" folder yields every hosting client of that workspace,
 * custom hosting-client folders yield their explicit members.
 */
export async function getAccessibleHostingClientIds(
  ctx: AuthzContext,
  workspaceId?: string
): Promise<string[]> {
  if (ctx.isGlobalOwner) {
    const rows = workspaceId
      ? await db
          .select({ id: hostingClients.id })
          .from(hostingClients)
          .where(eq(hostingClients.workspaceId, workspaceId))
      : await db.select({ id: hostingClients.id }).from(hostingClients);
    return rows.map((r) => r.id);
  }

  const workspaceIds = Array.from(ctx.memberships.keys()).filter(
    (wid) => !workspaceId || wid === workspaceId
  );
  if (workspaceIds.length === 0) return [];

  const ownedWorkspaceIds = workspaceIds.filter(
    (wid) => ctx.memberships.get(wid) === "owner"
  );
  const memberWorkspaceIds = workspaceIds.filter(
    (wid) => ctx.memberships.get(wid) !== "owner"
  );

  const result = new Set<string>();

  if (ownedWorkspaceIds.length > 0) {
    const rows = await db
      .select({ id: hostingClients.id })
      .from(hostingClients)
      .where(inArray(hostingClients.workspaceId, ownedWorkspaceIds));
    for (const r of rows) result.add(r.id);
  }

  if (memberWorkspaceIds.length > 0) {
    const granted = await db
      .select({ id: folders.id, code: folders.code, workspaceId: folders.workspaceId, kind: folders.kind })
      .from(folderAccess)
      .innerJoin(folders, eq(folderAccess.folderId, folders.id))
      .where(
        and(
          eq(folderAccess.userId, ctx.userId),
          inArray(folders.workspaceId, memberWorkspaceIds)
        )
      );

    const systemHosting = new Set<string>();
    const customFolderIds: string[] = [];
    for (const f of granted) {
      if (f.kind !== "hosting_client") continue;
      if (f.code === SYSTEM_FOLDERS.HOSTING_CLIENTS) systemHosting.add(f.workspaceId);
      else customFolderIds.push(f.id);
    }

    if (systemHosting.size > 0) {
      const rows = await db
        .select({ id: hostingClients.id })
        .from(hostingClients)
        .where(inArray(hostingClients.workspaceId, Array.from(systemHosting)));
      for (const r of rows) result.add(r.id);
    }
    if (customFolderIds.length > 0) {
      const rows = await db
        .select({ hostingClientId: folderHostingClients.hostingClientId })
        .from(folderHostingClients)
        .where(inArray(folderHostingClients.folderId, customFolderIds));
      for (const r of rows) result.add(r.hostingClientId);
    }
  }

  if (workspaceId) {
    const inWs = await db
      .select({ id: hostingClients.id })
      .from(hostingClients)
      .where(
        and(
          inArray(hostingClients.id, Array.from(result)),
          eq(hostingClients.workspaceId, workspaceId)
        )
      );
    return inWs.map((r) => r.id);
  }

  return Array.from(result);
}

/**
 * Full folder rows the user can access (for sidebar navigation). Owners get
 * every folder in their workspaces; members only granted ones.
 */
export async function getAccessibleFolders(
  ctx: AuthzContext,
  workspaceId?: string
) {
  const ids = await getAccessibleFolderIds(ctx, workspaceId);
  if (ids.length === 0) return [] as typeof folders.$inferSelect[];

  return db
    .select()
    .from(folders)
    .where(inArray(folders.id, ids))
    .orderBy(folders.workspaceId, folders.sortOrder, folders.name);
}

/** True when the user can see a specific project. */
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
  const workspaceId = project.workspaceId ?? "";
  const role = ctx.memberships.get(workspaceId);
  if (!role) return false;
  if (role === "owner") return true;
  // Members: only if this project sits inside a folder they were granted.
  return (await getAccessibleProjectIds(ctx, workspaceId)).includes(projectId);
}

/**
 * True if the user can view a specific hosting client. Owners: yes.
 * Members: only if the client sits inside a folder they were granted.
 */
export async function canViewHostingClient(
  ctx: AuthzContext,
  hostingClientId: string
): Promise<boolean> {
  if (ctx.isGlobalOwner) return true;
  const [client] = await db
    .select({ id: hostingClients.id, workspaceId: hostingClients.workspaceId })
    .from(hostingClients)
    .where(eq(hostingClients.id, hostingClientId))
    .limit(1);
  if (!client) return false;
  const workspaceId = client.workspaceId ?? "";
  const role = ctx.memberships.get(workspaceId);
  if (!role) return false;
  if (role === "owner") return true;
  return (await getAccessibleHostingClientIds(ctx, workspaceId)).includes(
    hostingClientId
  );
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
