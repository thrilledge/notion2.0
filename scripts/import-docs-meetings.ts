/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Import Docs + Meetings page content from the Notion export.
 *
 * The main migration only created empty `docs` / `meetings` rows (title, tags,
 * type) but never created linked `pages` rows or their blocks. This script:
 *
 * 1. Parses every exported page, keeping only `doc` and `meeting` kinds.
 * 2. Loads existing `docs`/`meetings` rows by title to use as the parent.
 * 3. Creates a `pages` row (parent_type = 'doc' | 'meeting', parentId = the
 *    matched docs/meetings row, notion_page_id = source page id) for any that
 *    do not already exist.
 * 4. Imports each page's blocks into `page_blocks` (via the shared convertBlock).
 * 5. Sets `docs.pageId` / `meetings.pageId` to link content back to the entity.
 * 6. Populates `meeting_attendees` for meeting pages from their Attendees
 *    people property (matched to users by notion_user_id).
 *
 * Idempotent: skips pages already linked by notion_page_id.
 *
 * Usage: (set DATABASE_URL in shell first)
 *   npx tsx scripts/import-docs-meetings.ts
 */
import { sql } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { parseAllPages, type ParsedPage } from "./notion-migration/parser";
import { convertBlock } from "./notion-migration/blocks";

const DOC_DB = "15a5ea75-f9b2-800d-be4d-dcd774ae3238";
const MEETING_DB = "15a5ea75-f9b2-80e4-9035-c417637656c0";

