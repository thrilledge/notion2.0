import { test, expect, signIn } from "./helpers";

const BASE = "http://localhost:3000";

test.describe("Docs & Meetings", () => {
  test.describe("Docs", () => {
    test("docs page loads", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/docs");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      const hasContent = (await page.locator("body").textContent()) || "";
      expect(hasContent.length).toBeGreaterThan(0);
    });

    test("docs API returns list", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/docs`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    });

    test("doc detail API works", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const listRes = await page.request.get(`${BASE}/api/docs`);
      const listBody = await listRes.json();
      if (listBody.data.length > 0) {
        const docId = listBody.data[0].id;
        const res = await page.request.get(`${BASE}/api/docs/${docId}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.data).toBeTruthy();
      }
    });
  });

  test.describe("Meetings", () => {
    test("meetings page loads", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/meetings");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      const hasContent = (await page.locator("body").textContent()) || "";
      expect(hasContent.length).toBeGreaterThan(0);
    });

    test("meetings API returns list", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/meetings`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    });

    test("meeting detail API works", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const listRes = await page.request.get(`${BASE}/api/meetings`);
      const listBody = await listRes.json();
      if (listBody.data.length > 0) {
        const meetingId = listBody.data[0].id;
        const res = await page.request.get(`${BASE}/api/meetings/${meetingId}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.data).toBeTruthy();
      }
    });
  });

  test.describe("Wiki", () => {
    test("wiki page loads (coming soon)", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/wiki");
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/coming soon/i)).toBeVisible();
    });
  });

  test.describe("Unauthenticated API access", () => {
    test("docs returns 401", async ({ unauthPage: page }) => {
      const res = await page.request.get(`${BASE}/api/docs`);
      expect(res.status()).toBe(401);
    });

    test("meetings returns 401", async ({ unauthPage: page }) => {
      const res = await page.request.get(`${BASE}/api/meetings`);
      expect(res.status()).toBe(401);
    });
  });
});
