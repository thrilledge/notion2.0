import type { Metadata } from "next";
import { ProjectsClient } from "@/components/projects/projects-client";

export const metadata: Metadata = {
  title: "Side Projects",
};

export default function SideProjectsPage() {
  return <ProjectsClient type="side_project" />;
}
