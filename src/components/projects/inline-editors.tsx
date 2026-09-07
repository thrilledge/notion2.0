"use client";

import { useMemo } from "react";
import { Check, CalendarDays, UserRound } from "lucide-react";
import { useTeam } from "@/hooks/use-team";
import { useUpdateProject } from "@/hooks/use-projects";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ResultBadge } from "@/components/shared/status-badges";

const RESULT_OPTIONS = [
  { value: "company_work", label: "Company Work" },
  { value: "not_started", label: "Not started" },
  { value: "stuck", label: "Stuck" },
  { value: "pending_review", label: "Pending For Review" },
  { value: "in_progress", label: "In progress" },
  { value: "upcoming_renewal", label: "Upcoming renewal" },
  { value: "done", label: "Done" },
] as const;

export function AssigneeAvatar({
  name,
  url,
  className,
}: {
  name: string | null;
  url: string | null;
  className?: string;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Avatar className={`size-6 ${className ?? ""}`}>
      {url && <AvatarImage src={url} alt={name ?? ""} />}
      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
    </Avatar>
  );
}

export function AssigneeMultiSelect({
  projectId,
  value,
  align = "end",
}: {
  projectId: string;
  value: string[];
  align?: "start" | "end";
}) {
  const update = useUpdateProject();
  const { data: team = [] } = useTeam();
  const selected = useMemo(() => new Set(value), [value]);
  const selectedMembers = useMemo(
    () => team.filter((m) => selected.has(m.id)),
    [team, selected]
  );

  const toggle = (userId: string) => {
    const next = new Set(selected);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    update.mutate({ id: projectId, data: { assigneeIds: Array.from(next) } });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer flex-wrap items-center gap-1 rounded transition-opacity hover:opacity-80 focus-visible:outline-none"
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
      <PopoverContent className="w-60 p-0" align={align}>
        <p className="px-3 py-2 text-xs font-medium text-muted-foreground">
          Assigned to
        </p>
        {team.map((member) => {
          const active = selected.has(member.id);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => toggle(member.id)}
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
        {update.isPending && (
          <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            Saving...
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ResultSelectInline({
  projectId,
  value,
  align = "end",
}: {
  projectId: string;
  value: string | null;
  align?: "start" | "end";
}) {
  const update = useUpdateProject();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded transition-opacity hover:opacity-80 focus-visible:outline-none"
          title="Change result"
        >
          <ResultBadge result={value as never} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align={align}>
        <button
          type="button"
          onClick={() => update.mutate({ id: projectId, data: { result: null } })}
          className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent ${
            !value ? "font-medium" : ""
          }`}
        >
          — None —
        </button>
        {RESULT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() =>
              update.mutate({
                id: projectId,
                data: { result: opt.value },
              })
            }
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent ${
              opt.value === value ? "font-medium" : ""
            }`}
          >
            <ResultBadge result={opt.value as never} />
          </button>
        ))}
        {update.isPending && (
          <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            Saving...
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function CommentsInline({
  projectId,
  value,
  placeholder = "Add comment",
}: {
  projectId: string;
  value: string | null | undefined;
  placeholder?: string;
}) {
  const update = useUpdateProject();
  const submit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === (value ?? "").trim()) return;
    update.mutate({
      id: projectId,
      data: { comments: trimmed || null },
    });
  };
  return (
    <input
      type="text"
      defaultValue={value ?? ""}
      onBlur={(e) => submit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      title="Edit comment"
      className="w-full truncate rounded bg-transparent px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
    />
  );
}

export function DueDateInline({
  projectId,
  value,
}: {
  projectId: string;
  value: string | Date | null;
}) {
  const update = useUpdateProject();
  const parsed = useMemo(
    () => (value ? new Date(typeof value === "string" ? value : value) : null),
    [value]
  );
  const dateStr = parsed ? toInputDate(parsed) : "";

  return (
    <div className="flex items-center gap-1">
      <CalendarDays className="size-3.5 text-muted-foreground" />
      <input
        type="date"
        value={dateStr}
        onChange={(e) =>
          update.mutate({
            id: projectId,
            data: {
              dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
            },
          })
        }
        className="border-0 bg-transparent p-0 text-xs text-muted-foreground focus-visible:outline-none"
        title="Change due date"
      />
    </div>
  );
}

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
