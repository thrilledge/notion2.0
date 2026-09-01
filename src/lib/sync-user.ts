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
 * On the very first sign-in, promote that user to global Owner and create the
 * default workspace, attaching all existing unscoped (Notion-imported) data to
 * it. Every later user is a plain member with NO workspace access and NO data.
 *
 * Idempotent: runs only while there is no workspace yet.
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

  if (existingWorkspace && owner.length > 0) return { workspaceId: existingWorkspace.id, ownerId: owner[0].id };

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
    // Try to adopt an existing users row that shares the same email
    // (e.g. a Notion-imported user) by linking them to this auth id.
    const byEmail = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (byEmail.length && byEmail[0].id !== authUser.id) {
      userId = byEmail[0].id;
    } else {
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
  }

  if (!userId) return null;

  try {
    await ensureWorkspaceBootstrap();
  } catch (e) {
    console.error("Workspace bootstrap failed:", e);
  }

  return (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0] ?? null;
}
