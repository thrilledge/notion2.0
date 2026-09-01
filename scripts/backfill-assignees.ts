/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Backfill assignees + sort_order for existing projects from the Notion export.
 *
 * 1. Adds `sort_order` column to projects if missing.
 * 2. Seeds any users not yet in DB (by email, else by notion user id).
 * 3. Populates `project_assignees` for EVERY person in each project's Notion
 *    "Assignee" property (multi-assignee), and sets assigneeId = first person
 *    when it is currently null.
 * 4. Initializes sort_order for projects (by updated_at desc) if unset.
 *
 * Build people map from BOTH the people-type properties on project pages AND
 * the People database pages (which carry full name/email/avatar).
 *
 * Usage: (set DATABASE_URL in shell first)
 *   npx tsx scripts/backfill-assignees.ts
 */
import path from "node:path";
import fs from "node:fs";
import { sql, desc } from "drizzle-orm";
import { db, schema } from "../src/lib/db";

const EXPORT_DIR = path.resolve(process.cwd(), "notion_export");
const PAGES_DIR = path.join(EXPORT_DIR, "pages");

const PEOPLE_DB = "d3d5ea75-f9b2-82df-b0d8-014512d331ec";
const PROJECT_DB = "15a5ea75-f9b2-807b-87d6-e2194a511713";
const SIDE_PROJECT_DB = "15a5ea75-f9b2-807c-9405-dfb78fb902ec";

