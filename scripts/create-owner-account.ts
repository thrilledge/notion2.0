/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { users, workspaceMembers, workspaces } from "../src/lib/db/schema";
import { createAdminClient } from "../src/lib/supabase/admin";

const TARGET_EMAIL = "info@thrilledge.com";
const TARGET_PASSWORD = process.env.OWNER_PASSWORD || "";
const TARGET_NAME = "Zerrak Jamshaid";

async function main() {
  checkEnv();
  if (!TARGET_PASSWORD) {
    throw new Error("Missing OWNER_PASSWORD environment variable.");
  }

  const supabase = createAdminClient();

  // 1. Look up existing auth user by email.
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find(
    (u) => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase()
  );

  let authUserId: string;
  if (existing) {
    console.log("AUTH USER ALREADY EXISTS:", existing.id, existing.email);
    authUserId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: TARGET_NAME },
      app_metadata: { name: TARGET_NAME },
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    console.log("AUTH USER CREATED:", data.user.id, data.user.email);
    authUserId = data.user.id;
  }

  // 2. Find/attach the users DB row keyed by the auth id.
  const [existingDbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, authUserId))
    .limit(1);

  if (existingDbUser) {
    await db
      .update(users)
      .set({
        email: TARGET_EMAIL,
        fullName: TARGET_NAME,
        role: "owner",
        status: "active",
      })
      .where(eq(users.id, authUserId));
    console.log("USERS ROW UPDATED -> owner:", authUserId);
  } else {
    await db
      .insert(users)
      .values({
        id: authUserId,
        email: TARGET_EMAIL,
        fullName: TARGET_NAME,
        role: "owner",
        status: "active",
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: TARGET_EMAIL,
          fullName: TARGET_NAME,
          role: "owner",
          status: "active",
        },
      });
    console.log("USERS ROW CREATED -> owner:", authUserId);
  }

  // 3. Attach to the Company Workspace as owner.
  const [ws] = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (ws) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: ws.id, userId: authUserId, role: "owner" })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { role: "owner" },
      });
    console.log("WORKSPACE OWNERSHIP SET:", ws.id);
  } else {
    console.warn("NO WORKSPACE FOUND — workspace ownership skipped.");
  }

  // 4. Demote the old synthetic owner so there is exactly ONE real global Owner.
  const [oldOwner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "owner"))
    .limit(1);
  if (oldOwner && oldOwner.id !== authUserId) {
    await db.update(users).set({ role: "member" }).where(eq(users.id, oldOwner.id));
    if (ws) {
      await db
        .update(workspaceMembers)
        .set({ role: "member" })
        .where(
          sql`${workspaceMembers.workspaceId} = ${ws.id} and ${workspaceMembers.userId} = ${oldOwner.id}`
        );
    }
    console.log("DEMOTED OLD OWNER -> member:", oldOwner.id);
  }

  // 5. Verify.
  const owners = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role })
    .from(users)
    .where(eq(users.role, "owner"));
  console.log("GLOBAL OWNERS NOW:", owners.length, owners.map((o) => o.email));

  process.exit(0);
}

function checkEnv() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
  }
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
