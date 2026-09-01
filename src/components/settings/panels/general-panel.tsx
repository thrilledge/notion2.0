"use client";

import { Building2, ShieldCheck, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaces, useCurrentUser } from "@/hooks/use-admin";
import { SettingsCard } from "@/components/settings/settings-card";

export function GeneralPanel() {
  const { data, isLoading, isError } = useWorkspaces();
  const { data: me } = useCurrentUser();
  const workspaces = data ?? [];
  const totalMembers = workspaces.reduce((acc, w) => acc + w.memberCount, 0);
  const isOwner = !!me && (me.isGlobalOwner || Object.values(me.roles).includes("owner"));

  return (
    <SettingsCard title="General">
      <div className="space-y-5">
        <div>
          <p className="text-sm text-muted-foreground">
            This is the central place to manage your project management
            workspace — members, roles, and the projects each person can access.
            Use the settings menu on the left to navigate.
          </p>
        </div>

        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load workspace info.
          </div>
        )}
        {!isLoading && !isError && (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              icon={<Building2 className="size-5 text-muted-foreground" />}
              value={workspaces.length}
              label="Workspaces"
            />
            <StatCard
              icon={<Users className="size-5 text-muted-foreground" />}
              value={totalMembers}
              label="Members"
            />
            <StatCard
              icon={<ShieldCheck className="size-5 text-muted-foreground" />}
              value={isOwner ? "Owner" : "Member"}
              label="Your access level"
            />
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}</div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
