"use client";

import { useState } from "react";
import { Building2, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  useWorkspaces,
  useCreateWorkspace,
  useRenameWorkspace,
  useCurrentUser,
  type WorkspaceRow,
} from "@/hooks/use-admin";
import { SettingsCard } from "@/components/settings/settings-card";
import { canManageWorkspace } from "@/components/settings/settings-ui";

export function WorkspacesPanel() {
  const { data, isLoading, isError } = useWorkspaces();
  const { data: me } = useCurrentUser();
  const create = useCreateWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const workspaces = data ?? [];

  return (
    <SettingsCard
      title="Workspaces"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="size-4" /> New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create workspace</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Workspace name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!name.trim() || create.isPending}
                onClick={() => {
                  create.mutate(name.trim());
                  setName("");
                  setOpen(false);
                }}
              >
                {create.isPending && <Loader2 className="size-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load workspaces.
        </div>
      )}
      {!isLoading && !isError && (
        <div className="grid gap-3 sm:grid-cols-2">
          {workspaces.length === 0 && (
            <p className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No workspaces yet.
            </p>
          )}
          {workspaces.map((w) => (
            <WorkspaceCard
              key={w.id}
              workspace={w}
              canManage={canManageWorkspace(me, w.id)}
            />
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

function WorkspaceCard({
  workspace,
  canManage,
}: {
  workspace: WorkspaceRow;
  canManage: boolean;
}) {
  const rename = useRenameWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(workspace.name);

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
        <Building2 className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{workspace.name}</p>
        <p className="text-xs text-muted-foreground">
          {workspace.memberCount} members
        </p>
      </div>
      {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" title="Rename workspace">
              <Pencil className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename workspace</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Workspace name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !name.trim() || name.trim() === workspace.name || rename.isPending
                }
                onClick={() => {
                  rename.mutate({ id: workspace.id, name: name.trim() });
                  setOpen(false);
                }}
              >
                {rename.isPending && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Badge variant="secondary" className="hidden sm:inline-flex">
        Workspace
      </Badge>
    </div>
  );
}
