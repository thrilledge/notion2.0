"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const roleStyle: Record<string, string> = {
  owner: "bg-red-500/15 text-red-600 dark:text-red-400",
  member: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent capitalize",
        roleStyle[role.toLowerCase()] ?? ""
      )}
    >
      {role.toLowerCase()}
    </Badge>
  );
}

export const ROLES = ["owner", "member"] as const;

export function canManageWorkspace(
  me: { isGlobalOwner: boolean; roles: Record<string, string> } | undefined,
  workspaceId: string
): boolean {
  if (!me) return false;
  if (me.isGlobalOwner) return true;
  return me.roles[workspaceId] === "owner";
}
