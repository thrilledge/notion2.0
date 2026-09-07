import { test, expect, signIn } from "./helpers";

const BASE = "http://localhost:3000";

test.describe("Workspaces", () => {
  let workspaceId: string | null = null;
  const wsName = `QA_TEST_WS_${Date.now()}`;

  test.describe("Create", () => {
    test("creates workspace via API", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/workspaces`, {
        data: { name: wsName },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      workspaceId = body.data?.id || body.data?.workspace?.id;
    });

    test("workspace appears in list", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/workspaces`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    });
  });

  test.describe("Read", () => {
    test("workspaces API returns data", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/workspaces`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  test.describe("Update", () => {
    test("renames workspace via API", async ({ page }) => {
      if (!workspaceId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/workspaces/${workspaceId}`, {
        data: { name: `${wsName}_RENAMED` },
      });
      expect(res.status()).toBe(200);
    });
  });

  test.describe("Members", () => {
    test("lists members", async ({ page }) => {
      if (!workspaceId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/workspaces/${workspaceId}/members`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    });

    test("owner is in member list", async ({ page }) => {
      if (!workspaceId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/workspaces/${workspaceId}/members`);
      const body = await res.json();
      const owner = body.data.find((m: any) => m.role === "owner");
      expect(owner).toBeTruthy();
    });

    test("rejects adding member with invalid email", async ({ page }) => {
      if (!workspaceId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/workspaces/${workspaceId}/members`, {
        data: { email: "not-an-email" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects adding non-existent user", async ({ page }) => {
      if (!workspaceId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/workspaces/${workspaceId}/members`, {
        data: { email: "nonexistent_user_xyz@test.local" },
      });
      expect(res.status()).toBe(400);
    });

    test("cannot demote last owner", async ({ page }) => {
      if (!workspaceId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const membersRes = await page.request.get(
        `${BASE}/api/workspaces/${workspaceId}/members`
      );
      const membersBody = await membersRes.json();
      const owner = membersBody.data.find((m: any) => m.role === "owner");
      if (owner) {
        const res = await page.request.patch(
          `${BASE}/api/workspaces/${workspaceId}/members/${owner.userId}`,
          { data: { role: "member" } }
        );
        expect(res.status()).toBe(400);
      }
    });
  });

  test.describe("Edge Cases", () => {
    test("rejects workspace with empty name", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/workspaces`, {
        data: { name: "" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects workspace with name > 255 chars", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/workspaces`, {
        data: { name: "A".repeat(256) },
      });
      expect(res.status()).toBe(400);
    });

    test("unauthenticated cannot list workspaces", async ({ unauthPage: page }) => {
      const res = await page.request.get(`${BASE}/api/workspaces`);
      expect(res.status()).toBe(401);
    });
  });

  test.describe("Delete", () => {
    test("deletes workspace via API", async ({ page }) => {
      if (!workspaceId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.delete(`${BASE}/api/workspaces/${workspaceId}`);
      expect(res.status()).toBe(200);
    });
  });

  test.describe("Team Page (Owner)", () => {
    test("team page loads for owner", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/team");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      const hasContent =
        (await page.getByText(/workspace|member|team/i).count()) > 0;
      expect(hasContent).toBeTruthy();
    });
  });
});
