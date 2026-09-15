"use client";

import { useState } from "react";
import { Save, Loader2, ShieldCheck, Folder } from "lucide-react";
import { toast } from "sonner";
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
  useFolderAccess,
  useSetFolderAccess,
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
  const { data: folderAccessData, isLoading: accessLoading } =
    useFolderAccess(wsId || null);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const activeMember =
    (members ?? []).find((m) => m.userId === selectedUserId) ??
    (members ?? [])[0];

  const folders = folderAccessData?.folders ?? [];
  const users = folderAccessData?.users ?? [];

  const loading = membersLoading || accessLoading;

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
                <TableHead className="text-right">Folder access</TableHead>
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
              {(members ?? []).map((m) => {
                const u = users.find((u) => u.id === m.userId);
                const count = u?.grantedFolderIds.length ?? 0;
                return (
                  <MemberAccessRow
                    key={m.userId}
                    member={m}
                    workspaceId={wsId}
                    canManage={canManage}
                    folderCount={count}
                    isSelected={activeMember?.userId === m.userId}
                    onSelect={() => setSelectedUserId(m.userId)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      </SettingsCard>

      {activeMember && (
        <SettingsCard
          title={
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Folder access for {activeMember.fullName ?? activeMember.email}
            </span>
          }
        >
          <FolderAccess
            workspaceId={wsId}
            folderRows={folders}
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
  folderCount,
  isSelected,
  onSelect,
}: {
  member: WorkspaceMemberRow;
  workspaceId: string;
  canManage: boolean;
  folderCount: number;
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
        <Badge variant="secondary">{folderCount} folders</Badge>
      </TableCell>
    </TableRow>
  );
}

function FolderAccess({
  workspaceId,
  folderRows,
  userId,
  canManage,
}: {
  workspaceId: string;
  folderRows: { id: string; name: string; kind: string; code: string | null }[];
  userId: string;
  canManage: boolean;
}) {
  const { data } = useFolderAccess(workspaceId);
  const setFolderAccess = useSetFolderAccess(workspaceId);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [dirty, setDirty] = useState(false);

  const currentUser = data?.users.find((u) => u.id === userId);
  const base =
    currentUser?.grantedFolderIds ?? folderRows.map((f) => f.id);

  const effective = draft ?? new Set(base);

  if (folderRows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No folders in this workspace yet.
      </p>
    );
  }

  const toggle = (folderId: string) => {
    if (!canManage) return;
    const next = new Set(effective);
    if (next.has(folderId)) next.delete(folderId);
    else next.add(folderId);
    setDraft(next);
    setDirty(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {effective.size} of {folderRows.length} folders granted
        </span>
      </div>

      <div className="space-y-1">
        {folderRows.map((folder) => {
          const granted = effective.has(folder.id);
          return (
            <button
              type="button"
              key={folder.id}
              onClick={() => toggle(folder.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                granted ? "border-primary/40 bg-primary/5" : ""
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <Folder className="size-4 text-muted-foreground" />
                {folder.name}
                {folder.code && (
                  <span className="text-[10px] uppercase text-muted-foreground">
                    system
                  </span>
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
          {effective.size} of {folderRows.length} folders granted
        </span>
        {canManage && (
          <Button
            disabled={setFolderAccess.isPending || !dirty || draft === null}
            onClick={() =>
              setFolderAccess.mutate(
                {
                  userId,
                  folderIds: Array.from(effective),
                },
                {
                  onSuccess: () => {
                    setDraft(null);
                    setDirty(false);
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
            Save access
          </Button>
        )}
      </div>
    </div>
  );
}