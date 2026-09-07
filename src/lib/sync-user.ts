import { db } from "@/lib/db";
import {
  docs,
  hostingClients,
  meetings,
  projects,
  users,
  wikiPages,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

interface AuthUserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  full_name?: string | null;
  email_confirmed_at?: string | null;
}

/**
 * On a fresh deployment with no global owner yet, promote the first sign-in to
 * global Owner, create the default workspace, and attach all unscoped
 * (Notion-imported) data to it.
 *
 * This is privileged and MUST be explicitly enabled per deployment via
 * `ALLOW_BOOTSTRAP_OWNER=true`; otherwise the first person who signs in would
 * silently become the owner of everything. For a normal install, create the
 * owner account with `scripts/create-owner-account.ts` instead.
 *
 * Idempotent: with the flag on, it runs only while there is no workspace yet.
 */
export async function ensureWorkspaceBootstrap() {
  const [existingWorkspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .limit(1);

  const owner = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "owner"))
    .limit(1);

  if (existingWorkspace && owner.length > 0) {
    return { workspaceId: existingWorkspace.id, ownerId: owner[0].id };
  }

  if (process.env.ALLOW_BOOTSTRAP_OWNER !== "true") {
    // Do not create or promote anything without an explicit opt-in.
    return existingWorkspace
      ? { workspaceId: existingWorkspace.id, ownerId: owner[0]?.id ?? null }
      : null;
  }

  // If a workspace already exists but there is no global owner yet, still look
  // for a workspace-level owner to attach data to.
  const wsOwner =
    existingWorkspace && owner.length === 0
      ? await db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.role, "owner"))
          .limit(1)
      : null;

  if (wsOwner) {
    const ownerId = wsOwner[0].userId;
    const [global] = await db
      .update(users)
      .set({ role: "owner" })
      .where(eq(users.id, ownerId))
      .returning({ id: users.id });
    return { workspaceId: existingWorkspace!.id, ownerId: global.id };
  }

  // No workspace and no owner: this is the first sign-in.
  const [firstUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .orderBy(sql`created_at asc`)
    .limit(1);
  if (!firstUser) return null;

  const [ws] = await db
    .insert(workspaces)
    .values({ name: "Company Workspace", createdById: firstUser.id })
    .returning({ id: workspaces.id });

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: ws.id, userId: firstUser.id, role: "owner" })
    .onConflictDoNothing();

  await db
    .update(users)
    .set({ role: "owner" })
    .where(eq(users.id, firstUser.id));

  // Attach all unscoped Notion-imported data to the default workspace.
  await db
    .update(projects)
    .set({ workspaceId: ws.id })
    .where(sql`${projects.workspaceId} is null`);
  await db
    .update(hostingClients)
    .set({ workspaceId: ws.id })
    .where(sql`${hostingClients.workspaceId} is null`);
  await db
    .update(docs)
    .set({ workspaceId: ws.id })
    .where(sql`${docs.workspaceId} is null`);
  await db
    .update(meetings)
    .set({ workspaceId: ws.id })
    .where(sql`${meetings.workspaceId} is null`);
  await db
    .update(wikiPages)
    .set({ workspaceId: ws.id })
    .where(sql`${wikiPages.workspaceId} is null`);

  return { workspaceId: ws.id, ownerId: firstUser.id };
}

/**
 * Ensure the authenticated Supabase auth user has a matching row in our
 * `users` table keyed by the auth user id. This is required so that FKs
 * like `projects.created_by_id` and `assignee_id` resolve correctly.
 *
 * Returns the synced user row, or null if no email is present.
 */
export async function syncUser(authUser: AuthUserLike) {
  if (!authUser.email) return null;

  const email = authUser.email.toLowerCase();
  const fullName =
    (authUser.user_metadata?.full_name as string) ??
    authUser.full_name ??
    email.split("@")[0];

  let userId: string | null = null;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  if (existing.length) {
    const row = existing[0];
    if (row.fullName !== fullName || !row.fullName) {
      await db
        .update(users)
        .set({ fullName, email })
        .where(eq(users.id, authUser.id));
    }
    userId = row.id;
  } else {
    // Never adopt a pre-existing Users row that shares the email (e.g. a
    // Notion-imported member): that would hand the newcomer that row's
    // workspace access and role under a different auth identity. Always create
    // a fresh row keyed by the authenticated user id.
    const [created] = await db
      .insert(users)
      .values({
        id: authUser.id,
        email,
        fullName,
        role: "member",
        status: "active",
      })
      .onConflictDoNothing({ target: users.id })
      .returning();
    userId =
      created?.id ??
      (await db.select({ id: users.id }).from(users).where(eq(users.id, authUser.id)).limit(1))[0]?.id ??
      null;
  }

  if (!userId) return null;

  try {
    await ensureWorkspaceBootstrap();
  } catch (e) {
    console.error("Workspace bootstrap failed:", e);
  }

  return (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0] ?? null;
}
