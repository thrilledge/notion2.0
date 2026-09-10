"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  Download,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTeam } from "@/hooks/use-team";
import {
  useCreateProject,
  useReorderProject,
  useProjects,
  useImportProjects,
  useProjectAction,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AssigneeAvatar,
  AssigneeMultiSelect,
  CommentsInline,
  ResultSelectInline,
} from "@/components/projects/inline-editors";
import { ProjectActionsMenu } from "@/components/projects/project-actions-menu";
import {
  toExportRows,
  rowsToCsv,
  downloadFile,
  parseImportFile,
  type ProjectImportItem,
} from "@/components/projects/import-export";
import { cn } from "@/lib/utils";

const RESULT_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "stuck", label: "Stuck" },
  { value: "pending_review", label: "Pending for review" },
  { value: "company_work", label: "Company work" },
  { value: "upcoming_renewal", label: "Upcoming renewal" },
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
  const [result, setResult] = useState<string>("not_started");
  const [comments, setComments] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={7} className="py-2">
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
        status: "not_started",
        result: result as
          | "company_work"
          | "not_started"
          | "stuck"
          | "pending_review"
          | "in_progress"
          | "upcoming_renewal"
          | "done",
        comments: comments.trim() ? comments.trim() : undefined,
        assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Project created");
          setName("");
          setResult("not_started");
          setComments("");
          setAssigneeIds([]);
          setOpen(false);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const inputCls =
    "w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <TableRow className="bg-muted/30">
      <TableCell className="w-8 py-1.5 pr-0" />
      <TableCell className="w-8 py-1.5 pr-0" />
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
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className={inputCls}
        >
          {RESULT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <AssigneePicker
          value={assigneeIds}
          onChange={setAssigneeIds}
        />
      </TableCell>
      <TableCell className="max-w-[280px]">
        <input
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Add comment"
          className={inputCls}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            onClick={submit}
            disabled={createProject.isPending}
            className="shrink-0"
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
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent"
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const importProjects = useImportProjects();
  const { data: team = [] } = useTeam();
  const emailById = useMemo(
    () => new Map(team.filter((m) => m.email).map((m) => [m.id, m.email as string])),
    [team]
  );

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const allIds = projects.map((p) => p.id);
      const allSelected = allIds.every((id) => prev.has(id));
      const next = new Set<string>();
      if (!allSelected) allIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const trashAction = useProjectAction();
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashing, setTrashing] = useState(false);

  const handleBulkTrash = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setTrashing(true);
    ids.forEach((id, i) => {
      trashAction.mutate(
        { id, action: "trash" },
        {
          onSuccess: () => {
            if (i === ids.length - 1) {
              setTrashing(false);
              setSelected(new Set());
              setTrashOpen(false);
              toast.success(`Moved ${ids.length} project(s) to trash`);
            }
          },
          onError: (e) => {
            if (i === ids.length - 1) {
              setTrashing(false);
              setTrashOpen(false);
            }
            toast.error(e instanceof Error ? e.message : "Failed to trash project");
          },
        }
      );
    });
  };

  const handleExport = (format: "csv" | "json") => {
    const rows = toExportRows(
      projects.filter((p) => selected.has(p.id)),
      emailById
    );
    if (rows.length === 0) {
      toast.error("No projects selected");
      return;
    }
    const ts = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      downloadFile(rowsToCsv(rows), `projects-${ts}.csv`, "text/csv;charset=utf-8");
    } else {
      downloadFile(
        JSON.stringify(rows, null, 2),
        `projects-${ts}.json`,
        "application/json"
      );
    }
    toast.success(`Exported ${rows.length} project(s)`);
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const items = (await parseImportFile(file)).filter(
        (i) => i.name
      ) as unknown as import("@/hooks/use-projects").ProjectInput[];
      if (items.length === 0) {
        toast.error("No projects found in file");
        return;
      }
      importProjects.mutate(items, {
        onSuccess: () => toast.success(`Imported ${items.length} project(s)`),
        onError: (e) => toast.error(e.message),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
}
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

  // "Space-wise" grouping: keep each workspace's projects contiguous and mark
  // the first row of every workspace with a group header.
  const groupedProjects = useMemo(() => {
    const order: string[] = [];
    const buckets = new Map<string, ProjectWithAssignees[]>();
    for (const p of displayProjects) {
      const key = p.workspaceId ?? "unassigned";
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(p);
    }
    return order.flatMap((k) => buckets.get(k)!);
  }, [displayProjects]);

  const isGroupStart = (project: ProjectWithAssignees, idx: number) =>
    idx === 0 ||
    (project.workspaceId ?? "unassigned") !==
      (groupedProjects[idx - 1].workspaceId ?? "unassigned");

const handleDrop = () => {
    if (dragId) {
      // Persist using the live (already-moved) preview order.
      const base = groupedProjects.filter((p) => p.id !== dragId);
      const movedIdx = groupedProjects.findIndex((p) => p.id === dragId);
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

const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const el = e.currentTarget as HTMLTableRowElement;
    setOverId(targetId);
    const rect = el.getBoundingClientRect();
    setDropPos(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
  }, []);

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
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Download className="size-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export selected</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Upload className="size-4" />
                  Import
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Import projects</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  Import from CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  Import from JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setTrashOpen(true)}
              disabled={trashing}
            >
              {trashing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Trash
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="size-4" />
              Clear
            </Button>
          </div>
        </div>
      )}
      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to trash</DialogTitle>
            <DialogDescription>
              Move {selected.size} selected project(s) to trash? You can restore
              them later from the trash.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTrashOpen(false)} disabled={trashing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkTrash} disabled={trashing}>
              {trashing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <input
                type="checkbox"
                checked={
                  projects.length > 0 &&
                  projects.every((p) => selected.has(p.id))
                }
                onChange={toggleAll}
                title="Select all"
              />
            </TableHead>
            <TableHead className="w-8" />
            <TableHead className="w-[34%]">Name</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Comments</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!isLoading && !isError && <QuickAddRow type={type} />}
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
            groupedProjects.map((project, idx) => {
              const isTarget = overId === project.id;
              const key = project.workspaceId ?? "unassigned";
              return (
                <Fragment key={project.id}>
                  {isGroupStart(project, idx) && (
                    <TableRow className="bg-muted/30">
                      <TableCell
                        colSpan={7}
                        className="px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        <span className="flex items-center gap-2">
                          <Building2 className="size-3.5" />
                          {project.workspaceName ?? (key === "unassigned" ? "Unassigned" : "Workspace")}
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    draggable
                    onDragStart={(e) => handleDragStart(e, project)}
                    onDragOver={(e) => handleDragOver(e, project.id)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop();
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
                    <TableCell className="w-8">
                      <input
                        type="checkbox"
                        checked={selected.has(project.id)}
                        onChange={() => toggleSelected(project.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
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
                    <TableCell className="max-w-[280px]">
                      <CommentsInline
                        projectId={project.id}
                        value={project.comments}
                      />
                    </TableCell>
                    <TableCell className="w-16 text-right">
                      <ProjectActionsMenu
                        projectId={project.id}
                        projectName={project.name}
                        onTrashed={(id) => toggleSelected(id)}
                      />
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          <QuickAddRow type={type} />
        </TableBody>
      </Table>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json,application/json,text/csv"
        hidden
        onChange={(e) => {
          handleImportFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

