"use client";

import { useMemo, useState } from "react";
import { Save, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  useWorkspaces,
  useCurrentUser,
  useWorkspaceMembers,
  useSetRole,
  useAssignments,
  useSetAssignments,
  type WorkspaceMemberRow,
} from "@/hooks/use-admin";
import { WorkspacePicker, SettingsCard } from "@/components/settings/settings-card";
import { initials, RoleBadge, ROLES, canManageWorkspace } from "@/components/settings/settings-ui";

export function AccessPanel() {
  const { data: workspaces } = useWorkspaces();
  const { data: me } = useCurrentUser();
  const [workspaceId, setWorkspaceId] = useState("");
  const wsId = workspaceId || workspaces?.[0]?.id || "";
  const canManage = canManageWorkspace(me, wsId);

  const { data: members, isLoading: membersLoading } = useWorkspaceMembers(
    wsId || null
  );
  const { data: assignmentData, isLoading: assignmentLoading } =
    useAssignments(wsId || null);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const activeMember =
    (members ?? []).find((m) => m.userId === selectedUserId) ??
    (members ?? [])[0];

  const { projects, users } = useMemo(
    () => ({
      projects: assignmentData?.projects ?? [],
      users: assignmentData?.users ?? [],
    }),
    [assignmentData]
  );

  const loading = membersLoading || assignmentLoading;

  if (loading) {
    return (
      <SettingsCard
        title="Access & Permissions"
        action={
          <WorkspacePicker value={wsId} onChange={setWorkspaceId} workspaces={workspaces} />
        }
      >
        <Skeleton className="h-56 w-full" />
      </SettingsCard>
    );
  }

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Members & Access"
        action={
          <WorkspacePicker value={wsId} onChange={setWorkspaceId} workspaces={workspaces} />
        }
      >
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Workspace role</TableHead>
                <TableHead className="text-right">Project access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members ?? []).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No members in this workspace yet.
                  </TableCell>
                </TableRow>
              )}
              {(members ?? []).map((m) => (
                <MemberAccessRow
                  key={m.userId}
                  member={m}
                  workspaceId={wsId}
                  canManage={canManage}
                  projectCount={
                    users.find((u) => u.id === m.userId)
                      ? projects.filter((p) =>
                          p.assigneeIds.includes(m.userId)
                        ).length
                      : 0
                  }
                  isSelected={activeMember?.userId === m.userId}
                  onSelect={() => setSelectedUserId(m.userId)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </SettingsCard>

      {activeMember && (
        <SettingsCard
          title={
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Project access for {activeMember.fullName ?? activeMember.email}
            </span>
          }
        >
          <ProjectAccess
            workspaceId={wsId}
            projectRows={projects}
            userId={activeMember.userId}
            canManage={canManage}
          />
        </SettingsCard>
      )}
    </div>
  );
}

function MemberAccessRow({
  member,
  workspaceId,
  canManage,
  projectCount,
  isSelected,
  onSelect,
}: {
  member: WorkspaceMemberRow;
  workspaceId: string;
  canManage: boolean;
  projectCount: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const setRole = useSetRole(workspaceId);
  const [role, setRoleState] = useState<string>(member.role);

  return (
    <TableRow
      className={isSelected ? "bg-accent/40" : undefined}
      onClick={onSelect}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-8 rounded-lg">
            <AvatarImage src={member.avatarUrl ?? ""} alt="" />
            <AvatarFallback className="rounded-lg">
              {initials(member.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <div className="font-medium">
              {member.fullName ?? "Unknown"}
            </div>
            <div className="text-xs text-muted-foreground">{member.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2"
        >
          {canManage ? (
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
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <RoleBadge role={role} />
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Badge variant="secondary">{projectCount} projects</Badge>
      </TableCell>
    </TableRow>
  );
}

function ProjectAccess({
  workspaceId,
  projectRows,
  userId,
  canManage,
}: {
  workspaceId: string;
  projectRows: { id: string; name: string; assigneeIds: string[] }[];
  userId: string;
  canManage: boolean;
}) {
  const setAssignments = useSetAssignments(workspaceId);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [dirty, setDirty] = useState(false);

  const base = useMemo(
    () =>
      new Set(
        projectRows
          .filter((p) => p.assigneeIds.includes(userId))
          .map((p) => p.id)
      ),
    [projectRows, userId]
  );

  const effective = draft ?? base;
  const isDirty = dirty && draft !== null;

  const toggle = (projectId: string) => {
    if (!canManage) return;
    const next = new Set(draft ?? base);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    setDraft(next);
    setDirty(true);
  };

  if (projectRows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No projects in this workspace yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {projectRows.map((p) => {
          const selected = effective.has(p.id);
          return (
            <div
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                canManage ? "cursor-pointer hover:bg-muted" : "cursor-default"
              } ${selected ? "border-primary/40 bg-primary/5" : ""}`}
            >
              <span className="truncate">{p.name}</span>
              <span className="ml-2 text-sm">
                {selected ? "✓" : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {effective.size} of {projectRows.length} projects accessible
        </span>
        {canManage && (
          <Button
            disabled={setAssignments.isPending || !isDirty}
            onClick={() =>
              setAssignments.mutate(
                {
                  userId,
                  projectIds: Array.from(effective),
                },
                {
                  onSuccess: () => {
                    setDraft(null);
                    setDirty(false);
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
            Save access
          </Button>
        )}
      </div>
    </div>
  );
}
