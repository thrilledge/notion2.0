import { test, expect, signIn } from "./helpers";

const BASE = "http://localhost:3000";
const FOLDER_MEMBER_EMAIL = "folderqamember@test.local";
const FOLDER_MEMBER_PASSWORD = "FolderQA123!";

const ts = Date.now();
const PROJECT_NAME = `QA_FOLDER_PROJECT_${ts}`;
const FOLDER_NAME = `QA_FOLDER_${ts}`;
const RENAMED_FOLDER_NAME = `QA_FOLDER_RENAMED_${ts}`;
const HOSTING_DOMAIN = `qa-folder-${ts}.example.com`;
const HOSTING_NAME = `QA_FOLDER_HOSTING_${ts}`;
const HOSTING_FOLDER_NAME = `QA_HOST_FOLDER_${ts}`;

/**
 * Folder access control end-to-end:
 *   - owner creates/renames custom folders and assigns content
 *   - the dedicated folder-member fixture has its grants removed
 *   - revoked member sees NOTHING (sidebar, APIs, direct URLs all empty/blocked)
 *   - granting a single custom folder reveals exactly its members
 *   - the same isolation applies to hosting-client folders
 *   - deleting a folder never deletes the projects inside it, but revokes access
 *   - system folders are immutable
 */
test.describe.serial("Folder access control", () => {
  // Dev-mode on-demand route compilation makes individual steps slow.
  test.describe.configure({ timeout: 240_000 });

  let workspaceId = "";
  let folderMemberId = "";
  let projectId = "";
  let hostingId = "";
  let folderId = "";
  let hostingFolderId = "";

  test("owner: locate workspace and revoke all folder grants", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    const res = await page.request.get(`${BASE}/api/workspaces`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    workspaceId = body.data[0].id;

    let fa = await (
      await page.request.get(
        `${BASE}/api/admin/folder-access?workspaceId=${workspaceId}`
      )
    ).json();
    const member = fa.data.users.find((u) => u.email === FOLDER_MEMBER_EMAIL);
    expect(member, "folder-member fixture must exist").toBeTruthy();
    folderMemberId = member.id;

    const revoke = await page.request.post(`${BASE}/api/admin/folder-access`, {
      data: { workspaceId, userId: folderMemberId, folderIds: [] },
    });
    expect(revoke.status()).toBe(200);

    fa = await (
      await page.request.get(
        `${BASE}/api/admin/folder-access?workspaceId=${workspaceId}`
      )
    ).json();
    const revoked = fa.data.users.find((u) => u.email === FOLDER_MEMBER_EMAIL);
    expect(revoked.grantedFolderIds).toEqual([]);
  });

  test("revoked member sees nothing until granted", async ({ page }) => {
    await signIn(page, FOLDER_MEMBER_EMAIL, FOLDER_MEMBER_PASSWORD);

    await page.goto("/hosting");
    await page.waitForURL("**/");
    await page.goto("/side-projects");
    await page.waitForURL("**/");

    const projects = await (
      await page.request.get(`${BASE}/api/projects`)
    ).json();
    expect(projects.data).toEqual([]);
    const hosting = await (
      await page.request.get(`${BASE}/api/hosting`)
    ).json();
    expect(hosting.data).toEqual([]);

    await page.goto("/");
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await expect(sidebar.getByText("All Projects")).toHaveCount(0);
    await expect(sidebar.getByText("Side Projects")).toHaveCount(0);
    await expect(sidebar.getByText("Hosting Clients")).toHaveCount(0);
  });

  test("owner: create project, hosting client, folders; rename; immutable system folders", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    const proj = await page.request.post(`${BASE}/api/projects`, {
      data: {
        name: PROJECT_NAME,
        workspaceId,
        type: "client",
        status: "not_started",
        summary: "QA folder isolation project",
      },
    });
    expect(proj.status()).toBe(201);
    projectId = (await proj.json()).data.id;

    const folder = await page.request.post(`${BASE}/api/folders`, {
      data: { workspaceId, name: FOLDER_NAME, kind: "project", projectIds: [projectId] },
    });
    expect(folder.status()).toBe(201);
    folderId = (await folder.json()).data.id;

    const rename = await page.request.patch(`${BASE}/api/folders`, {
      data: { folderId, name: RENAMED_FOLDER_NAME },
    });
    expect(rename.status()).toBe(200);

    const host = await page.request.post(`${BASE}/api/hosting`, {
      data: { domain: HOSTING_DOMAIN, clientName: HOSTING_NAME },
    });
    expect(host.status()).toBe(201);
    hostingId = (await host.json()).data.id;

    const hostFolder = await page.request.post(`${BASE}/api/folders`, {
      data: {
        workspaceId,
        name: HOSTING_FOLDER_NAME,
        kind: "hosting_client",
        hostingClientIds: [hostingId],
      },
    });
    expect(hostFolder.status()).toBe(201);
    hostingFolderId = (await hostFolder.json()).data.id;

    const list = await (
      await page.request.get(`${BASE}/api/folders?workspaceId=${workspaceId}`)
    ).json();
    const created = list.data.find((f) => f.id === folderId);
    expect(created).toBeTruthy();
    expect(created.name).toBe(RENAMED_FOLDER_NAME);
    expect(created.projectIds).toContain(projectId);

    const system = list.data.find((f) => f.code === "all_projects");
    expect(system).toBeTruthy();
    const sysRename = await page.request.patch(`${BASE}/api/folders`, {
      data: { folderId: system.id, name: "Hacked" },
    });
    expect(sysRename.status()).toBe(400);
    const sysDelete = await page.request.delete(`${BASE}/api/folders`, {
      data: { folderId: system.id },
    });
    expect(sysDelete.status()).toBe(400);

    // Only the project folder is granted to the member; hosting stays hidden.
    const grant = await page.request.post(`${BASE}/api/admin/folder-access`, {
      data: { workspaceId, userId: folderMemberId, folderIds: [folderId] },
    });
    expect(grant.status()).toBe(200);
  });

  test("member: granted folder's project visible; hosting isolated", async ({ page }) => {
    await signIn(page, FOLDER_MEMBER_EMAIL, FOLDER_MEMBER_PASSWORD);

    const projects = await (
      await page.request.get(`${BASE}/api/projects`)
    ).json();
    expect(projects.data.map((p) => p.name)).toContain(PROJECT_NAME);
    expect(
      (await page.request.get(`${BASE}/api/projects/${projectId}`)).status()
    ).toBe(200);
    expect(
      (await page.request.get(`${BASE}/api/projects/${projectId}/content`)).status()
    ).toBe(200);
    const filtered = await (
      await page.request.get(`${BASE}/api/projects?folderId=${folderId}`)
    ).json();
    expect(filtered.data.map((p) => p.name)).toEqual([PROJECT_NAME]);

    const hosting = await (
      await page.request.get(`${BASE}/api/hosting`)
    ).json();
    expect(hosting.data).toEqual([]);
    const hostById = await page.request.get(`${BASE}/api/hosting/${hostingId}`);
    expect([404, 403]).toContain(hostById.status());

    await page.goto("/");
    await expect(
      page.locator(`[data-sidebar="sidebar"] a[href="/folders/${folderId}"]`)
    ).toHaveCount(1, { timeout: 30_000 });
    await page.goto(`/folders/${folderId}`);
    await expect(page.getByText(PROJECT_NAME).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("owner: delete folder (project survives), grant hosting folder", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    const grant = await page.request.post(`${BASE}/api/admin/folder-access`, {
      data: {
        workspaceId,
        userId: folderMemberId,
        folderIds: [folderId, hostingFolderId],
      },
    });
    expect(grant.status()).toBe(200);

    const del = await page.request.delete(`${BASE}/api/folders`, {
      data: { folderId },
    });
    expect(del.status()).toBe(200);

    const list = await (
      await page.request.get(`${BASE}/api/folders?workspaceId=${workspaceId}`)
    ).json();
    expect(list.data.find((f) => f.id === folderId)).toBeUndefined();

    const proj = await page.request.get(`${BASE}/api/projects/${projectId}`);
    expect(proj.status()).toBe(200);
    expect((await proj.json()).data.name).toBe(PROJECT_NAME);
  });

  test("member: hosting now visible; deleted folder's project access revoked", async ({ page }) => {
    await signIn(page, FOLDER_MEMBER_EMAIL, FOLDER_MEMBER_PASSWORD);

    const hosting = await (
      await page.request.get(`${BASE}/api/hosting`)
    ).json();
    expect(hosting.data.map((c) => c.domain)).toContain(HOSTING_DOMAIN);
    expect(
      (await page.request.get(`${BASE}/api/hosting/${hostingId}`)).status()
    ).toBe(200);

    const projects = await (
      await page.request.get(`${BASE}/api/projects`)
    ).json();
    expect(projects.data).toEqual([]);
    expect(
      (await page.request.get(`${BASE}/api/projects/${projectId}`)).status()
    ).toBe(404);
  });
});