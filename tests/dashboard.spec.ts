import { test, expect, signIn } from "./helpers";

test.describe("Dashboard", () => {
  test("loads with stat cards", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const main = page.locator("main");
    await expect(main.getByText("Total Projects")).toBeVisible();
    await expect(main.getByText("Hosting Clients")).toBeVisible();
    await expect(main.getByText("Done")).toBeVisible();
    await expect(main.getByText("In Progress").first()).toBeVisible();
  });

  test("sidebar navigation is visible", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("Projects", { exact: true })).toBeVisible();
  });

  test("no critical console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await signIn(page, "owner@test.local", "TestOwner123!");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const critical = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("404") &&
        !e.includes("third-party") &&
        !e.includes("analytics") &&
        !e.includes("accounts.google.com") &&
        !e.includes("BLOCK_NAVIGATION") &&
        !e.includes("Warning:") &&
        !e.includes("DevTools")
    );
    expect(critical).toHaveLength(0);
  });
});
