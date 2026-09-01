"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type WorkspaceRow = {
  id: string;
  name: string;
  createdAt: string;
  memberCount: number;
};

export type WorkspaceMemberRow = {
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  status: string | null;
};

export type AssignmentProject = {
  id: string;
  name: string;
  type: string;
  status: string;
  assigneeIds: string[];
};

export type AssignmentUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  assigned: boolean;
};

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? "Request failed");
  }
  return res.json();
}

export type CurrentUser = {
  userId: string;
  email: string;
  isGlobalOwner: boolean;
  roles: Record<string, "owner" | "member">;
};

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/me", { cache: "no-store" });
      const json = await j<{ data: CurrentUser }>(res);
      return json.data;
    },
  });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const res = await fetch("/api/workspaces", { cache: "no-store" });
      const json = await j<{ data: WorkspaceRow[] }>(res);
      return json.data;
    },
  });
}

export function useWorkspaceMembers(workspaceId: string | null) {
  return useQuery({
    queryKey: ["workspace-members", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        cache: "no-store",
      });
      const json = await j<{ data: WorkspaceMemberRow[] }>(res);
      return json.data;
    },
  });
}

export function useAddMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      return j(res);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["workspace-members", workspaceId] }),
  });
}

export function useSetRole(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: string;
    }) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/members/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      return j(res);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["workspace-members", workspaceId] }),
  });
}

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/members/${userId}`,
        { method: "DELETE" }
      );
      return j(res);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["workspace-members", workspaceId] }),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return j(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useRenameWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/workspaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return j(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useAssignments(workspaceId: string | null) {
  return useQuery({
    queryKey: ["assignments", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/assignments?workspaceId=${workspaceId}`, {
        cache: "no-store",
      });
      const json = await j<{
        data: { projects: AssignmentProject[]; users: AssignmentUser[] };
      }>(res);
      return json.data;
    },
  });
}

export function useSetAssignments(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      projectIds,
    }: {
      userId: string;
      projectIds: string[];
    }) => {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, userId, projectIds }),
      });
      return j(res);
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["assignments", workspaceId],
      }),
  });
}
