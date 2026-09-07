"use client";

import { useMemo } from "react";
import { CalendarDays, Check, UserRound } from "lucide-react";
import { useTeam } from "@/hooks/use-team";
import { useUpdateHostingClient } from "@/hooks/use-hosting";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ResultBadge } from "@/components/shared/status-badges";
import {
  AssigneeAvatar,
} from "@/components/projects/inline-editors";

const RESULT_OPTIONS = [
  { value: "company_work", label: "Company Work" },
  { value: "not_started", label: "Not started" },
  { value: "stuck", label: "Stuck" },
  { value: "pending_review", label: "Pending For Review" },
  { value: "in_progress", label: "In progress" },
  { value: "upcoming_renewal", label: "Upcoming renewal" },
  { value: "done", label: "Done" },
] as const;

export function HostingResultInline({
  clientId,
  value,
  align = "end",
}: {
  clientId: string;
  value: string | null;
  align?: "start" | "end";
}) {
  const update = useUpdateHostingClient();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded transition-opacity hover:opacity-80 focus-visible:outline-none"
          title="Change result"
        >
          <ResultBadge result={value} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align={align}>
        <button
          type="button"
          onClick={() =>
            update.mutate({ id: clientId, data: { result: null } })
          }
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
              update.mutate({ id: clientId, data: { result: opt.value } })
            }
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent ${
              opt.value === value ? "font-medium" : ""
            }`}
          >
            <ResultBadge result={opt.value} />
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

export function HostingAssigneeSelect({
  clientId,
  value,
  align = "end",
}: {
  clientId: string;
  value: string | null;
  align?: "start" | "end";
}) {
  const update = useUpdateHostingClient();
  const { data: team = [] } = useTeam();
  const member = useMemo(
    () => team.find((m) => m.id === value) ?? null,
    [team, value]
  );

  const select = (userId: string | null) => {
    update.mutate({ id: clientId, data: { assigneeId: userId } });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer flex-wrap items-center gap-1 rounded transition-opacity hover:opacity-80 focus-visible:outline-none"
          title="Assign to"
        >
          {member ? (
            <div className="flex items-center gap-1.5">
              <AssigneeAvatar
                name={member.fullName}
                url={member.avatarUrl ?? null}
                className="size-5 ring-2 ring-background"
              />
              <span className="max-w-[120px] truncate text-xs">
                {member.fullName}
              </span>
            </div>
          ) : (
            <UserRound className="size-4 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align={align}>
        <p className="px-3 py-2 text-xs font-medium text-muted-foreground">
          Assigned to
        </p>
        <button
          type="button"
          onClick={() => select(null)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent ${
            !value ? "font-medium" : ""
          }`}
        >
          — Unassigned —
        </button>
        {team.map((m) => {
          const active = m.id === value;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => select(m.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
            >
              <AssigneeAvatar
                name={m.fullName}
                url={m.avatarUrl ?? null}
                className="size-5"
              />
              <span className="flex-1 truncate text-left">{m.fullName}</span>
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

export function HostingCommentsInline({
  clientId,
  value,
  placeholder = "Add comment",
}: {
  clientId: string;
  value: string | null | undefined;
  placeholder?: string;
}) {
  const update = useUpdateHostingClient();
  const submit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === (value ?? "").trim()) return;
    update.mutate({ id: clientId, data: { comments: trimmed || null } });
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

export function HostingDueDateInline({
  clientId,
  value,
}: {
  clientId: string;
  value: string | Date | null;
}) {
  const update = useUpdateHostingClient();
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
            id: clientId,
            data: {
              dueDate: e.target.value
                ? new Date(e.target.value).toISOString()
                : null,
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
