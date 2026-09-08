"use client";

import { useMemo } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useProjectFilters } from "@/stores/project-filter-store";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectsTable } from "@/components/projects/projects-table";

export function ProjectsClient({ type }: { type: "client" | "side_project" }) {
  const { result, assigneeId, search, setResult, setSearch } =
    useProjectFilters();

  const { data } = useProjects({
    type,
    result: result.length ? result[0] : undefined,
    assigneeId: assigneeId ?? undefined,
    search: search || undefined,
    limit: 1000,
  });

  const projects = useMemo(() => data?.data ?? [], [data]);

  const counts = useMemo(() => {
    const all = projects.length;
    const notStarted = projects.filter((p) => p.status === "not_started").length;
    const inProgress = projects.filter((p) => p.status === "in_progress").length;
    const done = projects.filter((p) => p.status === "done").length;
    return { all, notStarted, inProgress, done };
  }, [projects]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {type === "client" ? "Projects" : "Side Projects"}
          </h1>
          <p className="text-muted-foreground">
            {counts.all} total · {counts.notStarted} not started · {counts.inProgress}{" "}
            in progress · {counts.done} done
          </p>
        </div>
        <NewProjectDialog type={type} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <select
          value={result[0] ?? ""}
          onChange={(e) => setResult(e.target.value ? [e.target.value] : [])}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none"
        >
          <option value="">All results</option>
          <option value="company_work">Company Work</option>
          <option value="in_progress">In progress</option>
          <option value="stuck">Stuck</option>
          <option value="pending_review">Pending For Review</option>
          <option value="done">Done</option>
        </select>
      </div>

      <ProjectsTable
        type={type}
        result={result.length ? result[0] : undefined}
        assigneeId={assigneeId ?? undefined}
        search={search || undefined}
      />
    </div>
  );
}
