"use client";

import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Paperclip,
  Trash2,
  Users,
  Loader2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { useUpdateProject, useProject } from "@/hooks/use-projects";
import { useTeam } from "@/hooks/use-team";
import { useProjectContent } from "@/hooks/use-project-content";

import { EditableBlocks } from "@/components/projects/editable-blocks";

import {
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
} from "@/hooks/use-attachments";

import type { Project } from "@/lib/db/schema";

import {
  StatusBadge,
  ResultBadge,
} from "@/components/shared/status-badges";

import {
  AssigneeMultiSelect,
  AssigneeAvatar,
} from "@/components/projects/inline-editors";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { ProjectActionsMenu } from "@/components/projects/project-actions-menu";


const STATUS_OPTIONS = [
  {
    value: "not_started",
    label: "Not started",
  },
  {
    value: "in_progress",
    label: "In progress",
  },
  {
    value: "done",
    label: "Done",
  },
  {
    value: "archived",
    label: "Archived",
  },
] as const;


const RESULT_OPTIONS = [
  {
    value: "company_work",
    label: "Company Work",
  },
  {
    value: "not_started",
    label: "Not started",
  },
  {
    value: "stuck",
    label: "Stuck",
  },
  {
    value: "pending_review",
    label: "Pending For Review",
  },
  {
    value: "in_progress",
    label: "In progress",
  },
  {
    value: "upcoming_renewal",
    label: "Upcoming renewal",
  },
  {
    value: "done",
    label: "Done",
  },
] as const;


type StatusValue =
  (typeof STATUS_OPTIONS)[number]["value"];

type ResultValue =
  (typeof RESULT_OPTIONS)[number]["value"] | null;


/* -------------------------------------------------------
   Notion-style property row
------------------------------------------------------- */

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
    <div className="group flex min-h-9 items-center rounded-md px-2 py-1 transition-colors hover:bg-muted/60">
      <div className="flex w-[150px] shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
        <span className="flex size-5 items-center justify-center text-muted-foreground">
          {icon}
        </span>

        <span>{label}</span>
      </div>

      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}


function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}


/* -------------------------------------------------------
   Main component
------------------------------------------------------- */

