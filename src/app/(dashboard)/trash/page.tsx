import type { Metadata } from "next";
import { TrashClient } from "@/components/projects/trash-client";

export const metadata: Metadata = {
  title: "Trash",
};

export default function TrashPage() {
  return <TrashClient />;
}
