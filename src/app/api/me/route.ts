import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAuthz } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeUrl } from "@/lib/security";

export async function GET() {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({ fullName: users.fullName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, authz.userId))
    .limit(1);

  return NextResponse.json({
    data: {
      userId: authz.userId,
      email: authz.email,
      fullName: row?.fullName ?? null,
      avatarUrl: row?.avatarUrl ?? null,
      isGlobalOwner: authz.isGlobalOwner,
      roles: Object.fromEntries(authz.memberships),
    },
  });
}

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(80),
  avatarUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .refine((v) => v == null || v === "" || sanitizeUrl(v) != null, {
      message: "Avatar URL must be a valid http(s) link",
    }),
});

/**
 * Every user may update only their own profile (name, avatar). Writes the
 * Supabase user_metadata too so the sidebar and avatar renderers stay in sync.
 */
export async function PATCH(request: Request) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { fullName, avatarUrl } = parsed.data;
  const resolvedAvatar = avatarUrl && avatarUrl !== "" ? avatarUrl : null;

  try {
    await db
      .update(users)
      .set({ fullName, avatarUrl: resolvedAvatar })
      .where(eq(users.id, authz.userId));

    const admin = createAdminClient();
    const {
      data: { user },
    } = await admin.auth.getUser(authz.userId);
    await admin.auth.admin.updateUserById(authz.userId, {
      user_metadata: {
        ...(user?.user_metadata ?? {}),
        full_name: fullName,
        avatar_url: resolvedAvatar,
      },
    });

    return NextResponse.json({
      data: { userId: authz.userId, fullName, avatarUrl: resolvedAvatar },
    });
  } catch (error) {
    console.error("Failed to update profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}