export function ProjectDetail({
  project,
}: {
  project: Project;
}) {
  const router = useRouter();
  const update = useUpdateProject();

  const { data: team = [] } = useTeam();

  const live = useProject(project.id);

  const assigneeIds = useMemo(
    () => live.data?.assigneeIds ?? [],
    [live.data?.assigneeIds]
  );

  const { data: attachments = [] } =
    useAttachments({
      projectId: project.id,
    });

  const content = useProjectContent(project.id);

  const upload = useUploadAttachment();

  const removeAtt = useDeleteAttachment();


  /* -------------------------------------------------------
     Local state
  ------------------------------------------------------- */

  const [name, setName] = useState(project.name);

  const [summary, setSummary] = useState(
    project.summary ?? ""
  );

  const [comments, setComments] = useState(
    project.comments ?? ""
  );

  const [dueDate, setDueDate] = useState(
    project.dueDate
      ? toInputDate(new Date(project.dueDate))
      : ""
  );

  const fileInputRef =
    useRef<HTMLInputElement>(null);


  const statusValue =
    project.status as StatusValue;

  const resultValue =
    project.result as ResultValue;


  /* -------------------------------------------------------
     Save helpers
  ------------------------------------------------------- */

  const saveField = (
    data: Parameters<typeof update.mutate>[0]["data"],
    opts?: {
      toastMsg?: string;
    }
  ) =>
    update.mutate(
      {
        id: project.id,
        data,
      },
      {
        onSuccess: () => {
          if (opts?.toastMsg) {
            toast.success(opts.toastMsg);
          }
        },

        onError: (err) => {
          toast.error(
            err instanceof Error
              ? err.message
              : "Failed to save"
          );
        },
      }
    );


  const saveText = (
    field: "summary" | "comments",
    value: string,
    toastMsg: string
  ) => {
    const trimmed = value.trim();

    const current =
      field === "summary"
        ? project.summary ?? ""
        : project.comments ?? "";

    if (trimmed === current) return;

    saveField(
      {
        [field]: trimmed || null,
      },
      {
        toastMsg,
      }
    );
  };


  /* -------------------------------------------------------
     Upload
  ------------------------------------------------------- */

  const handleFile = async (
    file: File | undefined
  ) => {
    if (!file) return;

    try {
      await upload.mutateAsync({
        file,

        meta: {
          projectId: project.id,
          propertyName: "Files & media",
        },
      });

      toast.success("File uploaded");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Upload failed"
      );
    }
  };


  const selectedMembers = useMemo(
    () =>
      team.filter((member) =>
        assigneeIds.includes(member.id)
      ),
    [team, assigneeIds]
  );


  /* -------------------------------------------------------
     UI
  ------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1100px] px-6 py-8 md:px-12 lg:px-16">

        {/* -------------------------------------------------
            TOP BAR
        ------------------------------------------------- */}

        <div className="mb-10 flex items-center justify-between">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />

            <span>Projects</span>
          </Link>


          <div className="flex items-center gap-2">

            {update.isPending && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />

                Saving...
              </div>
            )}

            <ProjectActionsMenu
              projectId={project.id}
              projectName={project.name}
              onTrashed={() => router.push("/projects")}
            />

          </div>
        </div>


        {/* -------------------------------------------------
            PAGE HEADER
        ------------------------------------------------- */}

        <main>

          {/* Emoji / page icon */}

          <button
            type="button"
            className="mb-4 flex size-12 items-center justify-center rounded-lg text-4xl transition-colors hover:bg-muted"
          >
            📁
          </button>


          {/* Page title */}

          <input
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            onBlur={() => {
              const trimmed = name.trim();

              if (
                trimmed &&
                trimmed !== project.name
              ) {
                saveField(
                  {
                    name: trimmed,
                  },
                  {
                    toastMsg: "Renamed",
                  }
                );
              }
            }}
            placeholder="Untitled"
            className="
              mb-2
              w-full
              border-0
              bg-transparent
              p-0
              text-[40px]
              font-bold
              leading-tight
              tracking-[-0.025em]
              outline-none
              placeholder:text-muted-foreground/40
              focus:ring-0
              md:text-[48px]
            "
          />


          {/* Page metadata */}

          <div className="mb-8 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {project.type === "client"
                ? "Project"
                : "Side project"}
            </span>

            <span>·</span>

            <span>
              Created{" "}
              {format(
                new Date(project.createdAt),
                "MMM d, yyyy"
              )}
            </span>

            <span>·</span>

            <span>
              Updated{" "}
              {format(
                new Date(project.updatedAt),
                "MMM d, yyyy"
              )}
            </span>
          </div>


          {/* -------------------------------------------------
              PROPERTIES
          ------------------------------------------------- */}

          <div className="mb-12 max-w-[720px]">

            {/* Assignee */}

            <PropertyRow
              icon={
                <Users className="size-4" />
              }
              label="Assignee"
            >
              <div className="flex items-center justify-between gap-3">

                <div className="min-w-0">

                  {selectedMembers.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      Empty
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">

                      <div className="flex -space-x-1.5">
                        {selectedMembers.map(
                          (member) => (
                            <AssigneeAvatar
                              key={member.id}
                              name={member.fullName}
                              url={
                                member.avatarUrl ??
                                null
                              }
                              className="size-6 ring-2 ring-background"
                            />
                          )
                        )}
                      </div>

                      <span className="text-sm">
                        {selectedMembers
                          .map(
                            (member) =>
                              member.fullName
                          )
                          .join(", ")}
                      </span>

                    </div>
                  )}

                </div>

                <AssigneeMultiSelect
                  projectId={project.id}
                  value={assigneeIds}
                />

              </div>
            </PropertyRow>


            {/* Due date */}

            <PropertyRow
              icon={
                <CalendarDays className="size-4" />
              }
              label="Due date"
            >
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);

                  saveField({
                    dueDate: e.target.value
                      ? new Date(
                          e.target.value
                        ).toISOString()
                      : null,
                  });
                }}
                className="
                  h-7
                  border-0
                  bg-transparent
                  p-0
                  text-sm
                  outline-none
                  focus:ring-0
                "
              />
            </PropertyRow>


            {/* Status */}

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
                    <StatusBadge
                      status={statusValue}
                    />
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  className="w-48 p-1"
                  align="start"
                >
                  {STATUS_OPTIONS.map(
                    (option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          saveField(
                            {
                              status:
                                option.value,
                            },
                            {
                              toastMsg:
                                "Status updated",
                            }
                          )
                        }
                        className={`
                          flex
                          w-full
                          items-center
                          rounded-md
                          px-2.5
                          py-2
                          text-left
                          text-sm
                          transition-colors
                          hover:bg-muted
                          ${
                            option.value ===
                            statusValue
                              ? "bg-muted"
                              : ""
                          }
                        `}
                      >
                        <StatusBadge
                          status={
                            option.value
                          }
                        />
                      </button>
                    )
                  )}
                </PopoverContent>

              </Popover>
            </PropertyRow>


            {/* Result */}

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
                    <ResultBadge
                      result={resultValue}
                    />
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  className="w-56 p-1"
                  align="start"
                >

                  <button
                    type="button"
                    onClick={() =>
                      saveField({
                        result: null,
                      })
                    }
                    className={`
                      flex
                      w-full
                      items-center
                      rounded-md
                      px-2.5
                      py-2
                      text-left
                      text-sm
                      text-muted-foreground
                      hover:bg-muted
                      ${
                        !resultValue
                          ? "bg-muted font-medium"
                          : ""
                      }
                    `}
                  >
                    — None —
                  </button>

                  {RESULT_OPTIONS.map(
                    (option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          saveField(
                            {
                              result:
                                option.value,
                            },
                            {
                              toastMsg:
                                "Result updated",
                            }
                          )
                        }
                        className={`
                          flex
                          w-full
                          items-center
                          rounded-md
                          px-2.5
                          py-2
                          text-left
                          text-sm
                          hover:bg-muted
                          ${
                            option.value ===
                            resultValue
                              ? "bg-muted font-medium"
                              : ""
                          }
                        `}
                      >
                        <ResultBadge
                          result={
                            option.value
                          }
                        />
                      </button>
                    )
                  )}

                </PopoverContent>

              </Popover>
            </PropertyRow>

          </div>


          {/* -------------------------------------------------
              DIVIDER
          ------------------------------------------------- */}

          <Separator className="mb-10" />


          {/* -------------------------------------------------
              DOCUMENT CONTENT
          ------------------------------------------------- */}

          <div className="max-w-[760px]">

            {/* Existing editable blocks */}

            {content.isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />

                Loading page content...
              </div>
            ) : content.data &&
              content.data.pages.length > 0 ? (
              <section className="mb-12">

                {content.data.pages.map(
                  (page) => {

                    const pageBlocks =
                      content.data.blocks
                        .filter(
                          (block) =>
                            block.pageId ===
                            page.id
                        )
                        .sort(
                          (a, b) =>
                            a.position -
                            b.position
                        );

                    return (
                      <div
                        key={page.id}
                        className="mb-8"
                        data-project-content-page={
                          page.id
                        }
                      >

                        {page.title && (
                          <div className="mb-3 flex items-center gap-2">

                            {page.iconEmoji && (
                              <span className="text-lg">
                                {
                                  page.iconEmoji
                                }
                              </span>
                            )}

                            <h2 className="text-base font-semibold">
                              {page.title}
                            </h2>

                          </div>
                        )}

                        <EditableBlocks
                          projectId={
                            project.id
                          }
                          content={{
                            pages: [page],
                            blocks:
                              pageBlocks,
                          }}
                        />

                      </div>
                    );
                  }
                )}

              </section>
            ) : null}


            {/* -------------------------------------------------
                SUMMARY
            ------------------------------------------------- */}

            <section className="group mb-12">

              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">

                <FileText className="size-4" />

                <span>Summary</span>

              </div>

              <textarea
                value={summary}
                onChange={(e) =>
                  setSummary(e.target.value)
                }
                onBlur={() =>
                  saveText(
                    "summary",
                    summary,
                    "Summary saved"
                  )
                }
                placeholder="Type something..."
                rows={4}
                className="
                  w-full
                  resize-none
                  border-0
                  bg-transparent
                  p-0
                  text-[15px]
                  leading-7
                  outline-none
                  placeholder:text-muted-foreground/50
                  focus:ring-0
                "
              />

            </section>


            {/* -------------------------------------------------
                FILES & MEDIA
            ------------------------------------------------- */}

            <section className="mb-12">

              <div className="mb-3 flex items-center justify-between">

                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">

                  <Paperclip className="size-4" />

                  <span>Files & media</span>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  disabled={
                    upload.isPending
                  }
                  className="
                    flex
                    items-center
                    gap-1
                    rounded-md
                    px-2
                    py-1
                    text-xs
                    text-muted-foreground
                    transition-colors
                    hover:bg-muted
                    hover:text-foreground
                  "
                >
                  {upload.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}

                  Add
                </button>

              </div>


              <div className="space-y-1">

                {attachments.map(
                  (attachment) => (
                    <div
                      key={attachment.id}
                      className="
                        group
                        flex
                        items-center
                        justify-between
                        rounded-md
                        px-3
                        py-2
                        transition-colors
                        hover:bg-muted/70
                      "
                    >

                      <a
                        href={
                          attachment.publicUrl ??
                          undefined
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="
                          flex
                          min-w-0
                          items-center
                          gap-3
                          text-sm
                          hover:underline
                        "
                      >

                        <span className="
                          flex
                          size-8
                          shrink-0
                          items-center
                          justify-center
                          rounded
                          bg-muted
                        ">
                          <FileText className="size-4 text-muted-foreground" />
                        </span>

                        <span className="truncate">
                          {
                            attachment.originalName
                          }
                        </span>

                      </a>


                      <button
                        type="button"
                        onClick={() =>
                          removeAtt.mutate(
                            attachment.id
                          )
                        }
                        className="
                          flex
                          size-7
                          shrink-0
                          items-center
                          justify-center
                          rounded
                          text-muted-foreground
                          opacity-0
                          transition-all
                          hover:bg-muted
                          hover:text-destructive
                          group-hover:opacity-100
                        "
                        title="Remove"
                      >
                        <Trash2 className="size-3.5" />
                      </button>

                    </div>
                  )
                )}


                {attachments.length === 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    disabled={
                      upload.isPending
                    }
                    className="
                      flex
                      w-full
                      items-center
                      justify-center
                      gap-2
                      rounded-md
                      border
                      border-dashed
                      py-6
                      text-sm
                      text-muted-foreground
                      transition-colors
                      hover:bg-muted/50
                      hover:text-foreground
                    "
                  >
                    <Paperclip className="size-4" />

                    Add a file
                  </button>
                )}

              </div>


              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(
                    e.target.files ?? []
                  );

                  files.forEach((file) =>
                    handleFile(file)
                  );

                  e.target.value = "";
                }}
              />

            </section>


            {/* -------------------------------------------------
                COMMENTS
            ------------------------------------------------- */}

            <section className="mb-20">

              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">

                <Users className="size-4" />

                <span>Comments</span>

              </div>

              <textarea
                value={comments}
                onChange={(e) =>
                  setComments(e.target.value)
                }
                onBlur={() =>
                  saveText(
                    "comments",
                    comments,
                    "Comments saved"
                  )
                }
                placeholder="Add a comment or write something..."
                rows={5}
                className="
                  w-full
                  resize-none
                  border-0
                  bg-transparent
                  p-0
                  text-[15px]
                  leading-7
                  outline-none
                  placeholder:text-muted-foreground/50
                  focus:ring-0
                "
              />

            </section>


            {/* -------------------------------------------------
                FOOTER
            ------------------------------------------------- */}

            <div className="border-t pt-5 text-xs text-muted-foreground">
              {update.isPending
                ? "Saving changes..."
                : "All changes saved"}
            </div>

          </div>

        </main>

      </div>
    </div>
  );
}