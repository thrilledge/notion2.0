"use client";

import { useMemo, useState } from "react";
import {
  Cloud,
  UserPlus,
  Save,
  Trash2,
  Loader2,
  Building2,
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
  useAddMember,
  useSetRole,
  useRemoveMember,
  useCreateWorkspace,
  useAssignments,
  useSetAssignments,
  type WorkspaceMemberRow,
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
          <div className="rounded-md border">
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
      </CardContent>
    </Card>
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
  const add = useAddMember(workspaceId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        placeholder="User email"
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
        disabled={!email.trim() || add.isPending}
        onClick={() => {
          add.mutate(
            { email: email.trim(), role },
            {
              onSuccess: () => {
                setEmail("");
                setMsg({ ok: true, text: "Added." });
              },
              onError: (e) =>
                setMsg({ ok: false, text: e.message || "Failed to add" }),
            }
          );
        }}
      >
        {add.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <UserPlus className="size-4" />
        )}
        Add
      </Button>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-600" : "text-destructive"}`}>
          {msg.text}
        </p>
      )}
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
  const selectionFor = (userId: string) => {
    const existing = drafts[userId];
    if (existing) return existing;
    return new Set(
      projects
        .filter((p) => p.assigneeIds.includes(userId))
        .map((p) => p.id)
    );
  };

  const activeSelection = activeUser ? selectionFor(activeUser.id) : new Set<string>();
  const isDirty = activeUser?.id != null && dirtyUserId === activeUser.id;

  const toggle = (projectId: string) => {
    if (!activeUser) return;
    setDrafts((prev) => {
      const current = new Set(selectionFor(activeUser.id));
      if (current.has(projectId)) current.delete(projectId);
      else current.add(projectId);
      return { ...prev, [activeUser.id]: current };
    });
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
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground">No projects.</p>
          )}
          {projects.map((p) => {
            const selected = activeSelection.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "border-primary/40 bg-primary/5"
                    : "hover:bg-muted"
                }`}
              >
                <span className="truncate">{p.name}</span>
                <Badge
                  variant="secondary"
                  className={selected ? "bg-primary/10 text-primary" : ""}
                >
                  {selected ? "Assigned" : "Unassigned"}
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
