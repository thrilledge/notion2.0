"use client";

import { useState } from "react";
import { UserPlus, Trash2, Loader2, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import { useWorkspaces, useCurrentUser } from "@/hooks/use-admin";
import {
  useWorkspaceMembers,
  usePresenceHeartbeat,
  useInviteMember,
  useWorkspaceInvitations,
  useRevokeInvitation,
  useSetRole,
  useRemoveMember,
  type WorkspaceMemberRow,
} from "@/hooks/use-admin";
import { WorkspacePicker, SettingsCard } from "@/components/settings/settings-card";
import { initials, RoleBadge, ROLES, canManageWorkspace } from "@/components/settings/settings-ui";

export function MembersPanel() {
  const { data: workspaces } = useWorkspaces();
  const { data: me } = useCurrentUser();
  const [workspaceId, setWorkspaceId] = useState("");
  const wsId = workspaceId || workspaces?.[0]?.id || "";
  const isValidWs = !!wsId;
  usePresenceHeartbeat(isValidWs ? wsId : null);
  const { data, isLoading, isError } = useWorkspaceMembers(
    isValidWs ? wsId : null,
    { refetchInterval: 30_000 }
  );
  const members = data ?? [];
  const canManage = canManageWorkspace(me, wsId);

  return (
    <SettingsCard
      title="Members"
      action={
        <WorkspacePicker
          value={wsId}
          onChange={setWorkspaceId}
          workspaces={workspaces}
        />
      }
    >
      <div className="space-y-5">
        {canManage && wsId ? (
          <AddMember workspaceId={wsId} />
        ) : !canManage && wsId ? (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            You can view this workspace&apos;s members. Only the workspace owner
            can add or remove members.
          </p>
        ) : null}

        {isLoading && <Skeleton className="h-40 w-full" />}
        {isError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load members.
          </div>
        )}
        {!isLoading && !isError && (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  {canManage && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 3 : 2}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No members in this workspace yet.
                    </TableCell>
                  </TableRow>
                )}
                {members.map((m) => (
                  <MemberRow
                    key={m.userId}
                    member={m}
                    workspaceId={wsId}
                    canManage={canManage}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {canManage && wsId ? <PendingInvites workspaceId={wsId} /> : null}
      </div>
    </SettingsCard>
  );
}

function MemberRow({
  member,
  workspaceId,
  canManage,
}: {
  member: WorkspaceMemberRow;
  workspaceId: string;
  canManage: boolean;
}) {
  const setRole = useSetRole(workspaceId);
  const remove = useRemoveMember(workspaceId);
  const [role, setRoleState] = useState<string>(member.role);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={member.avatarUrl ?? ""} alt="" />
              <AvatarFallback className="rounded-lg">
                {initials(member.fullName)}
              </AvatarFallback>
            </Avatar>
            <span
              title={member.isOnline ? "Online" : "Offline"}
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background",
                member.isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
              )}
            />
          </div>
          <div className="leading-tight">
            <div className="font-medium">
              {member.fullName ?? "Unknown"}
              <span
                className={cn(
                  "ml-2 text-xs font-normal",
                  member.isOnline
                    ? "text-emerald-600"
                    : "text-muted-foreground"
                )}
              >
                {member.isOnline ? "online" : "offline"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">{member.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
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
      </TableCell>
      {canManage && (
        <TableCell>
          {remove.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              title="Remove from workspace"
              onClick={() => remove.mutate(member.userId)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function PendingInvites({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useWorkspaceInvitations(workspaceId);
  const revoke = useRevokeInvitation(workspaceId);
  const invites = data ?? [];

  if (isLoading) return null;
  if (invites.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/30">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Clock className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Pending invitations</span>
        <Badge variant="secondary" className="ml-auto">
          {invites.length}
        </Badge>
      </div>
      <ul className="divide-y">
        {invites.map((invite) => (
          <li
            key={invite.id}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
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
              onClick={() => revoke.mutate(invite.id)}
              disabled={revoke.isPending && revoke.variables === invite.id}
              title="Revoke invitation"
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              {revoke.isPending && revoke.variables === invite.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddMember({ workspaceId }: { workspaceId: string }) {
  const invite = useInviteMember(workspaceId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Email address"
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
            {ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!email.trim() || invite.isPending || !workspaceId}
          onClick={() =>
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
                  setMsg({
                    ok: false,
                    text: e.message || "Failed to invite member",
                  }),
              }
            )
          }
        >
          {invite.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          Invite
        </Button>
        {msg && (
          <p
            className={`py-1 text-sm ${
              msg.ok ? "text-emerald-600" : "text-destructive"
            }`}
          >
            {msg.text}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        New users receive an email and are automatically added to this
        workspace once they create an account.
      </p>
    </div>
  );
}
