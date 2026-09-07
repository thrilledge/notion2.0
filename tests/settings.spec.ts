import { test, expect, signIn } from "./helpers";

const BASE = "http://localhost:3000";

test.describe("Settings Pages", () => {
  const personalSections = ["profile", "appearance", "notifications", "security"];
  const workspaceSections = ["general", "members", "access", "workspaces", "projects"];

  test.describe("Settings redirect", () => {
    test("/settings redirects to /settings/profile", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/settings");
      await page.waitForTimeout(3000);
      expect(page.url()).toContain("/settings/profile");
    });
  });

  test.describe("Personal sections (owner)", () => {
    for (const section of personalSections) {
      test(`${section} page loads`, async ({ page }) => {
        await signIn(page, "owner@test.local", "TestOwner123!");
        await page.goto(`/settings/${section}`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);
        const body = await page.locator("body").textContent();
        expect(body!.length).toBeGreaterThan(0);
      });
    }
  });

  test.describe("Workspace sections (owner)", () => {
    for (const section of workspaceSections) {
      test(`${section} page loads for owner`, async ({ page }) => {
        await signIn(page, "owner@test.local", "TestOwner123!");
        await page.goto(`/settings/${section}`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);
        expect(page.url()).toContain(`/settings/${section}`);
      });
    }
  });

  test.describe("Settings API", () => {
    test("GET /api/me returns profile data", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/me`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data.email).toBeTruthy();
      expect(body.data.userId).toBeTruthy();
    });

    test("PATCH /api/me updates profile", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/me`, {
        data: { fullName: "QA Test Owner Updated" },
      });
      expect(res.status()).toBe(200);
    });

    test("PATCH /api/me rejects empty name", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/me`, {
        data: { fullName: "" },
      });
      expect(res.status()).toBe(400);
    });

    test("PATCH /api/me rejects name > 80 chars", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/me`, {
        data: { fullName: "A".repeat(81) },
      });
      expect(res.status()).toBe(400);
    });

    test("PATCH /api/me rejects invalid avatar URL", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/me`, {
        data: { avatarUrl: "not-a-url" },
      });
      expect(res.status()).toBe(400);
    });

    test("PATCH /api/me accepts http avatar URL", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/me`, {
        data: {
          fullName: "QA Test Owner Updated",
          avatarUrl: "https://example.com/avatar.jpg",
        },
      });
      expect(res.status()).toBe(200);
    });
  });

  test.describe("Team API (owner scope)", () => {
    test("GET /api/team returns users", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/team`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    });

    test("GET /api/team with search param", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/team?search=owner`);
      expect(res.status()).toBe(200);
    });

    test("GET /api/team with invalid role param", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/team?role=invalid`);
      expect(res.status()).toBe(400);
    });
  });

  test.describe("Assignments API", () => {
    test("requires workspaceId", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/admin/assignments`);
      expect(res.status()).toBe(400);
    });

    test("returns data with valid workspaceId", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const wsRes = await page.request.get(`${BASE}/api/workspaces`);
      const wsBody = await wsRes.json();
      if (wsBody.data.length > 0) {
        const res = await page.request.get(
          `${BASE}/api/admin/assignments?workspaceId=${wsBody.data[0].id}`
        );
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.data.projects).toBeTruthy();
        expect(body.data.users).toBeTruthy();
      }
    });
  });

  test.describe("Invalid section returns 404", () => {
    test("non-existent section returns 404", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.goto("/settings/nonexistent");
      await page.waitForTimeout(3000);
      const status = page.url().includes("404") || page.url().includes("not-found");
      const bodyText = await page.locator("body").textContent();
      const is404 =
        status ||
        (bodyText?.includes("404") ?? false) ||
        (bodyText?.includes("not found") ?? false) ||
        (bodyText?.includes("Could not") ?? false);
      expect(is404).toBeTruthy();
    });
  });
});
