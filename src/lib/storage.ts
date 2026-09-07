import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { MAX_UPLOAD_BYTES } from "@/lib/security";

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
  if (data.length > MAX_UPLOAD_BYTES) {
    throw new Error("File exceeds the maximum allowed size");
  }
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

/** Delete a previously stored local file. Missing files are a no-op. */
export function deleteLocalFile(key: string): void {
  const full = path.resolve(LOCAL_STORAGE_DIR, key);
  if (path.relative(LOCAL_STORAGE_DIR, full).startsWith("..")) return;
  try {
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      fs.unlinkSync(full);
    }
  } catch {
    // Best effort: an orphan file is harmless compared to a failed delete.
  }
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
