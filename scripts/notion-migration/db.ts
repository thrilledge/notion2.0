import path from "node:path";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "../../src/lib/db/schema";
import {
  parseAllPages,
  extractPeople,
  type ParsedPage,
} from "./parser";
import { convertBlock } from "./blocks";
import { storeLocalFileFromDisk } from "../../src/lib/storage";
import type {
  NewUser,
  NewProject,
  NewHostingClient,
  NewPage,
  NewPageBlock,
  NewAttachment,
  NewDoc,
  NewMeeting,
} from "../../src/lib/db/schema";

export type DB = PostgresJsDatabase<typeof schema>;
export type ProgressFn = (message: string) => void;

const CHUNK = 500;
const log = (msg: string) => process.stdout.write(`[migrate] ${msg}\n`);

interface Person {
  notionId: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

interface MigrationResult {
  users: number;
  projects: number;
  hostingClients: number;
  docs: number;
  meetings: number;
  wiki: number;
  pages: number;
  blocks: number;
  attachments: number;
  skippedFiles: number;
}

interface ForeignMap {
  notionUserIdToLocalId: Map<string, string>;
  notionPageIdToProjectId: Map<string, string>;
  notionPageIdToHostingId: Map<string, string>;
}

function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function getDb(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 2, idle_timeout: 20 });
  return drizzle(client, { schema });
}

function propertyText(page: ParsedPage, names: string[]): string | undefined {
  for (const name of names) {
    const prop = page.properties[name];
    if (!prop) continue;
    const rt =
      prop.type === "rich_text"
        ? prop.rich_text
        : prop.type === "title"
        ? prop.title
        : undefined;
    if (!rt) continue;
    const text = rt
      .map((t) => t.plain_text ?? t.text?.content ?? "")
      .join("")
      .trim();
    if (text) return text;
  }
  return undefined;
}

