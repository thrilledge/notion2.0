"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProjectContentBlock } from "@/hooks/use-project-content";

export interface DocListItem {
  id: string;
  title: string;
  tags: string[];
  pageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocDetail extends DocListItem {
  blocks: ProjectContentBlock[];
}

async function fetchDocs(): Promise<DocListItem[]> {
  const res = await fetch("/api/docs", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch docs");
  const json = await res.json();
  return json.data;
}

export function useDocs() {
  return useQuery({
    queryKey: ["docs"],
    queryFn: fetchDocs,
  });
}

async function fetchDoc(id: string): Promise<DocDetail> {
  const res = await fetch(`/api/docs/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch doc");
  const json = await res.json();
  return json.data;
}

export function useDoc(id: string | null) {
  return useQuery({
    queryKey: ["docs", id, "detail"],
    queryFn: () => fetchDoc(id!),
    enabled: !!id,
  });
}
