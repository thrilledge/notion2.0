"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@/lib/db/schema";

type NotificationsResponse = {
  data: Notification[];
  meta: { unread: number };
};

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? "Request failed");
  }
  return res.json();
}

export function useNotifications(limit = 40) {
  return useQuery({
    queryKey: ["notifications", limit],
    queryFn: async () => {
      const res = await fetch(`/api/notifications?limit=${limit}`, {
        cache: "no-store",
      });
      return j<NotificationsResponse>(res);
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      return j(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications", { method: "POST" });
      return j(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
