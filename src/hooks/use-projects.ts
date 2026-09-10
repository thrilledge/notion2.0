"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";
import type { Project } from "@/lib/db/schema";

export type ProjectWithAssignees = Project & {
  assigneeIds?: string[];
  workspaceName?: string | null;
};

export type ProjectInput = Partial<Omit<Project, "dueDate" | "assigneeIds">> & {
  dueDate?: string | null;
  assigneeIds?: string[];
};

interface ListParams {
  type?: "client" | "side_project";
  status?: string;
  result?: string;
  assigneeId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "sortOrder" | "name" | "updatedAt" | "createdAt" | "dueDate" | "status";
  sortDir?: "asc" | "desc";
  trashed?: boolean;
}

interface ListResponse {
  data: ProjectWithAssignees[];
  meta: { total: number; limit: number; offset: number };
}

async function fetchProjects(params: ListParams = {}): Promise<ListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      qs.set(key, String(value));
    }
  });

  const res = await fetch(`/api/projects?${qs.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export function useProjects(
  params: ListParams = {},
  options?: Omit<UseQueryOptions<ListResponse, Error>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["projects", params],
    queryFn: () => fetchProjects(params),
    ...options,
  });
}

async function fetchProject(id: string): Promise<ProjectWithAssignees> {
  const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch project");
  const json = await res.json();
  return json.data;
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ProjectInput) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to create project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: ProjectInput;
    }) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update project");
      }
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
    },
  });
}

export function useReorderProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      id: string;
      afterId?: string | null;
      beforeId?: string | null;
    }) => {
      const res = await fetch("/api/projects/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to reorder project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useProjectAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      name,
    }: {
      id: string;
      action: "trash" | "restore" | "duplicate";
      name?: string;
    }) => {
      const res = await fetch(`/api/projects/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Action failed");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", vars.id] });
      if (vars.action === "duplicate") {
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      }
    },
  });
}

export function useTrashedProjects() {
  return useQuery({
    queryKey: ["projects", { trashed: true }],
    queryFn: () => fetchProjects({ trashed: true, limit: 1000 }),
  });
}

export function useImportProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: ProjectInput[]) => {
      const res = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Import failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
