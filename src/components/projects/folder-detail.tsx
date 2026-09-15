"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useProjects } from "@/hooks/use-projects";
import { useHostingClients } from "@/hooks/use-hosting";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function FolderDetail({
  folder,
}: {
  folder: {
    id: string;
    name: string;
    kind: "project" | "hosting_client";
  };
}) {
  const isProject = folder.kind === "project";
  const projects = useProjects(
    isProject
      ? { folderId: folder.id, limit: 1000, sortBy: "sortOrder" }
      : {},
    { enabled: isProject }
  );
  const hosting = useHostingClients(
    isProject
      ? {}
      : { folderId: folder.id, limit: 100 },
    { enabled: !isProject }
  );
  const isLoading = isProject ? projects.isLoading : hosting.isLoading;
  const isError = isProject ? projects.isError : hosting.isError;
  const rows = isProject ? (projects.data?.data ?? []) : (hosting.data?.data ?? []);

  const counts = useMemo(() => {
    const items: Array<{ status: string }> = rows as Array<{ status: string }>;
    const all = items.length;
    const notStarted = items.filter((p) => p.status === "not_started").length;
    const inProgress = items.filter((p) => p.status === "in_progress").length;
    const done = items.filter((p) => p.status === "done").length;
    return { all, notStarted, inProgress, done };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{folder.name}</h1>
          <p className="text-muted-foreground">
            {counts.all} total · {counts.notStarted} not started ·{" "}
            {counts.inProgress} in progress · {counts.done} done
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {isError && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load folder contents.
        </div>
      )}

      {!isLoading && !isError && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isProject ? "Project" : "Domain"}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="h-24 text-center text-muted-foreground"
                  >
                    This folder is empty.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const href = isProject
                  ? `/projects/${(row as { id: string }).id}`
                  : `/hosting/${(row as { id: string }).id}`;
                return (
                  <TableRow key={(row as { id: string }).id}>
                    <TableCell className="font-medium">
                      <Link href={href} className="hover:underline">
                        {isProject
                          ? (row as { name: string }).name
                          : (row as { domain: string }).domain}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(row as { status: string }).status}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(row as { result: string | null }).result ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}