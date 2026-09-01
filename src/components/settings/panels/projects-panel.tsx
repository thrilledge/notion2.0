"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useProjects, type ProjectWithAssignees } from "@/hooks/use-projects";
import { SettingsCard } from "@/components/settings/settings-card";

const typeLabel: Record<string, string> = {
  client: "Client",
  side_project: "Side",
};

const statusStyle: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  archived: "bg-muted text-muted-foreground",
};

export function ProjectsPanel() {
  const { data, isLoading, isError } = useProjects({ limit: 1000, sortBy: "name" });
  const [search, setSearch] = useState("");

  const projects = (data?.data ?? []) as ProjectWithAssignees[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

  return (
    <SettingsCard title="Projects">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {isLoading && <Skeleton className="h-56 w-full" />}
        {isError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load projects.
          </div>
        )}
        {!isLoading && !isError && (
          <>
            <p className="text-xs text-muted-foreground">
              {filtered.length} of {projects.length} projects
            </p>
            <div className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
              {filtered.length === 0 && (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No projects match your search.
                </p>
              )}
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                >
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{typeLabel[p.type] ?? p.type}</Badge>
                    <Badge
                      variant="secondary"
                      className={`border-transparent ${
                        statusStyle[p.status] ?? ""
                      }`}
                    >
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </SettingsCard>
  );
}
