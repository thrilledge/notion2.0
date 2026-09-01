import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { LOCAL_STORAGE_DIR } from "@/lib/storage";
import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { getAuthz, canViewProject } from "@/lib/authz";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".json": "application/json",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> }
) {
  const authz = await getAuthz();
  if (!authz) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { key } = await ctx.params;
  const rel = key.join("/");
  const full = path.resolve(LOCAL_STORAGE_DIR, rel);

  // Prevent path traversal
  if (!full.startsWith(LOCAL_STORAGE_DIR)) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const topFolder = key[0] ?? "";

  // Avatars are shown across the app to workspace members; any authenticated
  // user may request them.
  if (topFolder !== "avatars") {
    const [attachment] = await db
      .select({
        id: attachments.id,
        projectId: attachments.projectId,
        hostingClientId: attachments.hostingClientId,
        uploadedById: attachments.uploadedById,
      })
      .from(attachments)
      .where(and(eq(attachments.storageKey, rel), eq(attachments.storage, "local")))
      .limit(1);

    if (attachment) {
      // Scope by project access (or doc/meeting page belonging to an accessible
      // workspace). Project-linked attachments are the common case; if it links
      // to a project, gate by project access.
      if (attachment.projectId) {
        const ok = await canViewProject(authz, attachment.projectId);
        if (!ok) {
          return new NextResponse("Not found", { status: 404 });
        }
      } else if (
        attachment.uploadedById !== authz.userId &&
        !authz.isGlobalOwner
      ) {
        // Unlinked to any project: only the uploader (or owner) may fetch it.
        return new NextResponse("Not found", { status: 404 });
      }
    } else if (!authz.isGlobalOwner) {
      // No DB record — a loose file. Only the owner may fetch it.
      return new NextResponse("Not found", { status: 404 });
    }
  }

  const ext = path.extname(full).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const body = fs.readFileSync(full);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = new NextResponse(new Uint8Array(body) as any, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  return res;
}
