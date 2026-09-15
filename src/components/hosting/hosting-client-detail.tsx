"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Globe,
  Loader2,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatusBadge, ResultBadge } from "@/components/shared/status-badges";
import {
  useUpdateHostingClient,
  useDeleteHostingClient,
  useHostingClient,
} from "@/hooks/use-hosting";
import { useTeam } from "@/hooks/use-team";
import { AssigneeAvatar } from "@/components/projects/inline-editors";
import type { HostingClient } from "@/lib/db/schema";

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
] as const;

const RESULT_OPTIONS = [
  { value: "company_work", label: "Company Work" },
  { value: "not_started", label: "Not started" },
  { value: "stuck", label: "Stuck" },
  { value: "pending_review", label: "Pending For Review" },
  { value: "in_progress", label: "In progress" },
  { value: "upcoming_renewal", label: "Upcoming renewal" },
  { value: "done", label: "Done" },
] as const;

function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group flex min-h-9 items-start rounded-md px-2 py-1 transition-colors hover:bg-muted/60">
      <div className="flex w-[150px] shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function HostingClientDetail({ client }: { client: HostingClient }) {
  const router = useRouter();
  const update = useUpdateHostingClient();
  const remove = useDeleteHostingClient();

  const live = useHostingClient(client.id);
  const c = live.data ?? client;

  const { data: team = [] } = useTeam();
  const assignee = team.find((m) => m.id === c.assigneeId);

  const [domain, setDomain] = useState(client.domain);
  const [clientName, setClientName] = useState(client.clientName ?? "");
  const [summary, setSummary] = useState(client.summary ?? "");
  const [comments, setComments] = useState(client.comments ?? "");
  const [text, setText] = useState(client.text ?? "");
  const [dueDate, setDueDate] = useState(
    client.dueDate ? toInputDate(new Date(client.dueDate)) : ""
  );

  const editedRef = useRef(false);

  useEffect(() => {
    const p = live.data;
    if (!p || editedRef.current) return;
    setDomain(p.domain);
    setClientName(p.clientName ?? "");
    setSummary(p.summary ?? "");
    setComments(p.comments ?? "");
    setText(p.text ?? "");
    setDueDate(p.dueDate ? toInputDate(new Date(p.dueDate)) : "");
  }, [live.data]);

  const saveField = (
    data: Parameters<typeof update.mutate>[0]["data"],
    toastMsg?: string
  ) => {
    update.mutate(
      { id: client.id, data },
      {
        onSuccess: () => {
          editedRef.current = false;
          toastMsg && toast.success(toastMsg);
        },
        onError: (err) =>
          toast.error(
            err instanceof Error ? err.message : "Failed to save"
          ),
      }
    );
  };

  const saveText = (
    field: "summary" | "comments" | "text",
    value: string,
    toastMsg: string
  ) => {
    const trimmed = value.trim();
    const current = c[field] ?? "";
    if (trimmed === current) return;
    saveField({ [field]: trimmed || null }, toastMsg);
  };

  const handleDelete = () => {
    if (!window.confirm("Delete this hosting client?")) return;
    remove.mutate(client.id, {
      onSuccess: () => {
        toast.success("Hosting client deleted");
        router.push("/hosting");
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Failed to delete"),
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[850px] px-6 py-8 md:px-12 lg:px-16">
        <div className="mb-10 flex items-center justify-between">
          <Link
            href="/hosting"
            className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span>Hosting Clients</span>
          </Link>

          <div className="flex items-center gap-2">
            {update.isPending && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Saving...
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete
            </Button>
          </div>
        </div>

        <main>
          <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-muted text-2xl">
            <Globe className="size-6 text-muted-foreground" />
          </div>

          <input
            value={domain}
            onChange={(e) => {
              editedRef.current = true;
              setDomain(e.target.value);
            }}
            onBlur={() => {
              const trimmed = domain.trim();
              if (trimmed && trimmed !== c.domain) {
                saveField({ domain: trimmed }, "Domain saved");
              }
            }}
            placeholder="example.com"
            className="mb-2 w-full border-0 bg-transparent p-0 text-[40px] font-bold leading-tight tracking-[-0.025em] outline-none placeholder:text-muted-foreground/40 focus:ring-0 md:text-[46px]"
          />

          <div className="mb-8 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Hosting client</span>
            <span>·</span>
            <span>
              Created {format(new Date(c.createdAt), "MMM d, yyyy")}
            </span>
            <span>·</span>
            <span>
              Updated {format(new Date(c.updatedAt), "MMM d, yyyy")}
            </span>
          </div>

          <div className="mb-12 max-w-[720px]">
            <PropertyRow
              icon={<UserRound className="size-4" />}
              label="Client"
            >
              <input
                value={clientName}
                onChange={(e) => {
                  editedRef.current = true;
                  setClientName(e.target.value);
                }}
                onBlur={() => {
                  const trimmed = clientName.trim();
                  if (trimmed !== (c.clientName ?? "")) {
                    saveField(
                      { clientName: trimmed || null },
                      "Client saved"
                    );
                  }
                }}
                placeholder="Empty"
                className="w-full border-0 bg-transparent p-0 text-sm outline-none focus:ring-0 placeholder:text-muted-foreground/50"
              />
            </PropertyRow>

            <PropertyRow
              icon={<CalendarDays className="size-4" />}
              label="Due date"
            >
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  editedRef.current = true;
                  setDueDate(e.target.value);
                  saveField({
                    dueDate: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  });
                }}
                className="h-7 border-0 bg-transparent p-0 text-sm outline-none focus:ring-0"
              />
            </PropertyRow>

            <PropertyRow
              icon={
                <span className="flex size-4 items-center justify-center">
                  <span className="size-2 rounded-full bg-muted-foreground" />
                </span>
              }
              label="Status"
            >
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
                  >
                    <StatusBadge status={c.status} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        saveField({ status: option.value }, "Status updated")
                      }
                      className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted ${
                        option.value === c.status ? "bg-muted" : ""
                      }`}
                    >
                      <StatusBadge status={option.value} />
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </PropertyRow>

            <PropertyRow
              icon={
                <span className="flex size-4 items-center justify-center">
                  <span className="size-2 rounded-sm bg-muted-foreground" />
                </span>
              }
              label="Result"
            >
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
                  >
                    <ResultBadge result={c.result ?? null} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1" align="start">
                  <button
                    type="button"
                    onClick={() => saveField({ result: null })}
                    className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-muted ${
                      !c.result ? "bg-muted font-medium" : ""
                    }`}
                  >
                    — None —
                  </button>
                  {RESULT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        saveField({ result: option.value }, "Result updated")
                      }
                      className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted ${
                        option.value === c.result ? "bg-muted font-medium" : ""
                      }`}
                    >
                      <ResultBadge result={option.value} />
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </PropertyRow>

            <PropertyRow
              icon={<FileText className="size-4" />}
              label="Project"
            >
              {c.projectId ? (
                <Link
                  href={`/projects/${c.projectId}`}
                  className="text-sm text-primary hover:underline"
                >
                  View linked project →
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">Empty</span>
              )}
            </PropertyRow>

            {assignee && (
              <PropertyRow
                icon={<UserRound className="size-4" />}
                label="Assignee"
              >
                <div className="flex items-center gap-2">
                  <AssigneeAvatar
                    name={assignee.fullName}
                    url={assignee.avatarUrl ?? null}
                    className="size-5"
                  />
                  <span className="text-sm">{assignee.fullName}</span>
                </div>
              </PropertyRow>
            )}
          </div>

          <Separator className="mb-10" />

          <div className="max-w-[760px]">
            {c.summary !== null && (
              <section className="mb-12">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileText className="size-4" />
                  <span>Summary</span>
                </div>
                <textarea
                  value={summary}
                  onChange={(e) => {
                    editedRef.current = true;
                    setSummary(e.target.value);
                  }}
                  onBlur={() => saveText("summary", summary, "Summary saved")}
                  placeholder="Type something..."
                  rows={4}
                  className="w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-7 outline-none placeholder:text-muted-foreground/50 focus:ring-0"
                />
              </section>
            )}

            {c.text !== null && (
              <section className="mb-12">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileText className="size-4" />
                  <span>Details</span>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => {
                    editedRef.current = true;
                    setText(e.target.value);
                  }}
                  onBlur={() => saveText("text", text, "Details saved")}
                  placeholder="Type something..."
                  rows={4}
                  className="w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-7 outline-none placeholder:text-muted-foreground/50 focus:ring-0"
                />
              </section>
            )}

            <section className="mb-20">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="size-4" />
                <span>Comments</span>
              </div>
              <textarea
                value={comments}
                onChange={(e) => {
                  editedRef.current = true;
                  setComments(e.target.value);
                }}
                onBlur={() =>
                  saveText("comments", comments, "Comments saved")
                }
                placeholder="Add a comment..."
                rows={5}
                className="w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-7 outline-none placeholder:text-muted-foreground/50 focus:ring-0"
              />
            </section>

            <div className="border-t pt-5 text-xs text-muted-foreground">
              {update.isPending ? "Saving changes..." : "All changes saved"}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
