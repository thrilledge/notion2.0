"use client";

import Link from "next/link";
import { Loader2, RotateCcw, Trash2, Trash } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useTrashedProjects,
  useProjectAction,
  useDeleteProject,
} from "@/hooks/use-projects";

export function TrashClient() {
  const { data, isLoading, isError } = useTrashedProjects();
  const action = useProjectAction();
  const del = useDeleteProject();

  const projects = data?.data ?? [];

  const restore = (id: string) =>
    action.mutate(
      { id, action: "restore" },
      { onSuccess: () => toast.success("Restored"), onError: (e) => toast.error(e.message) }
    );

  const remove = (id: string) =>
    del.mutate(id, {
      onSuccess: () => toast.success("Deleted forever"),
      onError: (e) => toast.error(e.message ?? "Failed to delete forever"),
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Trash className="size-7" />
          Trash
        </h1>
        <p className="text-muted-foreground">
          Projects in trash can be restored or deleted permanently.
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="space-y-2 py-3">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={4} className="py-4 text-center text-sm text-destructive">
                  Failed to load trash.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && projects.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Trash is empty.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              !isError &&
              projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium hover:underline">
                    <Link href={`/projects/${p.id}`}>{p.name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.type === "client" ? "Project" : "Side project"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.status}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => restore(p.id)}
                        disabled={action.isPending}
                      >
                        <RotateCcw className="size-4" />
                        Restore
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Delete forever"
                        onClick={() => remove(p.id)}
                        disabled={del.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
