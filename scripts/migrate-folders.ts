import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL!;
const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client);

/**
 * Creates the folder infrastructure and seeds the default system folders per
 * workspace, granting every existing workspace member access to those default
 * folders so no existing content becomes invisible. Owners see all folders
 * regardless of the access rows.
 *
 * Idempotent: safe to run repeatedly (ON CONFLICT DO NOTHING everywhere).
 */
async function main() {
  console.log("== folder_access: ensuring tables ==");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS folders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name text NOT NULL,
      kind text NOT NULL DEFAULT 'project' CHECK (kind IN ('project', 'hosting_client')),
      code text,
      sort_order double precision NOT NULL DEFAULT 0,
      created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS folders_workspace_idx ON folders (workspace_id);
    CREATE UNIQUE INDEX IF NOT EXISTS folders_workspace_code_idx ON folders (workspace_id, code);
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS folder_projects (
      folder_id uuid NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at timestamp DEFAULT now() NOT NULL,
      PRIMARY KEY (folder_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS folder_projects_folder_idx ON folder_projects (folder_id);
    CREATE INDEX IF NOT EXISTS folder_projects_project_idx ON folder_projects (project_id);
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS folder_hosting_clients (
      folder_id uuid NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      hosting_client_id uuid NOT NULL REFERENCES hosting_clients(id) ON DELETE CASCADE,
      created_at timestamp DEFAULT now() NOT NULL,
      PRIMARY KEY (folder_id, hosting_client_id)
    );
    CREATE INDEX IF NOT EXISTS folder_hosting_folder_idx ON folder_hosting_clients (folder_id);
    CREATE INDEX IF NOT EXISTS folder_hosting_client_idx ON folder_hosting_clients (hosting_client_id);
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS folder_access (
      folder_id uuid NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamp DEFAULT now() NOT NULL,
      PRIMARY KEY (folder_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS folder_access_user_idx ON folder_access (user_id);
  `);
  console.log("tables ensured");

  const workspaces = await db.execute(`SELECT id FROM workspaces ORDER BY created_at`);

  for (const ws of workspaces) {
    const wid = (ws as { id: string }).id;

    // Seed the three system folders.
    const defaults = [
      { code: "all_projects", name: "All Projects", kind: "project", sort: 0 },
      { code: "side_projects", name: "Side Projects", kind: "project", sort: 1 },
      { code: "hosting_clients", name: "Hosting Clients", kind: "hosting_client", sort: 2 },
    ] as const;

    for (const d of defaults) {
      await db.execute(sql`
        INSERT INTO folders (workspace_id, name, kind, code, sort_order)
        VALUES (${wid}, ${d.name}, ${d.kind}, ${d.code}, ${d.sort})
        ON CONFLICT (workspace_id, code) DO UPDATE SET
          name = EXCLUDED.name,
          kind = EXCLUDED.kind
      `);
    }

    // Grant every existing workspace member access to all folders in the
    // workspace (so current visibility is preserved exactly).
    await db.execute(sql`
      INSERT INTO folder_access (folder_id, user_id)
      SELECT f.id, wm.user_id
      FROM folders f
      JOIN workspace_members wm ON wm.workspace_id = f.workspace_id
      WHERE f.workspace_id = ${wid}
      ON CONFLICT (folder_id, user_id) DO NOTHING
    `);
    console.log(`workspace ${wid}: default folders + member access ensured`);
  }

  const folderCount = await db.execute(`SELECT count(*)::int AS c FROM folders`);
  const accessCount = await db.execute(`SELECT count(*)::int AS c FROM folder_access`);
  console.log("folders:", folderCount[0]?.c ?? 0);
  console.log("folder_access rows:", accessCount[0]?.c ?? 0);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});