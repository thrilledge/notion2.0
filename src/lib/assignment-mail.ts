import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendAssignmentEmail, buildProjectUrl } from "@/lib/mail";

/**
 * Best-effort: emails every newly-assigned user about a project. No-op
 * (never throws) when SMTP is not configured; failures are logged by the
 * mailer and don't fail the request that triggered them.
 */
export async function notifyProjectAssignees(
  userIds: string[],
  opts: { projectId: string; projectName: string; workspaceName: string }
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  try {
    const rows =
      unique.length > 0
        ? await db
            .select({ id: users.id, email: users.email, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, unique))
        : [];

    await Promise.all(
      rows
        .filter((u) => u.email)
        .map((u) =>
          sendAssignmentEmail({
            to: u.email!,
            userName: u.fullName,
            projectName: opts.projectName,
            workspaceName: opts.workspaceName,
            projectUrl: buildProjectUrl(opts.projectId),
          })
        )
    );
  } catch (error) {
    console.error("Failed to notify project assignees:", error);
  }
}