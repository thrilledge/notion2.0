"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { HostingClient } from "@/lib/db/schema";

export type HostingInput = Partial<Omit<HostingClient, "dueDate">> & {
  dueDate?: string | null;
};

interface ListParams {
  status?: string;
  result?: string;
  assigneeId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "domain" | "updatedAt" | "createdAt" | "dueDate" | "status";
  sortDir?: "asc" | "desc";
}

interface ListResponse {
  data: HostingClient[];
  meta: { total: number; limit: number; offset: number };
}

async function fetchHosting(
  params: ListParams = {}
): Promise<ListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      qs.set(key, String(value));
    }
  });

  const res = await fetch(`/api/hosting?${qs.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch hosting clients");
  return res.json();
}

export function useHostingClients(params: ListParams = {}) {
  return useQuery({
    queryKey: ["hosting", params],
    queryFn: () => fetchHosting(params),
  });
}

async function fetchHostingClient(id: string): Promise<HostingClient> {
  const res = await fetch(`/api/hosting/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch hosting client");
  const json = await res.json();
  return json.data;
}

export function useHostingClient(id: string | undefined) {
  return useQuery({
    queryKey: ["hosting", id],
    queryFn: () => fetchHostingClient(id!),
    enabled: !!id,
  });
}

export function useCreateHostingClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: HostingInput) => {
      const res = await fetch("/api/hosting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to create hosting client");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hosting"] });
    },
  });
}

export function useUpdateHostingClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: HostingInput;
    }) => {
      const res = await fetch(`/api/hosting/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update hosting client");
      }
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["hosting"] });
      queryClient.invalidateQueries({ queryKey: ["hosting", id] });
    },
  });
}

export function useDeleteHostingClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hosting/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete hosting client");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hosting"] });
    },
  });
}
