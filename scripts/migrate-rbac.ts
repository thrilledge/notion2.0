/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RBAC schema migration (raw SQL because drizzle-kit push chokes on the legacy
 * CHECK constraint). Adds workspaces + workspace_members tables and a
 * workspace_id column on projects/hosting_clients/docs/meetings/wiki_pages.
 *
 * Idempotent. Run with DATABASE_URL set in the shell first:
 *   npx tsx scripts/migrate-rbac.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

const STATEMENTS: string[] = [
  // Workspaces
  `create table if not exists workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_by_id uuid references users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists workspaces_created_idx on workspaces(created_by_id)`,

  // Workspace members
  `create table if not exists workspace_members (
    workspace_id uuid not null references workspaces(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    role text not null default 'member' check (role in ('owner','admin','member','viewer')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, user_id)
  )`,
  `create index if not exists workspace_members_user_idx on workspace_members(user_id)`,
  `create index if not exists workspace_members_role_idx on workspace_members(role)`,

  // workspace_id columns
  `alter table projects add column if not exists workspace_id uuid references workspaces(id) on delete set null`,
  `create index if not exists projects_workspace_idx on projects(workspace_id)`,
  `alter table hosting_clients add column if not exists workspace_id uuid references workspaces(id) on delete set null`,
  `create index if not exists hosting_workspace_idx on hosting_clients(workspace_id)`,
  `alter table docs add column if not exists workspace_id uuid references workspaces(id) on delete set null`,
  `create index if not exists docs_workspace_idx on docs(workspace_id)`,
  `alter table meetings add column if not exists workspace_id uuid references workspaces(id) on delete set null`,
  `create index if not exists meetings_workspace_idx on meetings(workspace_id)`,
  `alter table wiki_pages add column if not exists workspace_id uuid references workspaces(id) on delete set null`,
  `create index if not exists wiki_workspace_idx on wiki_pages(workspace_id)`,
];

async function main() {
  await db.execute(sql`select 1`);
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
  }
  console.log("RBAC schema migration complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
