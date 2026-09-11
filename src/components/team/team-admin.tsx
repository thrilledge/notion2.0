"use client";

import { useMemo, useState } from "react";
import {
  Cloud,
  UserPlus,
  Save,
  Trash2,
  Loader2,
  Building2,
  Clock,
  X,
} from "lucide-react";
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
  useAssignments,
  useSetAssignments,
  type WorkspaceMemberRow,
  type WorkspaceInvitation,
} from "@/hooks/use-admin";

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

const TEAM_PROJECT_FOLDERS = [
  { key: "client", label: "All Projects" },
  { key: "side_project", label: "Side Projects" },
];

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
          <AssignmentsPanel workspaceId={selectedId} />
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
        account. They become assignable at that point.
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

function AssignmentsPanel({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, isError } = useAssignments(workspaceId);
  const setAssignments = useSetAssignments(workspaceId);

  const projects = useMemo(() => data?.projects ?? [], [data]);
  const users = useMemo(() => data?.users ?? [], [data]);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  // Per-user draft selection, keeps each user's pending state independently.
  const [drafts, setDrafts] = useState<Record<string, Set<string>>>({});
  const [dirtyUserId, setDirtyUserId] = useState<string>("");

  const activeUser = users.find((u) => u.id === selectedUserId) ?? users[0];

  // Effective selection for a user: draft if present, else their real assignees.
  const selectionFrom = (
    userId: string,
    draftsMap: Record<string, Set<string>>
  ) => {
    const existing = draftsMap[userId];
    if (existing) return existing;
    return new Set(
      projects
        .filter((p) => p.assigneeIds.includes(userId))
        .map((p) => p.id)
    );
  };

  const selectionFor = (userId: string) => selectionFrom(userId, drafts);

  const activeSelection = activeUser ? selectionFor(activeUser.id) : new Set<string>();
  const isDirty = activeUser?.id != null && dirtyUserId === activeUser.id;

  const applyFor = (
    userId: string,
    compute: (current: Set<string>) => Set<string>
  ) => {
    setDrafts((prev) => {
      const current = selectionFrom(userId, prev);
      return { ...prev, [userId]: compute(current) };
    });
    setDirtyUserId(userId);
  };

  const toggleFolder = (key: string) => {
    if (!activeUser) return;
    const ids = projects.filter((p) => p.type === key).map((p) => p.id);
    if (ids.length === 0) return;
    applyFor(activeUser.id, (current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => current.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!activeUser) return;
    applyFor(activeUser.id, () => new Set(projects.map((p) => p.id)));
  };

  const clearAll = () => {
    if (!activeUser) return;
    applyFor(activeUser.id, () => new Set());
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
          Failed to load assignments.
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Project Assignments</CardTitle>
          <Cloud className="size-4 text-muted-foreground" />
        </div>
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
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {activeSelection.size} of {projects.length} projects assigned
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!activeUser || projects.length === 0}
              onClick={selectAll}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!activeUser || projects.length === 0}
              onClick={clearAll}
            >
              Clear all
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          {TEAM_PROJECT_FOLDERS.map((folder) => {
            const ids = projects
              .filter((p) => p.type === folder.key)
              .map((p) => p.id);
            if (ids.length === 0) return null;
            const count = ids.filter((id) => activeSelection.has(id)).length;
            return (
              <button
                type="button"
                key={folder.key}
                onClick={() => toggleFolder(folder.key)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                  count === ids.length && ids.length > 0
                    ? "border-primary/40 bg-primary/5"
                    : ""
                }`}
              >
                <span className="font-medium">{folder.label}</span>
                <Badge
                  variant="secondary"
                  className={count === ids.length ? "bg-primary/10 text-primary" : ""}
                >
                  {count === ids.length
                    ? "All selected"
                    : count > 0
                      ? `${count} of ${ids.length}`
                      : "None"}
                </Badge>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {activeUser?.fullName ?? activeUser?.email} · {activeSelection.size}{" "}
            assigned
          </span>
          <Button
            disabled={!activeUser || setAssignments.isPending || !isDirty}
            onClick={() =>
              activeUser &&
              setAssignments.mutate(
                {
                  userId: activeUser.id,
                  projectIds: Array.from(activeSelection),
                },
                {
                  onSuccess: () => {
                    setDirtyUserId("");
                    setDrafts((prev) => {
                      const next = { ...prev };
                      delete next[activeUser.id];
                      return next;
                    });
                  },
                }
              )
            }
          >
            {setAssignments.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
