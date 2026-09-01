"use client";

import { useQuery } from "@tanstack/react-query";
import type { User } from "@/lib/db/schema";

async function fetchTeam(): Promise<User[]> {
  const res = await fetch("/api/team", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch team");
  const json = await res.json();
  return json.data;
}

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: fetchTeam,
  });
}
