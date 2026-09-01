"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Attachment } from "@/lib/db/schema";

async function fetchAttachments(params: {
  projectId?: string;
  hostingClientId?: string;
  pageId?: string;
}): Promise<Attachment[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  const res = await fetch(`/api/attachments?${qs.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch attachments");
  const json = await res.json();
  return json.data;
}

export function useAttachments(params: {
  projectId?: string;
  hostingClientId?: string;
  pageId?: string;
}) {
  return useQuery({
    queryKey: ["attachments", params],
    queryFn: () => fetchAttachments(params),
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      meta,
    }: {
      file: File;
      meta: {
        projectId?: string;
        hostingClientId?: string;
        pageId?: string;
        propertyName?: string;
      };
    }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("meta", JSON.stringify(meta));
      const res = await fetch("/api/attachments", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to upload attachment");
      }
      return res.json();
    },
    onSuccess: (_, { meta }) => {
      queryClient.invalidateQueries({ queryKey: ["attachments"] });
      if (meta.projectId) queryClient.invalidateQueries({ queryKey: ["attachments", { projectId: meta.projectId }] });
    },
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete attachment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments"] });
    },
  });
}
