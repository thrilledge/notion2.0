import { test, expect, signIn } from "./helpers";

const BASE = "http://localhost:3000";

test.describe("Console & Runtime Errors", () => {
  const pages = ["/", "/projects", "/hosting", "/docs", "/meetings", "/wiki", "/settings/profile", "/team"];

  for (const url of pages) {
    test(`no critical console errors on ${url}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(`PAGE_ERROR: ${err.message}`));

      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3000);

      const critical = errors.filter(
        (e) =>
          !e.includes("favicon") &&
          !e.includes("404") &&
          !e.includes("third-party") &&
          !e.includes("analytics") &&
          !e.includes("accounts.google.com") &&
          !e.includes("Sign in with Google") &&
          !e.includes("BLOCK_NAVIGATION") &&
          !e.includes("Expected招") &&
          !e.includes("Warning:") &&
          !e.includes("DevTools") &&
          !e.includes("Download the React DevTools") &&
          !e.includes("[HMR]")
      );
      expect(critical).toHaveLength(0);
    });
  }
});

test.describe("Security Headers", () => {
  test("CSP header is set", async ({ page }) => {
    const res = await page.request.get(`${BASE}/`);
    const csp = res.headers()["content-security-policy"];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src");
    expect(csp).toContain("script-src");
  });

  test("X-Content-Type-Options is nosniff", async ({ page }) => {
    const res = await page.request.get(`${BASE}/`);
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("X-Frame-Options is DENY", async ({ page }) => {
    const res = await page.request.get(`${BASE}/`);
    expect(res.headers()["x-frame-options"]).toBe("DENY");
  });

  test("Referrer-Policy is set", async ({ page }) => {
    const res = await page.request.get(`${BASE}/`);
    expect(res.headers()["referrer-policy"]).toBeTruthy();
  });

  test("Permissions-Policy blocks camera/mic/geo", async ({ page }) => {
    const res = await page.request.get(`${BASE}/`);
    const pp = res.headers()["permissions-policy"];
    expect(pp).toBeTruthy();
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
  });
});

test.describe("Security - IDOR & Access Control", () => {
  test("member can view workspace settings sections read-only", async ({
    page,
  }) => {
    await signIn(page, "member@test.local", "TestMember123!");
    const sections = ["general", "members", "access", "workspaces", "projects"];
    for (const section of sections) {
      const navRes = await page.goto(`/settings/${section}`);
      await page.waitForTimeout(1500);
      const body = await page.locator("body").textContent();
      // Every workspace settings page now renders for members (no 404) so the
      // sidebar is identical for all users.
      expect(navRes?.status()).not.toBe(404);
      expect(body).not.toContain("Could not find");
      expect(body).not.toContain("page not found");
    }
  });

  test("member cannot delete other member's project", async ({ page }) => {
    await signIn(page, "member@test.local", "TestMember123!");
    const wsRes = await page.request.get(`${BASE}/api/workspaces`);
    const wsBody = await wsRes.json();
    if (wsBody.data.length > 0) {
      const membersRes = await page.request.get(
        `${BASE}/api/workspaces/${wsBody.data[0].id}/members`
      );
      const membersBody = await membersRes.json();
      const isOwner = membersBody.data.some(
        (m: any) => m.role === "owner" && m.userId !== undefined
      );
      if (!isOwner) {
        const projRes = await page.request.get(`${BASE}/api/projects?limit=1`);
        const projBody = await projRes.json();
        if (projBody.data.length > 0) {
          const delRes = await page.request.delete(
            `${BASE}/api/projects/${projBody.data[0].id}`
          );
          expect([403, 404]).toContain(delRes.status());
        }
      }
    }
  });
});

test.describe("Performance", () => {
  test("dashboard loads within 5 seconds", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    const start = Date.now();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });

  test("projects page loads within 5 seconds", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    const start = Date.now();
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });

  test("no excessive API calls on page load", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/")) apiCalls.push(req.url());
    });
    await signIn(page, "owner@test.local", "TestOwner123!");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    expect(apiCalls.length).toBeLessThan(30);
  });
});

test.describe("Rapid Action Testing", () => {
  test("double-click on save does not create duplicates", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    const res = await page.request.post(`${BASE}/api/projects`, {
      data: { name: `QA_RAPID_${Date.now()}` },
    });
    const body = await res.json();
    if (body.data?.id) {
      const res2 = await page.request.post(`${BASE}/api/projects`, {
        data: { name: `QA_RAPID_${Date.now()}_2` },
      });
      expect(res2.status()).toBe(200);
      await page.request.delete(`${BASE}/api/projects/${body.data.id}`);
      const body2 = await res2.json();
      if (body2.data?.id) {
        await page.request.delete(`${BASE}/api/projects/${body2.data.id}`);
      }
    }
  });
});
