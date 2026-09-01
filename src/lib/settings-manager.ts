import { getAuthz } from "@/lib/authz";

/**
 * True if the current user may administer the app (global Owner or an owner of
 * at least one workspace). Used to gate the Team page.
 */
export async function isManager(): Promise<boolean> {
  const authz = await getAuthz();
  if (!authz) return false;
  if (authz.isGlobalOwner) return true;
  return Array.from(authz.memberships.values()).some((r) => r === "owner");
}
