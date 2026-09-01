import type { Metadata } from "next";
import { ProjectsClient } from "@/components/projects/projects-client";

export const metadata: Metadata = {
  title: "Projects",
};

export default function ProjectsPage() {
  return <ProjectsClient type="client" />;
}
