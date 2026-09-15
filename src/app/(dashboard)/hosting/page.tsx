import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthz, getAccessibleFolders } from "@/lib/authz";
import { HostingClientList } from "@/components/projects/hosting-client-list";

export const metadata: Metadata = {
  title: "Hosting Clients",
};

export default async function HostingPage() {
  const authz = await getAuthz();
  if (!authz) redirect("/login");

  const folders = await getAccessibleFolders(authz);
  const hasAccess = folders.some((f) => f.kind === "hosting_client");
  if (!hasAccess) redirect("/");

  return <HostingClientList />;
}
