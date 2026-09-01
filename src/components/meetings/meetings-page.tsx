"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useMeetings, useMeeting } from "@/hooks/use-meetings";
import { PageDocument } from "@/components/shared/page-document";

const TYPE_LABELS: Record<string, string> = {
  standup: "Standup",
  brainstorm: "Brainstorm",
  team_weekly: "Weekly",
  training: "Training",
};

const TYPE_COLORS: Record<string, string> = {
  standup: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  brainstorm: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  team_weekly: "bg-green-500/15 text-green-600 dark:text-green-400",
  training: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function MeetingsPage() {
  const { data: meetings = [], isLoading } = useMeetings();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const effectiveId = useMemo(() => {
    if (selectedId && meetings.some((m) => m.id === selectedId)) return selectedId;
    return meetings[0]?.id ?? null;
  }, [selectedId, meetings]);

  const meetingDetail = useMeeting(effectiveId);
  const selected = useMemo(
    () => meetings.find((m) => m.id === effectiveId) ?? null,
    [meetings, effectiveId]
  );

  return (
    <div className="flex h-[calc(100vh-2rem)] overflow-hidden rounded-lg border bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Meetings</h2>
          <p className="text-xs text-muted-foreground">{meetings.length} records</p>
        </div>
        <nav className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          {meetings.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              className={cn(
                "flex w-full flex-col gap-1 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-b-0",
                m.id === effectiveId ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{m.name}</span>
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarDays className="size-3" />
                {m.eventTime
                  ? format(new Date(m.eventTime), "MMM d, yyyy · h:mm a")
                  : "No date"}
              </span>
            </button>
          ))}
          {!isLoading && meetings.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No meetings found.
            </p>
          )}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a meeting to view its notes.
          </div>
        ) : meetingDetail.isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <div className="mx-auto max-w-[760px] px-8 py-8">
            <div className="mb-3 flex items-center gap-2">
              <Badge
                variant="secondary"
                className={cn(
                  "border-transparent capitalize",
                  TYPE_COLORS[selected.type] ?? ""
                )}
              >
                {TYPE_LABELS[selected.type] ?? selected.type}
              </Badge>
            </div>
            <h1 className="mb-3 text-3xl font-bold tracking-tight">
              {selected.name}
            </h1>

            {selected.eventTime && (
              <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                {format(new Date(selected.eventTime), "EEEE, MMMM d, yyyy · h:mm a")}
              </div>
            )}

            {(meetingDetail.data?.attendees.length ?? 0) > 0 && (
              <div className="mb-8">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="size-4" />
                  <span>Attendees</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {meetingDetail.data?.attendees.map((a) => (
                    <div
                      key={a.userId}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Avatar className="size-6">
                        <AvatarImage src={a.avatarUrl ?? ""} alt="" />
                        <AvatarFallback>
                          {initials(a.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{a.fullName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(meetingDetail.data?.blocks.length ?? 0) > 0 && (
              <>
                <div className="mb-3 text-sm font-medium text-muted-foreground">
                  Meeting notes
                </div>
                <PageDocument blocks={meetingDetail.data?.blocks ?? []} />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
