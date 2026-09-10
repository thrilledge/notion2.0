"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ProjectContentBlock {
  id: string;
  pageId: string;
  type: string;
  content: {
    text?: string;
    checked?: boolean;
    level?: number;
    url?: string | null;
    language?: string;
    caption?: string;
    name?: string;
    spans?: {
      text: string;
      href?: string | null;
      bold?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
      underline?: boolean;
      code?: boolean;
    }[];
    [k: string]: unknown;
  };
  parentBlockId: string | null;
  position: number;
}

export interface ProjectContentPage {
  id: string;
  title: string;
  iconEmoji: string | null;
  iconUrl: string | null;
  position: number;
  notionPageId: string | null;
}

export interface ProjectContent {
  pages: ProjectContentPage[];
  blocks: ProjectContentBlock[];
}

async function fetchProjectContent(id: string): Promise<ProjectContent> {
  const res = await fetch(`/api/projects/${id}/content`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch project content");
  const json = await res.json();
  return json.data;
}

export function useProjectContent(id: string | undefined) {
  return useQuery({
    queryKey: ["projects", id, "content"],
    queryFn: () => fetchProjectContent(id!),
    enabled: !!id,
  });
}

export function useCreateBlock(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      text,
      type,
      spans,
    }: {
      text?: string;
      type?: string;
      spans?: ProjectContentBlock["content"]["spans"];
    }) => {
      const res = await fetch(`/api/projects/${projectId}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, type, spans }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to create block");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "content"],
      });
    },
  });
}

export function useUpdateBlock(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      blockId,
      text,
      checked,
      spans,
      type,
    }: {
      blockId: string;
      text?: string;
      checked?: boolean;
      spans?: ProjectContentBlock["content"]["spans"];
      type?: string;
    }) => {
      const res = await fetch(`/api/projects/${projectId}/blocks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, text, checked, spans, type }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update block");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "content"],
      });
    },
  });
}

export function useDeleteBlock(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockId: string) => {
      const res = await fetch(`/api/projects/${projectId}/blocks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockIds: [blockId] }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to delete block");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "content"],
      });
    },
  });
}
