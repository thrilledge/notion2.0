import dotenv from "dotenv";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

/**
 * Removes ALL e2e test residue from the shared database.
 *
 * The Playwright suites create QA_* projects (inside whatever workspace the
 * fixtures belong to), QA_TEST_WS_* workspaces, QA_* hosting clients and
 * *@test.local users/invitations. Because local tests and the Vercel deploy
 * share the same Supabase Postgres, leftover rows show up on the live site.
 * This script deletes them. It is wired into Playwright as globalSetup +
 * globalTeardown so every run starts and ends clean.
 */

const DATABASE_URL = (process.env.DATABASE_URL ?? "").replace(/^"|"$/g, "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const KEEP_EMAILS = new Set([
  "owner@test.local",
  "member@test.local",
]);

async function cleanupDb(): Promise<void> {
  if (!DATABASE_URL) {
    console.log("  No DATABASE_URL — skipping DB cleanup");
    return;
  }
  const sql = postgres(DATABASE_URL, { max: 2 });

  // QA_* projects include all pages/blocks/assignees and their pages.
  const qaProjects = await sql`select id from projects where name like 'QA_%'`;
  if (qaProjects.length > 0) {
    const ids = qaProjects.map((r) => r.id);
    await sql`delete from page_blocks where page_id in (
      select id from pages where parent_id = any(${ids}) and parent_type = 'project'
    )`;
    await sql`delete from pages where parent_id = any(${ids}) and parent_type = 'project'`;
    await sql`delete from projects where id = any(${ids})`;
    console.log(`  Deleted ${qaProjects.length} QA_* projects`);
  }

  // QA_* hosting clients and their pages.
  const qaHosting = await sql`select id from hosting_clients where client_name like 'QA_%' or domain like 'qa-%'`;
  if (qaHosting.length > 0) {
    const ids = qaHosting.map((r) => r.id);
    await sql`delete from page_blocks where page_id in (
      select id from pages where parent_id = any(${ids}) and parent_type = 'hosting_client'
    )`;
    await sql`delete from pages where parent_id = any(${ids}) and parent_type = 'hosting_client'`;
    await sql`delete from hosting_clients where id = any(${ids})`;
    console.log(`  Deleted ${qaHosting.length} QA_* hosting clients`);
  }

  // QA_* workspaces (cascades workspace_members).
  const qaWorkspaces = await sql`select id from workspaces where name like 'QA_%' or name like 'QA_TEST_WS_%'`;
  if (qaWorkspaces.length > 0) {
    const ids = qaWorkspaces.map((r) => r.id);
    await sql`update projects set workspace_id = null where workspace_id = any(${ids})`;
    await sql`delete from invitations where workspace_id = any(${ids})`;
    await sql`delete from workspaces where id = any(${ids})`;
    console.log(`  Deleted ${qaWorkspaces.length} QA_* workspaces`);
  }

  // Test invitations and users (keep the two fixture accounts).
  const delInvites = await sql`delete from invitations where email ilike '%@test.local' returning id`;
  if (delInvites.length > 0) console.log(`  Deleted ${delInvites.length} test invitations`);

  const testUsers = await sql`select id, email from users where email ilike '%@test.local'`;
  const toRemove = testUsers.filter((u) => !KEEP_EMAILS.has(u.email));
  if (toRemove.length > 0) {
    const ids = toRemove.map((r) => r.id);
    await sql`delete from users where id = any(${ids})`;
    console.log(`  Deleted ${toRemove.length} test users`);
  }

  await sql.end();
}

async function cleanupAuth(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log("  No Supabase admin credentials — skipping auth cleanup");
    return;
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    console.log("  Could not list auth users:", error.message);
    return;
  }
  const doomed = (data?.users ?? []).filter(
    (u) => u.email?.endsWith("@test.local") && !KEEP_EMAILS.has(u.email)
  );
  for (const u of doomed) {
    await admin.auth.admin.deleteUser(u.id);
  }
  if (doomed.length > 0) console.log(`  Deleted ${doomed.length} Supabase auth test users`);
}

export async function cleanupTestData(): Promise<void> {
  console.log("=== Cleaning QA test data ===");
  await cleanupDb();
  await cleanupAuth();
  console.log("=== Cleanup done ===");
}

// Allow running directly: `npx tsx scripts/cleanup-test-data.ts`
if (require.main === module) {
  cleanupTestData().catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  });
}