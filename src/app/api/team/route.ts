import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAuthz } from "@/lib/authz";

const querySchema = z.object({
  role: z.enum(["owner", "member"]).optional(),
  search: z.string().max(100).optional(),
});

/**
 * Only the global owner or users who own at least one workspace may list the
 * whole team (for member management). Everyone else sees only themselves —
 * never the full roster.
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
    const isManager =
      authz.isGlobalOwner ||
      Array.from(authz.memberships.values()).some((r) => r === "owner");

    const team = isManager
      ? await db.select().from(users).orderBy(asc(users.fullName))
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