function propertyDate(page: ParsedPage, names: string[]): Date | null {
  for (const name of names) {
    const prop = page.properties[name];
    if (prop?.type === "date" && prop.date?.start) {
      const d = new Date(prop.date.start);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function propAssigneeId(
  page: ParsedPage,
  names: string[],
  map: ForeignMap
): string | null {
  for (const name of names) {
    const prop = page.properties[name];
    if (prop?.type === "people" && prop.people?.length) {
      return map.notionUserIdToLocalId.get(prop.people[0].id) ?? null;
    }
  }
  return null;
}

/**
 * Collect every person referenced anywhere in the export, including the
 * People database rows (which carry full name/email/avatar).
 */
export function collectPeople(pages: ParsedPage[]): Map<string, Person> {
  const map = new Map<string, Person>();
  const upsert = (p: Person) => {
    const existing = map.get(p.notionId);
    if (existing) {
      if (p.email && !existing.email) existing.email = p.email;
      if (p.name && !existing.name) existing.name = p.name;
      if (p.avatarUrl && !existing.avatarUrl) existing.avatarUrl = p.avatarUrl;
    } else {
      map.set(p.notionId, { ...p });
    }
  };
  for (const page of pages) {
    for (const p of extractPeople(page.properties)) {
      upsert({ notionId: p.id, email: p.email, name: p.name });
    }
  }
  return map;
}

/** Insert users in batches, mapping notion id -> local uuid. */
async function seedUsers(
  db: DB,
  people: Map<string, Person>
): Promise<{ map: ForeignMap; count: number }> {
  const map: ForeignMap = {
    notionUserIdToLocalId: new Map(),
    notionPageIdToProjectId: new Map(),
    notionPageIdToHostingId: new Map(),
  };

  // Existing users keyed by lowercased email.
  const existingRows = await db
    .select({ id: schema.users.id, email: schema.users.email, notionUserId: schema.users.notionUserId })
    .from(schema.users);
  const byEmail = new Map<string, string>();
  const byNotion = new Map<string, string>();
  for (const r of existingRows) {
    if (r.email) byEmail.set(r.email.toLowerCase(), r.id);
    if (r.notionUserId) byNotion.set(r.notionUserId, r.id);
  }

  const toInsert: NewUser[] = [];
  for (const person of people.values()) {
    if (byNotion.has(person.notionId)) {
      map.notionUserIdToLocalId.set(person.notionId, byNotion.get(person.notionId)!);
      continue;
    }
    const email = (person.email ?? "").trim().toLowerCase() || `notion-${person.notionId}@local`;
    if (byEmail.has(email)) {
      map.notionUserIdToLocalId.set(person.notionId, byEmail.get(email)!);
      continue;
    }
    toInsert.push({
      email,
      fullName: person.name ?? email.split("@")[0],
      avatarUrl: person.avatarUrl ?? undefined,
      role: "member",
      status: "active",
      notionUserId: person.notionId,
    });
  }

  let count = 0;
  for (const batch of chunks(toInsert)) {
    const ins = await db
      .insert(schema.users)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: schema.users.id, notionUserId: schema.users.notionUserId });
    for (const r of ins) map.notionUserIdToLocalId.set(r.notionUserId!, r.id);
    count += ins.length;
  }
  return { map, count };
}

function normalizeStatusValue(v: string | undefined): string | undefined {
  if (!v) return undefined;
  switch (v.toLowerCase().replace(/\s+/g, "_")) {
    case "in_progress":
    case "pending_for_review":
      return "in_progress";
    case "done":
    case "complete":
      return "done";
    case "archived":
      return "archived";
    default:
      return "not_started";
  }
}

function normalizeResultValue(v: string | undefined): string | undefined {
  if (!v) return undefined;
  switch (v.toLowerCase().replace(/\s+/g, "_")) {
    case "company_work":
      return "company_work";
    case "not_started":
      return "not_started";
    case "stuck":
      return "stuck";
    case "pending_for_review":
      return "pending_review";
    case "in_progress":
      return "in_progress";
    case "upcoming_renewal":
      return "upcoming_renewal";
    case "done":
      return "done";
    default:
      return undefined;
  }
}

async function insertProjects(
  db: DB,
  pages: ParsedPage[],
  map: ForeignMap
): Promise<number> {
  if (!pages.length) return 0;
  const existing = await db
    .select({ id: schema.projects.id, notionPageId: schema.projects.notionPageId })
    .from(schema.projects)
    .where(sql`${schema.projects.notionPageId} is not null`);
  const seen = new Set(existing.map((e) => e.notionPageId!));

  const toInsert: NewProject[] = [];
  for (const page of pages) {
    if (seen.has(page.notionPageId)) continue;
    const props = page.properties;
    toInsert.push({
      name: page.title,
      type: page.kind === "sideProject" ? "side_project" : "client",
      status:
        (normalizeStatusValue(props["Status"]?.status?.name) as NewProject["status"]) ??
        "not_started",
      result: normalizeResultValue(props["Result"]?.status?.name) as NewProject["result"],
      summary: propertyText(page, ["Summary", "Text"]),
      comments: propertyText(page, ["Comments", "COmments"]),
      dueDate: propertyDate(page, ["Due", "Due Date", "Date"]),
      assigneeId: propAssigneeId(page, ["Assignee"], map),
      notionPageId: page.notionPageId,
      createdAt: page.createdAt ? new Date(page.createdAt) : undefined,
      updatedAt: page.lastEditedAt ? new Date(page.lastEditedAt) : undefined,
    });
  }

  let count = 0;
  for (const batch of chunks(toInsert)) {
    const ins = await db
      .insert(schema.projects)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: schema.projects.id, notionPageId: schema.projects.notionPageId });
    for (const r of ins) map.notionPageIdToProjectId.set(r.notionPageId!, r.id);
    count += ins.length;
  }
  return count;
}

