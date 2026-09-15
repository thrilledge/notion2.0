import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { getAuthz, getAccessibleFolderIds } from "@/lib/authz";
import { FolderDetail } from "@/components/projects/folder-detail";

export const metadata: Metadata = {
  title: "Folder",
};

export default async function FolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const authz = await getAuthz();
  if (!authz) notFound();

  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, id))
    .limit(1);

  if (!folder) notFound();

  // System folders have their own routes; only custom folders are reachable
  // as dedicated pages, and only for users with a grant.
  if (folder.code) notFound();

  const accessibleIds = await getAccessibleFolderIds(authz, folder.workspaceId ?? undefined);
  if (!accessibleIds.includes(folder.id)) notFound();

  return <FolderDetail folder={folder} />;
}