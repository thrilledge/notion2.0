import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL!;
const client = postgres(url, { max: 1 });
const db = drizzle(client);

async function main() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS project_assignees (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamp DEFAULT now() NOT NULL,
      PRIMARY KEY (project_id, user_id)
    );
  `);
  console.log("project_assignees table ensured");

  await db.execute(`
    INSERT INTO project_assignees (project_id, user_id)
    SELECT id, assignee_id FROM projects
    WHERE assignee_id IS NOT NULL
    ON CONFLICT (project_id, user_id) DO NOTHING;
  `);
  console.log("backfilled assigneeId -> project_assignees");

  const after = await db.execute(`SELECT count(*)::int AS c FROM project_assignees`);
  console.log("project_assignees rows:", after[0]?.c ?? 0);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
