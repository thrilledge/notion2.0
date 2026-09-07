import { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { hostingClients } from "@/lib/db/schema";
import { getAuthz, canViewWorkspaceContent } from "@/lib/authz";
import { HostingClientDetail } from "@/components/hosting/hosting-client-detail";

export const metadata: Metadata = {
  title: "Hosting Client",
};

export default async function HostingClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const authz = await getAuthz();
  if (!authz) return null;

  const [client] = await db
    .select()
    .from(hostingClients)
    .where(eq(hostingClients.id, id))
    .limit(1);

  if (!client) notFound();

  if (
    !client.workspaceId ||
    !canViewWorkspaceContent(authz, client.workspaceId)
  ) {
    notFound();
  }

  return <HostingClientDetail client={client} />;
}
