import { test, expect, signIn } from "./helpers";

const BASE = "http://localhost:3000";

test.describe("workspace presence", () => {
  test("heartbeat marks the current user online", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    const wsRes = await page.request.get(`${BASE}/api/workspaces`);
    expect(wsRes.status()).toBe(200);
    const wsBody = await wsRes.json();
    const workspaceId = wsBody.data[0].id;

    const beat = await page.request.post(
      `${BASE}/api/workspaces/${workspaceId}/presence`
    );
    expect(beat.status()).toBe(200);

    let me: { email: string; isOnline?: boolean } | undefined;
    for (let i = 0; i < 10; i++) {
      const membersRes = await page.request.get(
        `${BASE}/api/workspaces/${workspaceId}/members`
      );
      expect(membersRes.status()).toBe(200);
      const membersBody = await membersRes.json();
      me = membersBody.data.find(
        (m: { email: string }) => m.email === "owner@test.local"
      );
      if (me?.isOnline) break;
      await page.waitForTimeout(1000);
    }
    expect(me).toBeTruthy();
    expect(me!.isOnline).toBe(true);
  });

  test("members settings shows online status", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    await page.goto("/settings/members");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("online").first()).toBeVisible({ timeout: 10000 });
  });
});