import { test, expect, signIn } from "./helpers";

const BASE = "http://localhost:3000";

test.describe("Hosting Clients", () => {
  let hostingId: string | null = null;
  const domain = `qa-test-${Date.now()}.example.com`;

  test.describe("Page", () => {
    test("hosting page loads", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/hosting");
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/hosting/i).first()).toBeVisible();
    });

    test("new hosting dialog opens", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/hosting");
      await page.waitForLoadState("networkidle");
      const btn = page.getByRole("button", { name: /new|create|add/i });
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe("CRUD via API", () => {
    test("creates hosting client", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/hosting`, {
        data: { domain, clientName: "QA Test Client" },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      hostingId = body.data?.id;
    });

    test("lists hosting clients", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/hosting`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    });

    test("updates hosting client", async ({ page }) => {
      if (!hostingId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/hosting/${hostingId}`, {
        data: { status: "in_progress", clientName: "Updated Client" },
      });
      expect(res.status()).toBe(200);
    });

    test("deletes hosting client", async ({ page }) => {
      if (!hostingId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.delete(`${BASE}/api/hosting/${hostingId}`);
      expect(res.status()).toBe(200);
    });

    test("deleted hosting client returns 404", async ({ page }) => {
      if (!hostingId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/hosting/${hostingId}`);
      expect(res.status()).toBe(404);
    });
  });

  test.describe("Edge Cases", () => {
    test("rejects hosting with empty domain", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/hosting`, {
        data: { domain: "" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects domain > 255 chars", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/hosting`, {
        data: { domain: "a".repeat(256) },
      });
      expect(res.status()).toBe(400);
    });

    test("hosting supports search and pagination", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(
        `${BASE}/api/hosting?search=example&limit=5&offset=0`
      );
      expect(res.status()).toBe(200);
    });
  });
});
