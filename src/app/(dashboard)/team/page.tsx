import { redirect } from "next/navigation";
import { getAuthz } from "@/lib/authz";
import { TeamAdmin } from "@/components/team/team-admin";

export default async function TeamPage() {
  const authz = await getAuthz();
  if (!authz) redirect("/login");

  const canManage =
    authz.isGlobalOwner ||
    Array.from(authz.memberships.values()).some((r) => r === "owner");

  if (!canManage) redirect("/");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team & Workspaces</h1>
        <p className="text-muted-foreground">
          Manage workspaces, members, roles, and project assignments.
        </p>
      </div>
      <TeamAdmin />
    </div>
  );
}
