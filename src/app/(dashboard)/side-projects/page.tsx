import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthz, getAccessibleFolders } from "@/lib/authz";
import { ProjectsClient } from "@/components/projects/projects-client";

export const metadata: Metadata = {
  title: "Side Projects",
};

export default async function SideProjectsPage() {
  const authz = await getAuthz();
  if (!authz) redirect("/login");

  const folders = await getAccessibleFolders(authz);
  const hasAccess = folders.some((f) => f.code === "side_projects");
  if (!hasAccess) redirect("/");

  return <ProjectsClient type="side_project" />;
}