async function insertHostingClients(
  db: DB,
  pages: ParsedPage[],
  map: ForeignMap
): Promise<number> {
  if (!pages.length) return 0;
  const existing = await db
    .select({ id: schema.hostingClients.id, notionPageId: schema.hostingClients.notionPageId })
    .from(schema.hostingClients)
    .where(sql`${schema.hostingClients.notionPageId} is not null`);
  const seen = new Set(existing.map((e) => e.notionPageId!));

  const toInsert: NewHostingClient[] = [];
  for (const page of pages) {
    if (seen.has(page.notionPageId)) continue;
    const props = page.properties;
    toInsert.push({
      domain: page.title,
      clientName: propertyText(page, ["Client Name", "Client", "Current Hosting"]),
      status:
        (normalizeStatusValue(props["Status"]?.status?.name) as NewHostingClient["status"]) ??
        "not_started",
      result: normalizeResultValue(props["Result"]?.status?.name) as NewHostingClient["result"],
      summary: propertyText(page, ["Summary"]),
      comments: propertyText(page, ["Comments"]),
      text: propertyText(page, ["Text"]),
      dueDate: propertyDate(page, ["Due", "Date", "Due Date"]),
      assigneeId: propAssigneeId(page, ["Assignee"], map),
      notionPageId: page.notionPageId,
    });
  }

  let count = 0;
  for (const batch of chunks(toInsert)) {
    const ins = await db
      .insert(schema.hostingClients)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: schema.hostingClients.id, notionPageId: schema.hostingClients.notionPageId });
    for (const r of ins) map.notionPageIdToHostingId.set(r.notionPageId!, r.id);
    count += ins.length;
  }
  return count;
}

async function insertDocs(db: DB, pages: ParsedPage[]): Promise<number> {
  if (!pages.length) return 0;
  const existing = new Set(
    (await db.select({ title: schema.docs.title }).from(schema.docs)).map((d) => d.title)
  );
  const toInsert: NewDoc[] = [];
  for (const page of pages) {
    if (existing.has(page.title)) continue;
    toInsert.push({
      title: page.title,
      tags: page.properties["Tags"]?.multi_select?.map((m) => m.name) ?? [],
    });
  }
  let count = 0;
  for (const batch of chunks(toInsert)) {
    await db.insert(schema.docs).values(batch).onConflictDoNothing();
  }
  return (count = toInsert.length);
}

async function insertMeetings(
  db: DB,
  pages: ParsedPage[],
  map: ForeignMap
): Promise<number> {
  if (!pages.length) return 0;
  const existing = new Set(
    (await db.select({ name: schema.meetings.name }).from(schema.meetings)).map((m) => m.name)
  );
  const toInsert: NewMeeting[] = [];
  for (const page of pages) {
    if (existing.has(page.title)) continue;
    const rawType = page.properties["Type"]?.select?.name
      ?.toLowerCase()
      .replace(/\s+/g, "_");
    toInsert.push({
      name: page.title,
      type: (["standup", "brainstorm", "team_weekly", "training"].includes(rawType!)
        ? rawType!
        : "team_weekly") as NewMeeting["type"],
      eventTime: propertyDate(page, ["Event time", "Date"]),
    });
  }
  let count = 0;
  const insertedIds: string[] = [];
  for (const batch of chunks(toInsert)) {
    const ins = await db
      .insert(schema.meetings)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: schema.meetings.id });
    insertedIds.push(...ins.map((i) => i.id));
    count += ins.length;
  }
  // attendees are resolved by name after insert
  await insertMeetingAttendeesByPage(db, pages, map);
  return count;
}

async function insertMeetingAttendeesByPage(
  db: DB,
  pages: ParsedPage[],
  map: ForeignMap
): Promise<void> {
  // Resolve meeting id by name
  const meetingsByName = new Map(
    (await db.select({ id: schema.meetings.id, name: schema.meetings.name }).from(schema.meetings))
      .map((m) => [m.name, m.id] as [string, string])
  );
  const toInsert: { meetingId: string; userId: string }[] = [];
  for (const page of pages) {
    const mid = meetingsByName.get(page.title);
    if (!mid) continue;
    for (const att of page.properties["Attendees"]?.people ?? []) {
      const uid = map.notionUserIdToLocalId.get(att.id);
      if (uid) toInsert.push({ meetingId: mid, userId: uid });
    }
  }
  for (const batch of chunks(toInsert)) {
    await db.insert(schema.meetingAttendees).values(batch).onConflictDoNothing();
  }
}

