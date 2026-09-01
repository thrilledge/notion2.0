"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Check, GripVertical, Loader2, Plus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { useTeam } from "@/hooks/use-team";
import {
  useCreateProject,
  useReorderProject,
  useProjects,
  type ProjectWithAssignees,
} from "@/hooks/use-projects";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AssigneeAvatar,
  AssigneeMultiSelect,
  DueDateInline,
  ResultSelectInline,
} from "@/components/projects/inline-editors";
import { StatusBadge } from "@/components/shared/status-badges";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

function AssigneePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { data: team = [] } = useTeam();
  const selected = new Set(value);
  const selectedMembers = team.filter((m) => selected.has(m.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer flex-wrap items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
          title="Assign to"
        >
          {selectedMembers.length === 0 ? (
            <UserRound className="size-4 text-muted-foreground" />
          ) : (
            <div className="flex -space-x-1.5">
              {selectedMembers.map((m) => (
                <AssigneeAvatar
                  key={m.id}
                  name={m.fullName}
                  url={m.avatarUrl ?? null}
                  className="size-5 ring-2 ring-background"
                />
              ))}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="end">
        <p className="px-3 py-2 text-xs font-medium text-muted-foreground">
          Assigned to
        </p>
        {team.map((member) => {
          const active = selected.has(member.id);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => {
                const next = new Set(value);
                if (next.has(member.id)) next.delete(member.id);
                else next.add(member.id);
                onChange(Array.from(next));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
            >
              <AssigneeAvatar
                name={member.fullName}
                url={member.avatarUrl ?? null}
                className="size-5"
              />
              <span className="flex-1 truncate text-left">{member.fullName}</span>
              {active && <Check className="size-4" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function QuickAddRow({ type }: { type: "client" | "side_project" }) {
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [status, setStatus] = useState<string>("not_started");
  const [due, setDue] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={6} className="py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add {type === "client" ? "project" : "side project"}
          </button>
        </TableCell>
      </TableRow>
    );
  }

  const submit = () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    createProject.mutate(
      {
        name: name.trim(),
        type,
        status: status as "not_started" | "in_progress" | "done",
        dueDate: due ? new Date(due).toISOString() : null,
        assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Project created");
          setName("");
          setStatus("not_started");
          setDue("");
          setAssigneeIds([]);
          setOpen(false);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const inputCls =
    "w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <TableRow className="bg-muted/30">
      <TableCell className="py-1.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Project name"
          className={inputCls}
        />
      </TableCell>
      <TableCell>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={inputCls}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">—</TableCell>
      <TableCell>
        <AssigneePicker
          value={assigneeIds}
          onChange={setAssigneeIds}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="border-0 bg-transparent p-0 text-xs focus-visible:outline-none"
          />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            onClick={submit}
            disabled={createProject.isPending}
          >
            {createProject.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              "Add"
            )}
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            title="Cancel"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ProjectsTable({
  type,
  status,
  result,
  assigneeId,
  search,
}: {
  type: "client" | "side_project";
  status?: string;
  result?: string;
  assigneeId?: string;
  search?: string;
}) {
  const { data, isLoading, isError } = useProjects({
    type,
    status,
    result,
    assigneeId,
    search,
    limit: 1000,
  });
  const reorderProject = useReorderProject();

  const projects: ProjectWithAssignees[] = data?.data ?? [];
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<"before" | "after" | null>(null);
  const rowEls = useRef<Record<string, HTMLTableRowElement | null>>({});

  const setRowRef =
    (id: string) => (el: HTMLTableRowElement | null) => {
      if (el) rowEls.current[id] = el;
      else delete rowEls.current[id];
    };

  // Live preview: while dragging, visibly move the dragged row to the
  // hovered position. Derived at render time from drag state.
  const displayProjects = useMemo(() => {
    if (!dragId || dragId === overId || !overId) return projects;
    const pos: "before" | "after" = dropPos ?? "before";
    const moved = projects.find((p) => p.id === dragId);
    if (!moved) return projects;
    const base = projects.filter((p) => p.id !== dragId);
    const at = base.findIndex((p) => p.id === overId);
    if (at === -1) return projects;
    const insertAt = pos === "before" ? at : at + 1;
    base.splice(insertAt, 0, moved);
    return base;
  }, [projects, dragId, overId, dropPos]);

  const handleDrop = (targetId: string) => {
    if (dragId) {
      // Persist using the live (already-moved) preview order.
      const base = displayProjects.filter((p) => p.id !== dragId);
      const movedIdx = displayProjects.findIndex((p) => p.id === dragId);
      const afterId = base[movedIdx - 1]?.id ?? null;
      const beforeId = base[movedIdx]?.id ?? null;
      reorderProject.mutate({ id: dragId, afterId, beforeId });
    }
    resetDrag();
  };

  const resetDrag = () => {
    setDragId(null);
    setOverId(null);
    setDropPos(null);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const el = rowEls.current[targetId];
    setOverId(targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropPos(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
    }
  };

  const handleDragStart = (
    e: React.DragEvent,
    project: ProjectWithAssignees
  ) => {
    setDragId(project.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", project.id);
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="w-[36%]">Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={7} className="space-y-2 py-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </TableCell>
            </TableRow>
          )}
          {isError && (
            <TableRow>
              <TableCell colSpan={7} className="py-4 text-center text-sm text-destructive">
                Failed to load projects.
              </TableCell>
            </TableRow>
          )}
          {!isLoading && !isError && projects.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="h-16 text-center text-muted-foreground"
              >
                No projects yet. Add one below.
              </TableCell>
            </TableRow>
          )}
          {!isLoading &&
            !isError &&
            displayProjects.map((project) => {
              const isTarget = overId === project.id;
              return (
                <TableRow
                  key={project.id}
                  ref={setRowRef(project.id)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, project)}
                  onDragOver={(e) => handleDragOver(e, project.id)}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(project.id);
                  }}
                  onDragEnd={resetDrag}
                  className={cn(
                    "group/row",
                    dragId === project.id && "opacity-45",
                    dragId &&
                      isTarget &&
                      "z-10 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.2)]"
                  )}
                >
                  <TableCell className="w-8 pr-0">
                    <span className="flex cursor-grab items-center text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-60 hover:opacity-100">
                      <GripVertical className="size-4" />
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium hover:underline"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={project.status} />
                  </TableCell>
                  <TableCell>
                    <ResultSelectInline
                      projectId={project.id}
                      value={project.result ?? null}
                    />
                  </TableCell>
                  <TableCell>
                    <AssigneeMultiSelect
                      projectId={project.id}
                      value={project.assigneeIds ?? []}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <DueDateInline
                      projectId={project.id}
                      value={project.dueDate}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {project.updatedAt
                      ? format(new Date(project.updatedAt), "MMM d, yyyy")
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          <QuickAddRow type={type} />
        </TableBody>
      </Table>
    </div>
  );
}
