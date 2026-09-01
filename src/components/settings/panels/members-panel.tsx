"use client";

import { useState } from "react";
import { UserPlus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  useAddMember,
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
  const { data, isLoading, isError } = useWorkspaceMembers(wsId || null);
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
        {canManage ? (
          <AddMember workspaceId={wsId} />
        ) : (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            You can view this workspace&apos;s members. Only the workspace owner
            can add or remove members.
          </p>
        )}

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

function AddMember({ workspaceId }: { workspaceId: string }) {
  const add = useAddMember(workspaceId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
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
        disabled={!email.trim() || add.isPending}
        onClick={() =>
          add.mutate(
            { email: email.trim(), role },
            {
              onSuccess: () => {
                setEmail("");
                setMsg({ ok: true, text: `${email.trim()} added as ${role}.` });
              },
              onError: (e) =>
                setMsg({ ok: false, text: e.message || "Failed to add member" }),
            }
          )
        }
      >
        {add.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <UserPlus className="size-4" />
        )}
        Add
      </Button>
      {msg && (
        <p className={`py-1 text-sm ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
