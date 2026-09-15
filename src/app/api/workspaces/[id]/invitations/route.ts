import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  users,
  workspaces,
  workspaceMembers,
  invitations,
  notifications,
  type WorkspaceRole,
} from "@/lib/db/schema";
import { getAuthz, canManageWorkspace, grantAllFolders } from "@/lib/authz";
import { sendInviteEmail, buildInviteUrl } from "@/lib/mail";

type RouteContext = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "member"]).default("member"),
});

/** List pending (not yet accepted) invitations for a workspace. Manager-only. */
export async function GET(_request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  if (!canManageWorkspace(authz, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        createdAt: invitations.createdAt,
        invitedBy: users.fullName,
      })
      .from(invitations)
      .leftJoin(users, eq(invitations.invitedById, users.id))
      .where(
        and(
          eq(invitations.workspaceId, id),
          isNull(invitations.acceptedAt)
        )
      )
      .orderBy(invitations.createdAt);

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("Failed to fetch invitations:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}

/** Revoke a pending invitation. Manager-only. */
export async function DELETE(_request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const url = new URL(_request.url);
  const invitationId = url.searchParams.get("invitationId");
  if (!invitationId) {
    return NextResponse.json(
      { error: "invitationId is required" },
      { status: 400 }
    );
  }

  if (!canManageWorkspace(authz, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await db
      .delete(invitations)
      .where(
        and(eq(invitations.id, invitationId), eq(invitations.workspaceId, id))
      );
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Failed to revoke invitation:", error);
    return NextResponse.json(
      { error: "Failed to revoke invitation" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, ctx: RouteContext) {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  if (!canManageWorkspace(authz, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const [workspace] = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    if (!workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Does the invitee already have an account?
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      if (existingUser.id === authz.userId) {
        return NextResponse.json(
          { error: "You are already a member of this workspace" },
          { status: 400 }
        );
      }
      await db
        .insert(workspaceMembers)
        .values({
          workspaceId: id,
          userId: existingUser.id,
          role: parsed.data.role as WorkspaceRole,
        })
        .onConflictDoNothing();

      // Existing users auto-added can see the current folders until the owner
      // narrows their access.
      await grantAllFolders(id, existingUser.id);

      await db.insert(notifications).values({
        userId: existingUser.id,
        type: "system",
        title: `Added to ${workspace.name}`,
        body: `You were added to ${workspace.name} by your team`,
        link: "/projects",
      });

      return NextResponse.json(
        {
          data: {
            addedExisting: true,
            message: `${email} already has an account and was added to ${workspace.name}.`,
          },
        },
        { status: 201 }
      );
    }

    // New user: store a pending invitation and email them a signup link.
    const [invitation] = await db
      .insert(invitations)
      .values({
        workspaceId: id,
        email,
        role: parsed.data.role as WorkspaceRole,
        invitedById: authz.userId,
      })
      .returning();

    const inviteUrl = buildInviteUrl(invitation.id);
    const inviter = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, authz.userId))
      .limit(1);

    const emailResult = await sendInviteEmail({
      to: email,
      workspaceName: workspace.name,
      inviterName: inviter[0]?.fullName ?? null,
      inviteUrl,
    });

    if (!emailResult.sent) {
      console.warn(
        `[invite] Email not delivered to ${email}: ${emailResult.reason}`
      );
      return NextResponse.json(
        {
          data: {
            addedExisting: false,
            invited: true,
            emailSent: false,
            message: `Invitation saved for ${email}. They will be added to ${workspace.name} once they create an account. (Email not sent: ${emailResult.reason})`,
          },
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        data: {
          addedExisting: false,
          invited: true,
          emailSent: true,
          message: `Invitation sent to ${email}.`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to send workspace invitation:", error);
    return NextResponse.json(
      { error: "Failed to send invitation" },
      { status: 500 }
    );
  }
}
