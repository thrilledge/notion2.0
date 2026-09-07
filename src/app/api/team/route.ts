import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { getAuthz } from "@/lib/authz";

const querySchema = z.object({
  role: z.enum(["owner", "member"]).optional(),
  search: z.string().max(100).optional(),
});

/**
 * Team listing is scoped to the caller's reach:
 * - the global owner may list every user;
 * - workspace owners may list the users of the workspaces they own;
 * - everyone else sees only themselves — never the full roster.
 */
export async function GET(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 }
    );
  }

  try {
    const managedWorkspaceIds = Array.from(authz.memberships.entries())
      .filter(([, role]) => role === "owner")
      .map(([id]) => id);

    let scopeIds: string[] | null = null;
    if (authz.isGlobalOwner) {
      scopeIds = null; // all users
    } else if (managedWorkspaceIds.length > 0) {
      const rows = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(inArray(workspaceMembers.workspaceId, managedWorkspaceIds));
      scopeIds = Array.from(new Set(rows.map((r) => r.userId)));
    }

    const team =
      scopeIds === null
        ? await db.select().from(users).orderBy(asc(users.fullName))
        : scopeIds.length > 0
          ? await db
              .select()
              .from(users)
              .where(inArray(users.id, scopeIds))
              .orderBy(asc(users.fullName))
          : await db
              .select()
              .from(users)
              .where(eq(users.id, authz.userId))
              .limit(1);

    return NextResponse.json({ data: team });
  } catch (error) {
    console.error("Failed to fetch team:", error);
    return NextResponse.json(
      { error: "Failed to fetch team" },
      { status: 500 }
    );
  }
}
