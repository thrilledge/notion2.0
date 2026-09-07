import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OWNER_EMAIL = "owner@test.local";
const OWNER_PASSWORD = "TestOwner123!";
const OWNER_NAME = "QA Test Owner";
const MEMBER_EMAIL = "member@test.local";
const MEMBER_PASSWORD = "TestMember123!";
const MEMBER_NAME = "QA Test Member";

async function ensureUser(
  email: string,
  password: string,
  name: string
): Promise<string> {
  // Create or update in Supabase Auth
  const { data: listData } = await admin.auth.admin.listUsers();
  const existing = listData?.users?.find((u) => u.email === email);

  let authUserId: string;

  if (existing) {
    console.log(`  Auth user ${email} exists (id: ${existing.id})`);
    authUserId = existing.id;
    // Ensure password is correct
    await admin.auth.admin.updateUserById(existing.id, { password });
  } else {
    const { data: userData, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error) throw error;
    authUserId = userData.user.id;
    console.log(`  Created auth user ${email} (id: ${authUserId})`);
  }
  await admin.auth.signOut();
  return authUserId;
}

async function main() {
  console.log("=== QA Test Setup ===\n");
  const sql = postgres(DATABASE_URL, { max: 5 });

  console.log("1. Ensuring owner user...");
  const ownerId = await ensureUser(OWNER_EMAIL, OWNER_PASSWORD, OWNER_NAME);

  console.log("\n2. Ensuring member user...");
  const memberId = await ensureUser(MEMBER_EMAIL, MEMBER_PASSWORD, MEMBER_NAME);

  // Insert users into the users table (syncUser would do this on login, but we need them now for FK)
  console.log("\n3. Inserting users into DB...");
  await sql`INSERT INTO users (id, email, full_name, role, status) VALUES (${ownerId}, ${OWNER_EMAIL}, ${OWNER_NAME}, 'owner', 'active') ON CONFLICT (id) DO UPDATE SET role = 'owner', full_name = ${OWNER_NAME}`;
  console.log(`  Owner user in DB ensured`);
  await sql`INSERT INTO users (id, email, full_name, role, status) VALUES (${memberId}, ${MEMBER_EMAIL}, ${MEMBER_NAME}, 'member', 'active') ON CONFLICT (id) DO UPDATE SET full_name = ${MEMBER_NAME}`;
  console.log(`  Member user in DB ensured`);

  // Find or create workspace
  console.log("\n4. Setting up workspace...");
  const wsRows = await sql`SELECT id FROM workspaces LIMIT 1`;
  let wsId: string;

  if (wsRows.length > 0) {
    wsId = wsRows[0].id;
    console.log(`  Using existing workspace: ${wsId}`);
  } else {
    const newWs = await sql`INSERT INTO workspaces (name, created_by_id) VALUES ('QA Test Workspace', ${ownerId}) RETURNING id`;
    wsId = newWs[0].id;
    console.log(`  Created workspace: ${wsId}`);
  }

  // Ensure memberships
  console.log("\n5. Setting up memberships...");
  await sql`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${wsId}, ${ownerId}, 'owner') ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner'`;
  console.log(`  Owner membership ensured`);
  await sql`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${wsId}, ${memberId}, 'member') ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'member'`;
  console.log(`  Member membership ensured`);

  await sql.end();
  await admin.auth.signOut();

  console.log(`\n=== Setup Complete ===`);
  console.log(`Owner:  ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log(`Member: ${MEMBER_EMAIL} / ${MEMBER_PASSWORD}`);
  console.log(`Workspace ID: ${wsId}`);
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
