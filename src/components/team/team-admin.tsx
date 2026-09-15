"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  UserPlus,
  Save,
  Trash2,
  Loader2,
  Building2,
  Clock,
  X,
  Folder,
  FolderPlus,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useWorkspaces,
  useWorkspaceMembers,
  useInviteMember,
  useWorkspaceInvitations,
  useRevokeInvitation,
  useSetRole,
  useRemoveMember,
  useCreateWorkspace,
  useFolderAccess,
  useSetFolderAccess,
  useFolders,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  type WorkspaceMemberRow,
  type WorkspaceInvitation,
  type FolderRow,
} from "@/hooks/use-admin";
import { useProjects } from "@/hooks/use-projects";
import { useHostingClients } from "@/hooks/use-hosting";

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const roleBadge: Record<string, string> = {
  owner: "bg-red-500/15 text-red-600 dark:text-red-400",
  member: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

export function TeamAdmin() {
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const workspaces = useWorkspaces();

  const rows = workspaces.data ?? [];
  const selectedId = workspaceId || rows[0]?.id || "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Workspace</label>
          <Select value={selectedId} onValueChange={setWorkspaceId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {rows.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} ({w.memberCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CreateWorkspace />
      </div>

      {selectedId ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <MembersPanel workspaceId={selectedId} />
          <FolderAccessPanel workspaceId={selectedId} />
          <FoldersPanel workspaceId={selectedId} />
        </div>
      ) : (
        <div className="rounded-md border p-6 text-center text-muted-foreground">
          No workspaces available.
        </div>
      )}
    </div>
  );
}

function CreateWorkspace() {
  const create = useCreateWorkspace();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Building2 className="size-4" /> New Workspace
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Create workspace</DialogTitle>
        <Input
          placeholder="Workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end gap-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MembersPanel({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, isError } = useWorkspaceMembers(workspaceId);
  const members = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Members</CardTitle>
        <Badge variant="secondary">{members.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <AddMember workspaceId={workspaceId} />
        {isLoading && <Skeleton className="h-40 w-full" />}
        {isError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load members.
          </div>
        )}
        {!isLoading && !isError && (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-20 text-center text-muted-foreground"
                    >
                      No members yet.
                    </TableCell>
                  </TableRow>
                )}
                {members.map((m) => (
                  <MemberRow key={m.userId} member={m} workspaceId={workspaceId} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <PendingInvites workspaceId={workspaceId} />
      </CardContent>
    </Card>
  );
}

function PendingInvites({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useWorkspaceInvitations(workspaceId);
  const revoke = useRevokeInvitation(workspaceId);
  const invites = data ?? [];

  if (isLoading) return null;
  if (invites.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/30">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Clock className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Pending invitations</span>
        <Badge variant="secondary" className="ml-auto">
          {invites.length}
        </Badge>
      </div>
      <ul className="divide-y">
        {invites.map((invite) => (
          <PendingInviteRow
            key={invite.id}
            invite={invite}
            revokingId={revoke.isPending ? revoke.variables : null}
            onRevoke={() => revoke.mutate(invite.id)}
          />
        ))}
      </ul>
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Invited people are added as members automatically once they create an
        account. They become grantable at that point.
      </p>
    </div>
  );
}

function PendingInviteRow({
  invite,
  revokingId,
  onRevoke,
}: {
  invite: WorkspaceInvitation;
  revokingId: string | null;
  onRevoke: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-medium">{invite.email}</div>
        <div className="text-xs text-muted-foreground">
          <span className="capitalize">{invite.role}</span>
          {invite.invitedBy ? ` · by ${invite.invitedBy}` : ""}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRevoke}
        disabled={revokingId === invite.id}
        title="Revoke invitation"
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        {revokingId === invite.id ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <X className="size-4" />
        )}
      </Button>
    </li>
  );
}

function MemberRow({
  member,
  workspaceId,
}: {
  member: WorkspaceMemberRow;
  workspaceId: string;
}) {
  const setRole = useSetRole(workspaceId);
  const remove = useRemoveMember(workspaceId);
  const [role, setRoleState] = useState<string>(member.role);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarImage src={member.avatarUrl ?? ""} alt="" />
            <AvatarFallback>{initials(member.fullName)}</AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <div className="font-medium">
              {member.fullName ?? "Unknown"}
            </div>
            <div className="text-xs text-muted-foreground">
              {member.email}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Select
            value={role}
            onValueChange={(v) => {
              setRoleState(v);
              setRole.mutate({ userId: member.userId, role: v });
            }}
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["owner", "member"].map((r) => (
                <SelectItem key={r} value={r}>
                  <span className={`capitalize ${roleBadge[r] ?? ""}`}>{r}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TableCell>
      <TableCell>
        {remove.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => remove.mutate(member.userId)}
            title="Remove from workspace"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function AddMember({ workspaceId }: { workspaceId: string }) {
  const invite = useInviteMember(workspaceId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="person@example.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["owner", "member"].map((r) => (
              <SelectItem key={r} value={r} className="capitalize">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!email.trim() || invite.isPending || !workspaceId}
          onClick={() => {
            invite.mutate(
              { email: email.trim(), role },
              {
                onSuccess: (res) => {
                  const message =
                    (res?.data?.message as string) ??
                    `${email.trim()} added to the workspace.`;
                  setEmail("");
                  setMsg({ ok: true, text: message });
                },
                onError: (e) =>
                  setMsg({ ok: false, text: e.message || "Failed to invite" }),
              }
            );
          }}
        >
          {invite.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          Invite
        </Button>
      </div>
      {msg && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            msg.ok
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {msg.text}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Existing users are added instantly. New users are sent an invite and
        automatically join when they create an account.
      </p>
    </div>
  );
}

function FolderAccessPanel({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, isError } = useFolderAccess(workspaceId);
  const setFolderAccess = useSetFolderAccess(workspaceId);

  const folders = data?.folders ?? [];
  const users = data?.users ?? [];

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, Set<string>>>({});
  const [dirtyUserId, setDirtyUserId] = useState<string>("");

  const activeUser = users.find((u) => u.id === selectedUserId) ?? users[0];

  const selectionFor = (userId: string) => {
    return (
      drafts[userId] ??
      new Set(
        users.find((u) => u.id === userId)?.grantedFolderIds ?? []
      )
    );
  };

  const activeSelection = activeUser
    ? selectionFor(activeUser.id)
    : new Set<string>();
  const isDirty = activeUser?.id != null && dirtyUserId === activeUser.id;

  const toggleFolder = (folderId: string) => {
    if (!activeUser) return;
    const next = new Set(selectionFor(activeUser.id));
    if (next.has(folderId)) next.delete(folderId);
    else next.add(folderId);
    setDrafts((prev) => ({ ...prev, [activeUser.id]: next }));
    setDirtyUserId(activeUser.id);
  };

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  if (isError)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Failed to load folder access.
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Folder Access</CardTitle>
          <Cloud className="size-4 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">
          Grant folders to each member. Owners always see everything; members
          only see the folders you grant here.
        </p>
        <Select
          value={activeUser?.id ?? ""}
          onValueChange={(v) => setSelectedUserId(v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName ?? u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeUser && (
          <>
            <div className="space-y-1">
              {folders.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No folders in this workspace yet.
                </p>
              )}
              {folders.map((folder) => {
                const granted = activeSelection.has(folder.id);
                return (
                  <button
                    type="button"
                    key={folder.id}
                    onClick={() => toggleFolder(folder.id)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      granted ? "border-primary/40 bg-primary/5" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Folder className="size-4 text-muted-foreground" />
                      {folder.name}
                      {folder.code && (
                        <Badge variant="outline" className="text-[10px]">
                          system
                        </Badge>
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {granted ? "Granted" : "Hidden"}
                      <span>{granted ? "✓" : "—"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-xs text-muted-foreground">
                {activeUser.fullName ?? activeUser.email} ·{" "}
                {activeSelection.size} of {folders.length} folders granted
              </span>
              <Button
                disabled={!activeUser || setFolderAccess.isPending || !isDirty}
                onClick={() =>
                  activeUser &&
                  setFolderAccess.mutate(
                    {
                      userId: activeUser.id,
                      folderIds: Array.from(activeSelection),
                    },
                    {
                      onSuccess: () => {
                        setDirtyUserId("");
                        setDrafts((prev) => {
                          const next = { ...prev };
                          delete next[activeUser.id];
                          return next;
                        });
                        toast.success("Folder access updated");
                      },
                    }
                  )
                }
              >
                {setFolderAccess.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FoldersPanel({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, isError } = useFolders(workspaceId);
  const createFolder = useCreateFolder(workspaceId);
  const updateFolder = useUpdateFolder(workspaceId);
  const deleteFolder = useDeleteFolder(workspaceId);

  const folders = data ?? [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FolderRow | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Folders</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          <FolderPlus className="size-4" /> New Folder
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Custom folders group projects or hosting clients and appear in the
          sidebar for everyone you grant access to.
        </p>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {isError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load folders.
          </div>
        )}
        {!isLoading && !isError && (
          <div className="space-y-1">
            {folders.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No folders yet. Create one to start grouping projects.
              </p>
            )}
            {folders.map((folder) => (
              <FolderRowItem
                key={folder.id}
                folder={folder}
                isSystem={!!folder.code}
                onEdit={() => setEditing(folder)}
                onDelete={() => {
                  if (
                    window.confirm(
                      `Delete folder "${folder.name}"? Projects inside it are not deleted.`
                    )
                  ) {
                    deleteFolder.mutate(folder.id, {
                      onSuccess: () => toast.success("Folder deleted"),
                    });
                  }
                }}
              />
            ))}
          </div>
        )}
      </CardContent>

      {creating && (
        <FolderDialog
          workspaceId={workspaceId}
          open={creating}
          onOpenChange={(o) => !o && setCreating(false)}
          mode="create"
          createFolder={createFolder}
        />
      )}
      {editing && (
        <FolderDialog
          workspaceId={workspaceId}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          mode="edit"
          folder={editing}
          updateFolder={updateFolder}
        />
      )}
    </Card>
  );
}

function FolderRowItem({
  folder,
  isSystem,
  onEdit,
  onDelete,
}: {
  folder: { id: string; name: string; kind: string; code: string | null };
  isSystem: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <Folder className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{folder.name}</span>
        {isSystem && (
          <Badge variant="outline" className="text-[10px]">
            system
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px]">
          {folder.kind === "project" ? "projects" : "hosting clients"}
        </Badge>
      </div>
      {!isSystem && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="Edit" onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function FolderDialog({
  workspaceId,
  open,
  onOpenChange,
  mode,
  folder,
  createFolder,
  updateFolder,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  folder?: FolderRow;
  createFolder?: ReturnType<typeof useCreateFolder>;
  updateFolder?: ReturnType<typeof useUpdateFolder>;
}) {
  const isEdit = mode === "edit";
  const [name, setName] = useState(folder?.name ?? "");
  const [kind, setKind] = useState<"project" | "hosting_client">(
    (folder?.kind as "project" | "hosting_client") ?? "project"
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const projects = useProjects(
    isEdit && folder?.kind === "project"
      ? { workspaceId, limit: 1000 }
      : undefined
  );
  const hosting = useHostingClients(
    isEdit && folder?.kind === "hosting_client"
      ? { workspaceId, limit: 100 }
      : undefined
  );

  // For edit mode, load the folder's current members to pre-check them.
  const { data: folderData } = useFolders(isEdit ? workspaceId : null);
  const currentRow = folderData?.find((f) => f.id === folder?.id);

  // Initialize the selection from the folder's current members once loaded.
  useEffect(() => {
    if (!isEdit || !currentRow) return;
    setSelected(
      new Set(
        folder?.kind === "hosting_client"
          ? currentRow.hostingClientIds
          : currentRow.projectIds
      )
    );
  }, [isEdit, currentRow, folder?.kind]);

  const isProjectKind = kind === "project";
  const candidates = isProjectKind
    ? (projects.data?.data ?? [])
    : (hosting.data?.data ?? []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const submit = () => {
    if (!name.trim()) return;
    const members = isProjectKind
      ? { projectIds: Array.from(selected) }
      : { hostingClientIds: Array.from(selected) };
    if (isEdit && folder && updateFolder) {
      updateFolder.mutate(
        { folderId: folder.id, name: name.trim(), ...members },
        {
          onSuccess: () => {
            toast.success("Folder updated");
            onOpenChange(false);
          },
          onError: (e) => toast.error(e.message),
        }
      );
    } else if (createFolder) {
      createFolder.mutate(
        { name: name.trim(), kind, ...members },
        {
          onSuccess: () => {
            toast.success("Folder created");
            onOpenChange(false);
          },
          onError: (e) => toast.error(e.message),
        }
      );
    }
  };

  const pending = (createFolder ?? updateFolder)?.isPending ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit folder "${folder?.name}"` : "New folder"}
          </DialogTitle>
          <DialogDescription>
            {isEdit && folder?.code
              ? "System folders cannot be edited."
              : "Custom folders can hold any projects or hosting clients from this workspace."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Folder name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Design Projects"
            />
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Contains</label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as "project" | "hosting_client")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Projects</SelectItem>
                  <SelectItem value="hosting_client">Hosting clients</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isEdit && folder?.code && null}

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {isProjectKind ? "Projects" : "Hosting clients"}
            </label>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
              {candidates.length === 0 && (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  No {isProjectKind ? "projects" : "hosting clients"} in this
                  workspace.
                </p>
              )}
              {candidates.map((item) => {
                const id = (item as { id: string }).id;
                const label = isProjectKind
                  ? (item as { name: string }).name
                  : (item as { domain: string }).domain;
                const isIncluded = selected.has(id);
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => toggle(id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                      isIncluded ? "bg-primary/5" : ""
                    }`}
                  >
                    <span>{label}</span>
                    <span>{isIncluded ? "✓" : "—"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || pending} onClick={submit}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isEdit ? (
              <>
                <Save className="size-4" /> Save
              </>
            ) : (
              <>
                <FolderPlus className="size-4" /> Create
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}