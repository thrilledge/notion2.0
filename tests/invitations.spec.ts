import { test, expect, MEMBER_EMAIL } from "./helpers";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Direct DB access for asserting on invitations/memberships. DATABASE_URL is
// quoted inside .env.local, so we strip surrounding quotes.
const sql = postgres(
  (process.env.DATABASE_URL ?? "").replace(/^"|"$/g, ""),
  { max: 1 }
);

test.afterAll(async () => {
  await sql.end();
});

test.describe("workspace invitations", () => {
  test("owner can invite a brand-new user and a pending invitation is stored", async ({
    ownerPage,
  }) => {
    const page = ownerPage;
    const freshEmail = `invite-${Date.now()}@test.local`;

    await page.goto("/settings/members");
    await page.getByPlaceholder("Email address").waitFor();

    await page.getByPlaceholder("Email address").fill(freshEmail);
    await page.getByRole("button", { name: "Invite" }).click();

    // A success message confirms the invitation was stored. The first hit to a
    // newly compiled dev route can take a few seconds, so allow extra time.
    await expect(
      page.getByText(/added to Thrill Edge Technologies/)
    ).toBeVisible({ timeout: 20000 });

    // A pending (unaccepted) invitation row must exist.
    const pending = await sql`
      select * from invitations where email = ${freshEmail} and accepted_at is null
    `;
    expect(pending.length).toBe(1);

    // Not a member yet (they haven't signed up).
    const memberships = await sql`
      select wm.* from workspace_members wm
      join users u on u.id = wm.user_id where u.email = ${freshEmail}
    `;
    expect(memberships.length).toBe(0);

    // Clean up
    await sql`delete from invitations where email = ${freshEmail}`;
  });

  test("invited user is automatically added as a member when they sign in", async ({
    memberPage,
  }) => {
    const page = memberPage;

    // Ensure there's a pending invitation for the existing member account in
    // the real workspace (Thrill Edge Technologies), then remove any existing
    // membership so the claim is observable.
    const [workspace] = await sql`select id from workspaces limit 1`;
    const [member] = await sql`select id from users where email = ${MEMBER_EMAIL}`;
    expect(workspace).toBeTruthy();
    expect(member).toBeTruthy();

    await sql`delete from workspace_members where user_id = ${member.id}`.catch(
      () => {}
    );
    await sql`insert into invitations (workspace_id, email, role) values (${workspace.id}, ${MEMBER_EMAIL}, 'member') on conflict do nothing`;

    // Signing in loads the dashboard which runs syncUser -> claim invitations.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // The member should now have a workspace membership and the invitation
    // should be accepted.
    const membership = await sql`
      select 1 from workspace_members where user_id = ${member.id}
    `;
    expect(membership.length).toBe(1);

    const accepted = await sql`
      select accepted_at from invitations
      where email = ${MEMBER_EMAIL} order by created_at desc limit 1
    `;
    expect(accepted[0]?.accepted_at).toBeTruthy();

    // Clean up: remove the test membership and invitation.
    await sql`delete from workspace_members where user_id = ${member.id}`;
    await sql`delete from invitations where email = ${MEMBER_EMAIL}`;
  });

  test("team page shows pending invitation for a brand-new user", async ({
    ownerPage,
  }) => {
    const page = ownerPage;
    const freshEmail = `pending-${Date.now()}@test.local`;

    await page.goto("/team");
    await page.getByPlaceholder("person@example.com").waitFor();

    await page.getByPlaceholder("person@example.com").fill(freshEmail);
    await page.getByRole("button", { name: "Invite" }).click();

    // The invite feedback should render, then a pending-invitations section
    // should appear with the invited email.
    await expect(
      page.getByText(/Invitation saved for/)
    ).toBeVisible({ timeout: 20000 });

    const pendingRow = page.getByText(freshEmail).first();
    await expect(pendingRow).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("Pending invitations", { exact: true })
    ).toBeVisible();

    // Clean up
    await sql`delete from invitations where email = ${freshEmail}`;
  });

  test("newly added member appears in the assignment picker without reload", async ({
    ownerPage,
  }) => {
    const page = ownerPage;

    // The existing member account (member@test.local) may not currently belong
    // to the real workspace. Ensure a clean, unambiguous state: remove them,
    // then re-add via the Team invite form.
    const [workspace] = await sql`select id from workspaces limit 1`;
    const [member] = await sql`select id from users where email = ${MEMBER_EMAIL}`;
    expect(workspace).toBeTruthy();
    expect(member).toBeTruthy();
    await sql`delete from workspace_members where user_id = ${member.id} and workspace_id = ${workspace.id}`.catch(
      () => {}
    );
    await sql`delete from invitations where email = ${MEMBER_EMAIL}`;

    await page.goto("/team");
    await page.getByPlaceholder("person@example.com").waitFor();
    await page.getByPlaceholder("person@example.com").fill(MEMBER_EMAIL);
    await page.getByRole("button", { name: "Invite" }).click();

    // Adding an existing account produces the "already has an account" message.
    await expect(
      page.getByText(/already has an account/)
    ).toBeVisible({ timeout: 20000 });

    // Without reloading, the AssignmentsPanel "Select user" dropdown should
    // now include the freshly added member so they can be assigned projects.
    const select = page.getByRole("combobox").last();
    await select.click();
    await expect(page.getByText(MEMBER_EMAIL)).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");

    // Clean up
    await sql`delete from workspace_members where user_id = ${member.id} and workspace_id = ${workspace.id}`.catch(
      () => {}
    );
  });
});
