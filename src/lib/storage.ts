import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

export const LOCAL_STORAGE_DIR = path.resolve(
  process.env.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), "uploads")
);

export const LOCAL_STORAGE_PUBLIC_BASE =
  process.env.LOCAL_STORAGE_PUBLIC_BASE ?? "/uploads";

function ensureDir(relativeDir: string): string {
  const target = path.join(LOCAL_STORAGE_DIR, relativeDir);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
}

export interface StoredFile {
  key: string;
  publicUrl: string;
  size: number;
}

/**
 * Store a file buffer on the local filesystem.
 * `folder` is a logical grouping (e.g. "attachments", "avatars").
 */
export function storeLocalFile(
  folder: string,
  id: string,
  originalName: string,
  data: Buffer
): StoredFile {
  const cleanName = sanitize(originalName) || "file";
  const relativeDir = path.posix.join(folder, id);
  const dir = ensureDir(relativeDir);
  const filename = `${randomUUID().slice(0, 8)}-${cleanName}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, data);

  const key = path.posix.join(folder, id, filename).replace(/\\/g, "/");
  return {
    key,
    publicUrl: `${LOCAL_STORAGE_PUBLIC_BASE}/${key}`.replace(/\\/g, "/"),
    size: data.length,
  };
}

/** Copy an existing file on disk into local storage. */
export function storeLocalFileFromDisk(
  folder: string,
  id: string,
  originalName: string,
  sourcePath: string
): StoredFile | null {
  if (!fs.existsSync(sourcePath)) return null;
  const data = fs.readFileSync(sourcePath);
  return storeLocalFile(folder, id, originalName, data);
}

export function localFileAbsolutePath(key: string): string {
  return path.join(LOCAL_STORAGE_DIR, key);
}

export function publicUrlToAbsolutePath(publicUrl: string): string | null {
  const prefix = `${LOCAL_STORAGE_PUBLIC_BASE}/`.replace(/\\/g, "/");
  const rel = publicUrl.startsWith(prefix)
    ? publicUrl.slice(prefix.length)
    : publicUrl.startsWith("/uploads/")
    ? publicUrl.slice("/uploads/".length)
    : null;
  if (!rel) return null;
  return path.join(LOCAL_STORAGE_DIR, rel);
}
