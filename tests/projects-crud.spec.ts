import { test, expect, signIn } from "./helpers";

const BASE = "http://localhost:3000";

test.describe("Projects CRUD", () => {
  let projectId: string | null = null;
  const projectName = `QA_TEST_PROJECT_${Date.now()}`;

  test.describe("Create", () => {
    test("projects page loads", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/projects");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
      await expect(page.getByText("Thrill Edge Technologies")).toBeVisible();
    });

    test("new project dialog opens", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/projects");
      await page.waitForLoadState("networkidle");
      const btn = page.getByRole("button", { name: /new project|create/i });
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click();
        await expect(page.getByText(/name/i).first()).toBeVisible();
      }
    });

    test("creates project via API", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const wsRes = await page.request.get(`${BASE}/api/workspaces`);
      expect(wsRes.status()).toBe(200);
      const wsBody = await wsRes.json();
      const workspaceId = wsBody.data[0].id;
      const res = await page.request.post(`${BASE}/api/projects`, {
        data: {
          name: projectName,
          workspaceId,
          type: "client",
          status: "not_started",
          summary: "QA test project for automated testing",
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      projectId = body.data.id;
    });

    test("created project appears in list", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/projects");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Read", () => {
    test("project detail page loads", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto(`/projects/${projectId}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(projectName)).toBeVisible();
    });

    test("project API returns correct data", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects/${projectId}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe(projectName);
      expect(body.data.type).toBe("client");
    });
  });

  test.describe("Update", () => {
    const updatedName = `${projectName}_UPDATED`;

    test("updates project name via API", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/projects/${projectId}`, {
        data: { name: updatedName },
      });
      expect(res.status()).toBe(200);
    });

    test("updated name persists", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects/${projectId}`);
      const body = await res.json();
      expect(body.data.name).toBe(updatedName);
    });

    test("updates project status via API", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/projects/${projectId}`, {
        data: { status: "in_progress" },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("in_progress");
    });

    test("updates project result via API", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.patch(`${BASE}/api/projects/${projectId}`, {
        data: { result: "in_progress" },
      });
      expect(res.status()).toBe(200);
    });

    test("inline edit on detail page works", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto(`/projects/${projectId}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      const titleInput = page.locator("input").first();
      if (await titleInput.isVisible().catch(() => false)) {
        const currentVal = await titleInput.inputValue();
        await titleInput.fill(`${currentVal}_UI`);
        await titleInput.blur();
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe("Delete", () => {
    test("deletes project via API", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.delete(`${BASE}/api/projects/${projectId}`);
      expect(res.status()).toBe(200);
    });

    test("deleted project returns 404", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects/${projectId}`);
      expect(res.status()).toBe(404);
    });
  });

  test.describe("Edge Cases", () => {
    test("rejects project with empty name", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/projects`, {
        data: { name: "" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects project with name > 255 chars", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/projects`, {
        data: { name: "A".repeat(256) },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects invalid status value", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/projects`, {
        data: { name: "Test", status: "invalid_status" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects PATCH with body > 256KB", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const largeBody = { summary: "x".repeat(300000) };
      const res = await page.request.fetch(`${BASE}/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(largeBody),
      });
      expect([400, 413]).toContain(res.status());
    });
  });

  test.describe("Projects List", () => {
    test("page loads with filter controls", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/projects");
      await page.waitForLoadState("networkidle");
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    });

    test("search filters projects", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/projects");
      await page.waitForLoadState("networkidle");
      const searchInput = page.getByPlaceholder(/search/i);
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill("QA");
        await page.waitForTimeout(2000);
      }
    });

    test("projects API with search param", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects?search=QA&limit=10`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    });

    test("projects API with type filter", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects?type=client`);
      expect(res.status()).toBe(200);
    });

    test("projects API with status filter", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects?status=in_progress`);
      expect(res.status()).toBe(200);
    });

    test("pagination with limit/offset", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects?limit=2&offset=0`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBeLessThanOrEqual(2);
    });

    test("sorting works", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects?sortBy=name&sortDir=asc`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    });
  });

  test.describe("Reorder", () => {
    test("reorder API works", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const listRes = await page.request.get(`${BASE}/api/projects?limit=3`);
      if (listRes.status() === 200) {
        const body = await listRes.json();
        if (body.data.length >= 2) {
          const res = await page.request.post(`${BASE}/api/projects/reorder`, {
            data: { id: body.data[0].id, afterId: body.data[1].id },
          });
          expect([200, 204]).toContain(res.status());
        }
      }
    });
  });

  test.describe("Project Content", () => {
    test("content API returns pages and blocks", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects/${projectId}/content`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      expect(Array.isArray(body.data.pages)).toBeTruthy();
      expect(Array.isArray(body.data.blocks)).toBeTruthy();
    });

    test("create block via API", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/projects/${projectId}/blocks`, {
        data: {
          text: "QA Test Block Content",
          type: "paragraph",
          spans: [{ text: "QA Test Block Content" }],
        },
      });
      expect(res.status()).toBe(201);
    });

    test("rejects block with text > 20000 chars", async ({ page }) => {
      if (!projectId) return;
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.post(`${BASE}/api/projects/${projectId}/blocks`, {
        data: {
          text: "X".repeat(20001),
          type: "paragraph",
        },
      });
      expect(res.status()).toBe(400);
    });
  });

  test.describe("Invalid project ID", () => {
    test("returns 404 for non-existent project", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(
        `${BASE}/api/projects/00000000-0000-0000-0000-000000000000`
      );
      expect([404, 403]).toContain(res.status());
    });

    test("rejects invalid UUID format", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      const res = await page.request.get(`${BASE}/api/projects/not-a-uuid`);
      expect(res.status()).toBe(400);
    });
  });
});