type PersonInfo = {
  notionPersonId: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

function chunks<T>(arr: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function runLimited<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<unknown>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function collectPropertyPeople(props: Record<string, any>): PersonInfo[] {
  const out: PersonInfo[] = [];
  const seen = new Set<string>();
  for (const prop of Object.values(props)) {
    if (prop?.type !== "people" || !Array.isArray(prop.people)) continue;
    for (const person of prop.people) {
      if (!person?.id || seen.has(person.id)) continue;
      seen.add(person.id);
      out.push({
        notionPersonId: person.id,
        email: person.person?.email ?? null,
        name: person.name ?? null,
        avatarUrl: person.avatar_url ?? null,
      });
    }
  }
  return out;
}

async function main() {
  console.log("Connecting to DB...");
  await db.execute(sql`select 1`);

  // 1. Add sort_order column if missing
  try {
    await db.execute(sql`alter table projects add column if not exists sort_order double precision not null default 0`);
    console.log("sort_order column ensured.");
  } catch (e) {
    console.error("Could not add sort_order:", e);
  }

  // Build people info from all pages.
  const pagesDir = fs.readdirSync(PAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const peopleById = new Map<string, PersonInfo>();
  const upsertPerson = (p: PersonInfo) => {
    const existing = peopleById.get(p.notionPersonId);
    if (existing) {
      if (p.email && !existing.email) existing.email = p.email;
      if (p.name && !existing.name) existing.name = p.name;
      if (p.avatarUrl && !existing.avatarUrl) existing.avatarUrl = p.avatarUrl;
    } else {
      peopleById.set(p.notionPersonId, { ...p });
    }
  };

  // 2. Scan every exported page: collect people props (assignee, attendees...)
  // and note which project pages exist (by notion page id -> Assignee people).
  const projectPages = new Map<string, PersonInfo[]>(); // notionPageId -> assignees
  for (const dir of pagesDir) {
    const pageJsonPath = path.join(PAGES_DIR, dir, "page.json");
    if (!fs.existsSync(pageJsonPath)) continue;
    const page = readJson<any>(pageJsonPath);
    const dbId = page.parent?.database_id;
    const props = page.properties ?? {};

    for (const p of collectPropertyPeople(props)) upsertPerson(p);

    if (dbId === PEOPLE_DB) {
      // People DB row: page title = person name; every embedded person belongs
      // to the same real user as assignee refs. Map the NAME to person ids.
      const title = (page.title ?? "").trim() || props.Name?.title?.[0]?.plain_text || "";
      const embedded = collectPropertyPeople(props);
      for (const emb of embedded) {
        if (emb.name && !peopleById.get(emb.notionPersonId)?.name) {
          upsertPerson({ ...emb, name: emb.name || title || undefined });
        }
      }
      continue;
    }

    if (dbId === PROJECT_DB || dbId === SIDE_PROJECT_DB) {
      const assignees = collectPropertyPeople(props).filter((p) =>
        props.Assignee?.people?.some((a: any) => a.id === p.notionPersonId)
      );
      if (assignees.length === 0) {
        const asg = props.Assignee ? collectPropertyPeople({ Assignee: props.Assignee }) : [];
        projectPages.set(page.id, asg);
      } else {
        projectPages.set(page.id, assignees);
      }
    }
  }
  console.log(`Scanned pages; found ${peopleById.size} distinct people, ${projectPages.size} project pages.`);

  // 3. Seed missing users. Match by notion_user_id first, then email.
  const existingUsers = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      notionUserId: schema.users.notionUserId,
    })
    .from(schema.users);
  const byEmail = new Map<string, string>();
  const byNotion = new Map<string, string>();
  for (const u of existingUsers) {
    if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    if (u.notionUserId) byNotion.set(u.notionUserId, u.id);
  }

  const localIdByPerson = new Map<string, string>();
  const toInsert: any[] = [];
  for (const p of peopleById.values()) {
    if (byNotion.has(p.notionPersonId)) {
      localIdByPerson.set(p.notionPersonId, byNotion.get(p.notionPersonId)!);
      continue;
    }
    const email = (p.email ?? "").trim().toLowerCase();
    if (email && byEmail.has(email)) {
      localIdByPerson.set(p.notionPersonId, byEmail.get(email)!);
      continue;
    }
    const finalEmail = email || `notion-${p.notionPersonId}@local`;
    toInsert.push({
      email: finalEmail,
      fullName: p.name ?? email.split("@")[0] ?? p.notionPersonId,
      avatarUrl: p.avatarUrl ?? undefined,
      role: "member",
      status: "active",
      notionUserId: p.notionPersonId,
    });
  }

  let seeded = 0;
  if (toInsert.length) {
    const ins = await db
      .insert(schema.users)
      .values(toInsert)
      .onConflictDoNothing()
      .returning({ id: schema.users.id, notionUserId: schema.users.notionUserId });
    for (const r of ins) {
      localIdByPerson.set(r.notionUserId!, r.id);
      seeded++;
    }
  }
  console.log(`Seeded ${seeded} new users (${toInsert.length} attempted).`);

  // After inserts, also map person ids that resolved by notion id (already done).

  // 4. For each project page, populate project_assignees + set assigneeId.
  const projects = await db
    .select({
      id: schema.projects.id,
      notionPageId: schema.projects.notionPageId,
      assigneeId: schema.projects.assigneeId,
    })
    .from(schema.projects)
    .where(sql`${schema.projects.notionPageId} is not null`);

  const lastEdited = new Map<string, string>(); // page id -> last edited
  for (const dir of pagesDir) {
    const pageJsonPath = path.join(PAGES_DIR, dir, "page.json");
    if (!fs.existsSync(pageJsonPath)) continue;
    const page = readJson<any>(pageJsonPath);
    lastEdited.set(page.id, page.last_edited_time ?? "");
  }

  let assignedProjects = 0;
  const assignRows: { projectId: string; userId: string }[] = [];
  const nullAssigneeUpdates: { projectId: string; userId: string }[] = [];
  for (const pr of projects) {
    const assignees = projectPages.get(pr.notionPageId!) ?? [];
    const ids = assignees
      .map((a) => localIdByPerson.get(a.notionPersonId))
      .filter((x): x is string => !!x);
    if (ids.length === 0) continue;
    const dedup = Array.from(new Set(ids));
    for (const userId of dedup) {
      assignRows.push({ projectId: pr.id, userId });
    }
    if (!pr.assigneeId) nullAssigneeUpdates.push({ projectId: pr.id, userId: dedup[0] });
    assignedProjects++;
  }
  for (const batch of chunks(assignRows)) {
    await db.insert(schema.projectAssignees).values(batch).onConflictDoNothing();
  }
  await runLimited(nullAssigneeUpdates, 10, async (u) => {
    await db
      .update(schema.projects)
      .set({ assigneeId: u.userId })
      .where(sql`${schema.projects.id} = ${u.projectId}`)
      .execute();
  });
  console.log(`Assigned ${assignRows.length} assignee-rows across ${assignedProjects} projects.`);

  // 5. Initialize sort_order for projects with default 0 (by updated_at desc).
  const toSort = await db
    .select({ id: schema.projects.id, updatedAt: schema.projects.updatedAt })
    .from(schema.projects)
    .where(sql`${schema.projects.sortOrder} = 0`)
    .orderBy(desc(schema.projects.updatedAt));
  const sortUpdates = toSort.map((pr, i) => ({
    id: pr.id,
    sortOrder: 1000 - i,
  }));
  await runLimited(sortUpdates, 10, async (u) => {
    await db
      .update(schema.projects)
      .set({ sortOrder: u.sortOrder })
      .where(sql`${schema.projects.id} = ${u.id}`)
      .execute();
  });
  console.log(`Initialized sort_order for ${sortUpdates.length} projects.`);

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