async function insertPagesAndBlocks(
  db: DB,
  pages: ParsedPage[],
  map: ForeignMap
): Promise<{ pages: number; blocks: number; attachments: number; skipped: number }> {
  if (!pages.length) return { pages: 0, blocks: 0, attachments: 0, skipped: 0 };

  const existing = await db
    .select({ id: schema.pages.id, notionPageId: schema.pages.notionPageId })
    .from(schema.pages)
    .where(sql`${schema.pages.notionPageId} is not null`);
  const seen = new Set(existing.map((e) => e.notionPageId!));

  // Preload existing project + hosting maps from the DB so pages can be
  // re-linked even if the in-memory map wasn't populated on a prior run.
  const existingProjects = await db
    .select({
      id: schema.projects.id,
      notionPageId: schema.projects.notionPageId,
    })
    .from(schema.projects)
    .where(sql`${schema.projects.notionPageId} is not null`);
  for (const p of existingProjects) {
    if (p.notionPageId) map.notionPageIdToProjectId.set(p.notionPageId, p.id);
  }
  const existingHosting = await db
    .select({
      id: schema.hostingClients.id,
      notionPageId: schema.hostingClients.notionPageId,
    })
    .from(schema.hostingClients)
    .where(sql`${schema.hostingClients.notionPageId} is not null`);
  for (const h of existingHosting) {
    if (h.notionPageId) map.notionPageIdToHostingId.set(h.notionPageId, h.id);
  }

  type PendingPage = { page: ParsedPage; parentType: NewPage["parentType"]; parentId?: string };
  const pending: PendingPage[] = [];

  for (const page of pages) {
    if (seen.has(page.notionPageId)) continue;
    let parentType: NewPage["parentType"] = "standalone";
    let parentId: string | undefined;
    if (page.kind === "project" || page.kind === "sideProject") {
      parentType = "project";
      parentId = map.notionPageIdToProjectId.get(page.notionPageId);
    } else if (page.kind === "hostingClient") {
      parentType = "hosting_client";
      parentId = map.notionPageIdToHostingId.get(page.notionPageId);
    } else if (page.kind === "doc") {
      parentType = "doc";
    } else if (page.kind === "meeting") {
      parentType = "meeting";
    } else if (page.kind === "wiki") {
      parentType = "wiki";
    }
    pending.push({ page, parentType, parentId });
  }

  // Batch insert pages, capture id + notion id
  const pageRows: NewPage[] = pending.map((p) => ({
    title: p.page.title,
    parentType: p.parentType,
    parentId: p.parentId,
    iconEmoji: p.page.iconEmoji ?? undefined,
    iconUrl: p.page.iconUrl ?? undefined,
    coverUrl: p.page.coverUrl ?? undefined,
    notionPageId: p.page.notionPageId,
    createdAt: p.page.createdAt ? new Date(p.page.createdAt) : undefined,
    updatedAt: p.page.lastEditedAt ? new Date(p.page.lastEditedAt) : undefined,
  }));

  let pagesCount = 0;
  let blocksCount = 0;
  let attachmentsCount = 0;
  let skipped = 0;
  const pageIdByNotion = new Map<string, string>();

  for (const batch of chunks(pageRows)) {
    const ins = await db
      .insert(schema.pages)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: schema.pages.id, notionPageId: schema.pages.notionPageId });
    for (const r of ins) pageIdByNotion.set(r.notionPageId!, r.id);
    pagesCount += ins.length;
  }

  // Build all page blocks in memory, then batch insert.
  const allBlocks: NewPageBlock[] = [];
  for (const p of pending) {
    const localPageId = pageIdByNotion.get(p.page.notionPageId);
    if (!localPageId) continue;
    let pos = 0;
    for (const block of p.page.blocks) {
      const converted = convertBlock(block);
      if (!converted) continue;
      allBlocks.push({
        pageId: localPageId,
        blockId: converted.blockId,
        type: converted.type,
        content: converted.content,
        position: pos++,
      });
    }
  }
  for (const batch of chunks(allBlocks)) {
    await db.insert(schema.pageBlocks).values(batch).onConflictDoNothing();
  }
  blocksCount = allBlocks.length;

  // Files -> local storage + attachments
  const allAttachments: NewAttachment[] = [];
  for (const p of pending) {
    const localPageId = pageIdByNotion.get(p.page.notionPageId);
    if (!localPageId) continue;
    let pos = 0;
    for (const f of p.page.files) {
      const stored = storeLocalFileFromDisk(
        "attachments",
        localPageId,
        f.originalName,
        f.localPath
      );
      if (!stored) {
        skipped++;
        continue;
      }
      allAttachments.push({
        pageId: localPageId,
        projectId: p.parentType === "project" ? p.parentId : undefined,
        hostingClientId: p.parentType === "hosting_client" ? p.parentId : undefined,
        storage: "local",
        storageKey: stored.key,
        publicUrl: stored.publicUrl,
        originalName: f.originalName,
        size: stored.size,
        propertyName: f.propertyName,
        position: pos++,
      });
    }
  }
  for (const batch of chunks(allAttachments)) {
    await db.insert(schema.attachments).values(batch).onConflictDoNothing();
  }
  attachmentsCount = allAttachments.length;

  return { pages: pagesCount, blocks: blocksCount, attachments: attachmentsCount, skipped };
}

