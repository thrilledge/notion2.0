import { test, expect, signIn } from "./helpers";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const BASE = "http://localhost:3000";
const sql = postgres(
  (process.env.DATABASE_URL ?? "").replace(/^"|"$/g, ""),
  { max: 1 }
);

async function createProject(page, name: string): Promise<string> {
  const wsRes = await page.request.get(`${BASE}/api/workspaces`);
  const wsBody = await wsRes.json();
  const workspaceId = wsBody.data[0].id;
  const res = await page.request.post(`${BASE}/api/projects`, {
    data: {
      name: `${name}_${Date.now()}`,
      workspaceId,
      type: "client",
      status: "not_started",
      summary: "editor test project",
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id;
}

async function addBlock(page, projectId: string, spans: { text: string }[]) {
  const res = await page.request.post(
    `${BASE}/api/projects/${projectId}/blocks`,
    {
      data: {
        text: spans.map((s) => s.text).join(""),
        type: "paragraph",
        spans,
      },
    }
  );
  expect(res.status()).toBe(201);
}

async function openProjectPage(page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("networkidle");
  const editor = page
    .locator('[data-project-content-page] .ProseMirror')
    .first();
  await editor.waitFor({ timeout: 15000 });
}

async function deleteProject(page, projectId: string) {
  const res = await page.request.delete(`${BASE}/api/projects/${projectId}`);
  expect([200, 404]).toContain(res.status());
}

/** The Tiptap contenteditable area of the project content section. */
function editor(page) {
  return page.locator('[data-project-content-page] .ProseMirror').first();
}

test.describe("project editor", () => {
  test("empty paragraph next to real content does not blank the page", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    const projectId = await createProject(page, "QA_EDITOR_EMPTY");
    await addBlock(page, projectId, [{ text: "FIRST REAL LINE" }]);
    await addBlock(page, projectId, []);

    await openProjectPage(page, projectId);

    const ed = editor(page);
    await expect(ed).toContainText("FIRST REAL LINE", { timeout: 15000 });
    await expect(ed).toHaveText(/FIRST REAL LINE/);
    // The trailing empty paragraph must not collapse the whole doc to an empty line.
    await expect
      .poll(async () => (await ed.locator("p").count()), { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);

    await deleteProject(page, projectId);
  });

  test("pasted URL becomes a link instead of plain text", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    const projectId = await createProject(page, "QA_EDITOR_PASTE");
    await addBlock(page, projectId, [{ text: "placeholder text" }]);
    await openProjectPage(page, projectId);

    const ed = editor(page);

    // Select everything in the editor, then paste a bare URL.
    await ed.click();
    await ed.press("Control+a");
    await page.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "https://example.com/docs");
      const ev = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      el.dispatchEvent(ev);
    }, await ed.elementHandle());

    // The pasted text becomes a link pointing at the URL.
    await expect(ed.locator('a[href="https://example.com/docs"]')).toHaveCount(1);

    await deleteProject(page, projectId);
  });

  test("Ctrl+K adds a link to the highlighted text", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    const projectId = await createProject(page, "QA_EDITOR_CTRLK");
    await addBlock(page, projectId, [{ text: "make me a link" }]);
    await openProjectPage(page, projectId);

    const ed = editor(page);

    await ed.click();
    // Highlight the whole line, then press Ctrl+K.
    await ed.press("Control+a");
    await ed.press("Control+k");

    const linkInput = page.getByPlaceholder("https://example.com");
    await linkInput.waitFor({ timeout: 10000 });
    await linkInput.fill("https://example.org/docs");
    await linkInput.press("Enter");

    const link = ed.locator('a[href="https://example.org/docs"]');
    await expect(link).toHaveCount(1);
    // The link keeps the highlighted text as its label.
    await expect(link).toHaveText("make me a link");

    await deleteProject(page, projectId);
  });

  test("backspace at the start of a line merges it into the previous line", async ({
    page,
  }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    const projectId = await createProject(page, "QA_EDITOR_BACKSPACE");
    await addBlock(page, projectId, [{ text: "line one" }]);
    await addBlock(page, projectId, [{ text: "line two" }]);
    await openProjectPage(page, projectId);

    const ed = editor(page);

    // Place the caret in the second line.
    await ed.locator(':text("line two")').first().click();

    // Jump caret to the start of the line, then backspace to merge.
    await ed.press("Home");
    await ed.press("Backspace");

    // The two lines should now be a single line containing both texts, and the
    // standalone "line two" row should be gone.
    await expect(ed.getByText("line oneline two", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(ed.getByText("line two", { exact: true })).toHaveCount(0);

    // Wait for the delete to land, then confirm only one block remains.
    await expect
      .poll(
        async () =>
          (
            await sql`select count(*)::int as c from page_blocks where page_id in (select id from pages where parent_id = ${projectId})`
          )[0].c,
        { timeout: 10000 }
      )
      .toBe(1);

    await deleteProject(page, projectId);
  });

  test("typing Enter creates a new line that persists", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");

    const projectId = await createProject(page, "QA_EDITOR_ENTER");
    await addBlock(page, projectId, [{ text: "first line" }]);
    await openProjectPage(page, projectId);

    const ed = editor(page);

    await ed.click();
    await ed.press("Enter");

    // Enter splits into a second block; wait for the create to land.
    await expect
      .poll(
        async () =>
          (
            await sql`select count(*)::int as c from page_blocks where page_id in (select id from pages where parent_id = ${projectId})`
          )[0].c,
        { timeout: 15000 }
      )
      .toBe(2);

    await deleteProject(page, projectId);
  });
});