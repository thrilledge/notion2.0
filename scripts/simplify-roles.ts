/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Simplify workspace roles: only owner + member remain.
 * - Convert existing 'admin'/'viewer' workspace members -> 'member'.
 * - Replace the workspace_members.role CHECK constraint.
 * - Demote any global users.role='admin' -> 'member'.
 *
 * Idempotent. Run with DATABASE_URL set in the shell first:
 *   npx tsx scripts/simplify-roles.ts
 */
import { count, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { workspaceMembers, users } from "../src/lib/db/schema";

async function main() {
  await db.execute(sql`select 1`);

  // Demote global 'admin' users to 'member' (only 'owner' and 'member' remain meaningfully).
  const adminUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.role} = 'admin'`);
  if (adminUsers.length) {
    await db
      .update(users)
      .set({ role: "member" })
      .where(sql`${users.role} = 'admin'`);
    console.log("Demoted global admin users -> member:", adminUsers.length);
  }

  // Convert existing 'admin'/'viewer' workspace members to 'member'.
  const convert = await db
    .update(workspaceMembers)
    .set({ role: "member" })
    .where(sql`${workspaceMembers.role} in ('admin','viewer')`)
    .returning({ ws: workspaceMembers.workspaceId, uid: workspaceMembers.userId });
  console.log("Converted admin/viewer workspace members -> member:", convert.length);

  // Rebuild the CHECK constraint on workspace_members.role.
  await db.execute(
    sql.raw(
      `alter table workspace_members drop constraint if exists workspace_members_role_check`
    )
  );
  await db.execute(
    sql.raw(
      `alter table workspace_members add constraint workspace_members_role_check check (role in ('owner','member'))`
    )
  );
  console.log("workspace_members.role CHECK updated to (owner, member).");

  // Sanity: ensure no stray roles remain.
  const [bad] = await db
    .select({ n: count() })
    .from(workspaceMembers)
    .where(sql`${workspaceMembers.role} not in ('owner','member')`);
  console.log("Remaining non-owner/member workspace role rows:", bad?.n ?? 0);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
