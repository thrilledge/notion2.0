import path from "node:path";
import fs from "node:fs";
import type {
  NotionPage,
  NotionBlock,
  NotionRichText,
  NotionProperties,
} from "./types";

export const EXPORT_DIR = path.resolve(
  process.cwd(),
  "notion_export"
);

const DATABASE_IDS = {
  currentWorking: "15a5ea75-f9b2-807b-87d6-e2194a511713",
  hostingClient: "15a5ea75-f9b2-802e-8198-e2face6f015e",
  othersSideProject: "15a5ea75-f9b2-807c-9405-dfb78fb902ec",
  people: "d3d5ea75-f9b2-82df-b0d8-014512d331ec",
  docs: "15a5ea75-f9b2-800d-be4d-dcd774ae3238",
  meetings: "15a5ea75-f9b2-80e4-9035-c417637656c0",
  wiki: "15a5ea75-f9b2-8016-ac6a-c5519611f0ca",
} as const;

export type PageKind =
  | "project"
  | "hostingClient"
  | "sideProject"
  | "doc"
  | "meeting"
  | "wiki";

export function kindFromDatabaseId(databaseId: string): PageKind | null {
  switch (databaseId) {
    case DATABASE_IDS.currentWorking:
      return "project";
    case DATABASE_IDS.hostingClient:
      return "hostingClient";
    case DATABASE_IDS.othersSideProject:
      return "sideProject";
    case DATABASE_IDS.docs:
      return "doc";
    case DATABASE_IDS.meetings:
      return "meeting";
    case DATABASE_IDS.wiki:
      return "wiki";
    default:
      return null;
  }
}

export interface ParsedPage {
  id: string;
  title: string;
  kind: PageKind;
  notionPageId: string;
  createdAt?: string | null;
  lastEditedAt?: string | null;
  url?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
  coverUrl?: string | null;
  properties: NotionProperties;
  blocks: NotionBlock[];
  files: ParsedFileEntry[];
}

export interface ParsedFileEntry {
  /** database column name that holds the file, e.g. "Files & media 2" */
  propertyName: string;
  /** original name from Notion */
  originalName: string;
  /** absolute path to downloaded file on disk */
  localPath: string;
  ext: string;
}

function richTextToPlain(rt: NotionRichText[] | undefined | null): string {
  if (!rt) return "";
  return rt
    .map((t) => t.plain_text ?? t.text?.content ?? "")
    .join("");
}

function pick(rt: NotionRichText[] | undefined | null, manual?: string): string {
  const val = richTextToPlain(rt).trim();
  if (val) return val;
  if (manual) return manual;
  return "";
}

/** Normalize a Notion status/select option name into our DB enum slug. */
export function normalizeResult(name: string | undefined | null): string | null {
  if (!name) return null;
  const lower = name.trim().toLowerCase().replace(/\s+/g, "_");
  switch (lower) {
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
      return null;
  }
}

export function normalizeStatus(name: string | undefined | null): string {
  const lower = (name || "not started").trim().toLowerCase().replace(/\s+/g, "_");
  switch (lower) {
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

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/** Extract all person objects referenced by people-type properties. */
export function extractPeople(properties: NotionProperties): {
  id: string;
  email?: string | null;
  name?: string | null;
}[] {
  const seen = new Map<string, { id: string; email?: string | null; name?: string | null }>();
  for (const prop of Object.values(properties)) {
    if (prop.type !== "people" || !prop.people) continue;
    for (const person of prop.people) {
      if (!seen.has(person.id)) {
        seen.set(person.id, {
          id: person.id,
          email: person.email ?? null,
          name: person.name ?? null,
        });
      } else {
        const existing = seen.get(person.id)!;
        if (person.email && !existing.email) existing.email = person.email;
        if (person.name && !existing.name) existing.name = person.name;
      }
    }
  }
  return Array.from(seen.values());
}

/**
 * Parse every page from the export's pages/ directory.
 * Pages that are standalone (no DB parent) are kind null and skipped for
 * DB-row creation but still returned so callers can decide.
 */
export function parseAllPages(): ParsedPage[] {
  const pagesDir = path.join(EXPORT_DIR, "pages");
  const result: ParsedPage[] = [];

  const dirs = fs.readdirSync(pagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dir of dirs) {
    const pageJsonPath = path.join(pagesDir, dir, "page.json");
    if (!fs.existsSync(pageJsonPath)) continue;

    const page = readJson<NotionPage>(pageJsonPath);
    const dbId = page.parent?.database_id;
    const kind = dbId ? kindFromDatabaseId(dbId) : null;
    if (!kind) continue;

    const properties = page.properties ?? {};

    // Collect downloaded files, flattened across files-properties in
    // Notion's serialization order, matching property__files-property_N.
    const files: ParsedFileEntry[] = [];
    const filesDir = path.join(pagesDir, dir, "files");
    const filesPropertyNames = Object.keys(properties).filter(
      (k) => properties[k].type === "files" && (properties[k].files?.length ?? 0) > 0
    );
    let flatIndex = 0;
    for (const propName of filesPropertyNames) {
      const farr = properties[propName]?.files ?? [];
      for (const f of farr) {
        const localPath = path.join(filesDir, `property__files-property_${flatIndex}`);
        if (!fs.existsSync(localPath)) {
          flatIndex++;
          continue;
        }
        files.push({
          propertyName: propName,
          originalName: f.name ?? `file-${flatIndex}`,
          localPath,
          ext: path.extname(f.name ?? ""),
        });
        flatIndex++;
      }
    }
    // Fallback: if no files property matched but files dir has entries
    if (files.length === 0 && fs.existsSync(filesDir)) {
      const onDisk = fs.readdirSync(filesDir, { withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => d.name)
        .sort();
      for (const fname of onDisk) {
        const localPath = path.join(filesDir, fname);
        files.push({
          propertyName: "Files & media",
          originalName: fname,
          localPath,
          ext: path.extname(fname),
        });
      }
    }

    let iconEmoji: string | null = null;
    let iconUrl: string | null = null;
    if (page.icon) {
      if (page.icon.emoji) iconEmoji = page.icon.emoji;
      if (page.icon.external?.url) iconUrl = page.icon.external.url;
      else if (page.icon.file?.url) iconUrl = page.icon.file.url;
    }

    result.push({
      id: page.id,
      title: page.title ?? richTextToPlain(properties["title"]?.title) ?? "(untitled)",
      kind,
      notionPageId: page.id,
      createdAt: page.created_time ?? null,
      lastEditedAt: page.last_edited_time ?? null,
      url: page.url ?? null,
      iconEmoji,
      iconUrl,
      coverUrl: page.cover?.external?.url ?? page.cover?.file?.url ?? null,
      properties,
      blocks: page.blocks ?? [],
      files,
    });
  }

  return result;
}

export function titleFromPage(page: ParsedPage): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  if (titleProp?.title) {
    const t = richTextToPlain(titleProp.title).trim();
    if (t) return t;
  }
  return page.title || "(untitled)";
}
