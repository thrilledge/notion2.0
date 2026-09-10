/**
 * Presence schema migration (raw SQL, idempotent). Adds a last_seen_at
 * column to workspace_members for online-presence tracking.
 *
 *   npx tsx scripts/migrate-presence.ts
 */
import { sql } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const { DATABASE_URL } = process.env;

const STATEMENTS: string[] = [
  `alter table workspace_members
    add column if not exists last_seen_at timestamptz`,
  `create index if not exists workspace_members_last_seen_idx
    on workspace_members(last_seen_at)`,
];

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is not set (loads .env.local).");
    process.exit(1);
  }
  const { db } = await import("../src/lib/db");
  await db.execute(sql`select 1`);
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
  }
  console.log("Presence schema migration complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});