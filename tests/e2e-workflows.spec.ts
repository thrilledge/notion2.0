import { test, expect, signIn } from "./helpers";

const BASE = "http://localhost:3000";

test.describe("End-to-End Workflows", () => {
  test("complete project lifecycle", async ({ page }) => {
    // Login
    await signIn(page, "owner@test.local", "TestOwner123!");
    expect(page.url()).not.toContain("/login");

    // Create project
    const createRes = await page.request.post(`${BASE}/api/projects`, {
      data: {
        name: `QA_E2E_LIFECYCLE_${Date.now()}`,
        type: "client",
        status: "not_started",
        summary: "E2E test project",
      },
    });
    expect(createRes.status()).toBe(201);
    const { data: project } = await createRes.json();
    const projectId = project.id;

    // Verify in list
    const listRes = await page.request.get(`${BASE}/api/projects`);
    const listBody = await listRes.json();
    const found = listBody.data.find((p: any) => p.id === projectId);
    expect(found).toBeTruthy();

    // View detail
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const titleVisible = (await page.getByText(project.name).count()) > 0;
    expect(titleVisible).toBeTruthy();

    // Update project
    const updateRes = await page.request.patch(`${BASE}/api/projects/${projectId}`, {
      data: { status: "in_progress", summary: "Updated summary" },
    });
    expect(updateRes.status()).toBe(200);

    // Verify update
    const verifyRes = await page.request.get(`${BASE}/api/projects/${projectId}`);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.data.status).toBe("in_progress");
    expect(verifyBody.data.summary).toBe("Updated summary");

    // Add content
    const blockRes = await page.request.post(`${BASE}/api/projects/${projectId}/blocks`, {
      data: {
        text: "E2E Block Content",
        type: "paragraph",
        spans: [{ text: "E2E Block Content" }],
      },
    });
    expect(blockRes.status()).toBe(201);

    // Verify content
    const contentRes = await page.request.get(`${BASE}/api/projects/${projectId}/content`);
    const contentBody = await contentRes.json();
    expect(contentBody.data.blocks.length).toBeGreaterThan(0);

    // Delete
    const deleteRes = await page.request.delete(`${BASE}/api/projects/${projectId}`);
    expect(deleteRes.status()).toBe(200);

    // Verify deleted
    const deletedRes = await page.request.get(`${BASE}/api/projects/${projectId}`);
    expect(deletedRes.status()).toBe(404);
  });

  test("workspace member management workflow", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    // Create workspace
    const wsRes = await page.request.post(`${BASE}/api/workspaces`, {
      data: { name: `QA_E2E_WS_${Date.now()}` },
    });
    expect(wsRes.status()).toBe(201);
    const wsBody = await wsRes.json();
    const wsId = wsBody.data?.id || wsBody.data?.workspace?.id;

    // List members
    const membersRes = await page.request.get(`${BASE}/api/workspaces/${wsId}/members`);
    expect(membersRes.status()).toBe(200);
    const membersBody = await membersRes.json();
    expect(membersBody.data.length).toBe(1); // just the creator

    // Try adding non-existent member
    const addRes = await page.request.post(`${BASE}/api/workspaces/${wsId}/members`, {
      data: { email: "nonexistent_e2e@test.local" },
    });
    expect(addRes.status()).toBe(404);

    // Rename workspace
    const renameRes = await page.request.patch(`${BASE}/api/workspaces/${wsId}`, {
      data: { name: `QA_E2E_WS_RENAMED_${Date.now()}` },
    });
    expect(renameRes.status()).toBe(200);

    // Cleanup
    await page.request.delete(`${BASE}/api/workspaces/${wsId}`);
  });

  test("hosting client workflow", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    const domain = `qa-e2e-${Date.now()}.example.com`;

    // Create
    const createRes = await page.request.post(`${BASE}/api/hosting`, {
      data: { domain, clientName: "E2E Client" },
    });
    expect(createRes.status()).toBe(201);
    const { data: hosting } = await createRes.json();

    // Verify in list
    const listRes = await page.request.get(`${BASE}/api/hosting`);
    const listBody = await listRes.json();
    const found = listBody.data.find((h: any) => h.id === hosting.id);
    expect(found).toBeTruthy();

    // Update
    const updateRes = await page.request.patch(`${BASE}/api/hosting/${hosting.id}`, {
      data: { status: "in_progress", clientName: "Updated E2E Client" },
    });
    expect(updateRes.status()).toBe(200);

    // Delete
    const deleteRes = await page.request.delete(`${BASE}/api/hosting/${hosting.id}`);
    expect(deleteRes.status()).toBe(200);
  });

  test("project with assignees workflow", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    // Get team
    const teamRes = await page.request.get(`${BASE}/api/team`);
    const teamBody = await teamRes.json();
    if (teamBody.data.length > 0) {
      const userId = teamBody.data[0].id;

      // Create project with assignee
      const projRes = await page.request.post(`${BASE}/api/projects`, {
        data: {
          name: `QA_E2E_ASSIGNED_${Date.now()}`,
          assigneeIds: [userId],
        },
      });
      expect(projRes.status()).toBe(201);
      const projBody = await projRes.json();

      // Verify assignment
      const getRes = await page.request.get(`${BASE}/api/projects/${projBody.data.id}`);
      const getBody = await getRes.json();
      expect(getBody.data.assigneeIds).toContain(userId);

      // Update assignment
      const updateRes = await page.request.patch(`${BASE}/api/projects/${projBody.data.id}`, {
        data: { assigneeIds: [] },
      });
      expect(updateRes.status()).toBe(200);

      // Cleanup
      await page.request.delete(`${BASE}/api/projects/${projBody.data.id}`);
    }
  });

  test("settings profile update workflow", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    // Get current profile
    const meRes = await page.request.get(`${BASE}/api/me`);
    const meBody = await meRes.json();
    const originalName = meBody.data.fullName;

    // Update
    await page.request.patch(`${BASE}/api/me`, {
      data: { fullName: "QA E2E Updated Name" },
    });

    // Verify
    const verifyRes = await page.request.get(`${BASE}/api/me`);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.data.fullName).toBe("QA E2E Updated Name");

    // Restore
    await page.request.patch(`${BASE}/api/me`, {
      data: { fullName: originalName || "QA Test Owner Updated" },
    });
  });
});