function chunks<T>(arr: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log("Connecting to DB...");
  await db.execute(sql`select 1`);

  const pages = parseAllPages();
  const docs = pages.filter((p) => p.kind === "doc");
  const meetings = pages.filter((p) => p.kind === "meeting");
  console.log(`Parsed ${pages.length} pages; ${docs.length} docs, ${meetings.length} meetings.`);

  // Gather people for meeting attendees.
  const peopleByPage = new Map<string, { id: string; email?: string | null; name?: string | null }[]>();
  for (const p of [...docs, ...meetings]) {
    const attendees = (p.properties["Attendees"] ?? p.properties["Attendee"])
      ?.people ?? [];
    peopleByPage.set(p.notionPageId, attendees.map((a: any) => ({
      id: a.id,
      email: a.person?.email ?? null,
      name: a.name ?? null,
    })));
  }

  // Map notion user id -> local user id.
  const users = await db
    .select({ id: schema.users.id, notionUserId: schema.users.notionUserId })
    .from(schema.users);
  const userByNotion = new Map<string, string>();
  for (const u of users) if (u.notionUserId) userByNotion.set(u.notionUserId, u.id);

  // Existing pages by notion id to avoid re-importing.
  const existingPages = await db
    .select({ id: schema.pages.id, notionPageId: schema.pages.notionPageId })
    .from(schema.pages)
    .where(sql`${schema.pages.notionPageId} is not null`);
  const seenPages = new Set(existingPages.map((p) => p.notionPageId!));

  // docs/meetings rows by title -> id.
  const docRows = await db
    .select({ id: schema.docs.id, title: schema.docs.title, pageId: schema.docs.pageId })
    .from(schema.docs);
  const docByTitle = new Map<string, { id: string; pageId: string | null }>();
  for (const d of docRows) docByTitle.set(d.title.trim(), d);

  const meetingRows = await db
    .select({ id: schema.meetings.id, name: schema.meetings.name, pageId: schema.meetings.pageId })
    .from(schema.meetings);
  const meetingByTitle = new Map<string, { id: string; pageId: string | null }>();
  for (const m of meetingRows) meetingByTitle.set(m.name.trim(), m);

  // Build pending page inserts for docs.
  type Pending = { page: ParsedPage; parentType: "doc" | "meeting"; parentId: string };
  const pending: Pending[] = [];
  for (const page of docs) {
    if (seenPages.has(page.notionPageId)) continue;
    const parent = docByTitle.get(page.title.trim());
    if (!parent) {
      console.log(`  skip doc (no matching docs row): ${page.title}`);
      continue;
    }
    pending.push({ page, parentType: "doc", parentId: parent.id });
  }
  for (const page of meetings) {
    if (seenPages.has(page.notionPageId)) continue;
    const parent = meetingByTitle.get(page.title.trim());
    if (!parent) {
      console.log(`  skip meeting (no matching meetings row): ${page.title}`);
      continue;
    }
    pending.push({ page, parentType: "meeting", parentId: parent.id });
  }
  console.log(`Will import ${pending.length} pages.`);

  // Insert pages.
  const newPageIdByNotion = new Map<string, string>();
  for (const batch of chunks(pending.map((p) => ({
    title: p.page.title,
    parentType: p.parentType,
    parentId: p.parentId,
    iconEmoji: p.page.iconEmoji ?? undefined,
    iconUrl: p.page.iconUrl ?? undefined,
    coverUrl: p.page.coverUrl ?? undefined,
    notionPageId: p.page.notionPageId,
    createdAt: p.page.createdAt ? new Date(p.page.createdAt) : undefined,
    updatedAt: p.page.lastEditedAt ? new Date(p.page.lastEditedAt) : undefined,
  })))) {
    const ins = await db
      .insert(schema.pages)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: schema.pages.id, notionPageId: schema.pages.notionPageId });
    for (const r of ins) newPageIdByNotion.set(r.notionPageId!, r.id);
  }
  console.log(`Inserted ${newPageIdByNotion.size} pages.`);

  // Insert blocks.
  const allBlocks: schema.NewPageBlock[] = [];
  for (const p of pending) {
    const pageId = newPageIdByNotion.get(p.page.notionPageId);
    if (!pageId) continue;
    let pos = 0;
    for (const block of p.page.blocks) {
      const converted = convertBlock(block as any);
      if (!converted) continue;
      allBlocks.push({
        pageId,
        blockId: converted.blockId,
        type: converted.type,
        content: converted.content as any,
        position: pos++,
      });
    }
  }
  for (const batch of chunks(allBlocks)) {
    await db.insert(schema.pageBlocks).values(batch).onConflictDoNothing();
  }
  console.log(`Inserted ${allBlocks.length} blocks.`);

  // Link docs.pageId / meetings.pageId.
  const docLinkUpdates: { id: string; pageId: string }[] = [];
  const meetingLinkUpdates: { id: string; pageId: string }[] = [];
  for (const p of pending) {
    const pageId = newPageIdByNotion.get(p.page.notionPageId);
    if (!pageId) continue;
    if (p.parentType === "doc") {
      docLinkUpdates.push({ id: p.parentId, pageId });
    } else {
      meetingLinkUpdates.push({ id: p.parentId, pageId });
    }
  }
  for (const u of docLinkUpdates) {
    await db.update(schema.docs).set({ pageId: u.pageId }).where(sql`${schema.docs.id} = ${u.id}`).execute();
  }
  for (const u of meetingLinkUpdates) {
    await db.update(schema.meetings).set({ pageId: u.pageId }).where(sql`${schema.meetings.id} = ${u.id}`).execute();
  }
  console.log(`Linked ${docLinkUpdates.length} docs, ${meetingLinkUpdates.length} meetings to pages.`);

  // Meeting attendees.
  const attRows: { meetingId: string; userId: string }[] = [];
  for (const page of meetings) {
    const parent = meetingByTitle.get(page.title.trim());
    if (!parent) continue;
    const pageId = newPageIdByNotion.get(page.notionPageId) ?? existingPages.find((p) => p.notionPageId === page.notionPageId)?.id;
    if (!pageId) continue;
    const people = peopleByPage.get(page.notionPageId) ?? [];
    const seen = new Set<string>();
    for (const person of people) {
      const uid = userByNotion.get(person.id);
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      attRows.push({ meetingId: parent.id, userId: uid });
    }
  }
  let attInserted = 0;
  for (const batch of chunks(attRows)) {
    await db.insert(schema.meetingAttendees).values(batch).onConflictDoNothing();
    attInserted += batch.length;
  }
  console.log(`Inserted ${attInserted} meeting attendees.`);

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