export async function migrate(opts: {
  dryRun?: boolean;
  onProgress?: ProgressFn;
}): Promise<MigrationResult> {
  const { dryRun = false, onProgress = log } = opts;
  onProgress("Parsing Notion export...");
  const pages = parseAllPages();
  onProgress(`Parsed ${pages.length} pages`);

  const projects = pages.filter((p) => p.kind === "project");
  const sideProjects = pages.filter((p) => p.kind === "sideProject");
  const hosting = pages.filter((p) => p.kind === "hostingClient");
  const docs = pages.filter((p) => p.kind === "doc");
  const meetings = pages.filter((p) => p.kind === "meeting");
  const wiki = pages.filter((p) => p.kind === "wiki");
  const parented = projects.concat(sideProjects, hosting);

  const people = collectPeople(pages);
  const totalBlocks = parented.reduce((n, p) => n + p.blocks.length, 0);
  const totalFiles = parented.reduce((n, p) => n + p.files.length, 0);

  if (dryRun) {
    onProgress(
      `[dry-run] projects=${projects.length} side_projects=${sideProjects.length} hosting=${hosting.length} ` +
        `docs=${docs.length} meetings=${meetings.length} wiki=${wiki.length} people=${people.size} blocks=${totalBlocks} attachments=${totalFiles}`
    );
    return {
      users: people.size,
      projects: projects.length + sideProjects.length,
      hostingClients: hosting.length,
      docs: docs.length,
      meetings: meetings.length,
      wiki: wiki.length,
      pages: parented.length,
      blocks: totalBlocks,
      attachments: totalFiles,
      skippedFiles: 0,
    };
  }

  const db = getDb();
  onProgress("Seeding users...");
  const seeded = await seedUsers(db, people);
  const map = seeded.map;

  onProgress("Inserting projects...");
  const projectCount = await insertProjects(db, projects, map);
  const sideCount = await insertProjects(db, sideProjects, map);

  onProgress("Inserting hosting clients...");
  const hostingCount = await insertHostingClients(db, hosting, map);

  onProgress("Inserting docs...");
  const docsCount = await insertDocs(db, docs);

  onProgress("Inserting meetings...");
  const meetingsCount = await insertMeetings(db, meetings, map);

  onProgress("Inserting wiki pages...");
  const wikiCount = 0; // wiki DB is empty

  onProgress("Inserting pages, blocks and attachments...");
  const pb = await insertPagesAndBlocks(db, parented, map);

  onProgress("Migration complete");
  return {
    users: seeded.count,
    projects: projectCount + sideCount,
    hostingClients: hostingCount,
    docs: docsCount,
    meetings: meetingsCount,
    wiki: wikiCount,
    pages: pb.pages,
    blocks: pb.blocks,
    attachments: pb.attachments,
    skippedFiles: pb.skipped,
  };
}
