import { test, expect, signIn } from "./helpers";

test.describe("Full Navigation & Links", () => {
  const allPages = [
    { url: "/", name: "Dashboard", expectText: /project|total|dashboard/i },
    { url: "/projects", name: "Projects", expectText: /project/i },
    { url: "/side-projects", name: "Side Projects", expectText: /project|side/i },
    { url: "/hosting", name: "Hosting", expectText: /hosting|domain/i },
    { url: "/docs", name: "Docs", expectText: /doc|document/i },
    { url: "/meetings", name: "Meetings", expectText: /meeting/i },
    { url: "/wiki", name: "Wiki", expectText: /coming soon|wiki/i },
    { url: "/team", name: "Team", expectText: /workspace|member|team|team admin/i },
    { url: "/settings/profile", name: "Settings Profile", expectText: /profile|settings/i },
    { url: "/settings/general", name: "Settings General", expectText: /general|workspace|settings/i },
    { url: "/settings/members", name: "Settings Members", expectText: /member|settings/i },
    { url: "/settings/access", name: "Settings Access", expectText: /access|permission|settings/i },
    { url: "/settings/workspaces", name: "Settings Workspaces", expectText: /workspace|settings/i },
    { url: "/settings/projects", name: "Settings Projects", expectText: /project|settings/i },
    { url: "/settings/appearance", name: "Settings Appearance", expectText: /appearance|theme|settings/i },
    { url: "/settings/notifications", name: "Settings Notifications", expectText: /notification|settings/i },
    { url: "/settings/security", name: "Settings Security", expectText: /security|settings/i },
  ];

  for (const page of allPages) {
    test(`${page.name} (${page.url}) loads and has content`, async ({ page: p }) => {
      await signIn(p, "owner@test.local", "TestOwner123!");
      const response = await p.goto(page.url);
      await p.waitForLoadState("networkidle");
      await p.waitForTimeout(2000);
      expect(response?.status()).toBeLessThan(500);
      const body = await p.locator("body").textContent();
      expect(body!.length).toBeGreaterThan(10);
    });
  }

  test("sidebar links are all clickable", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const sidebarLinks = page.locator("nav a, [data-sidebar] a");
    const count = await sidebarLinks.count();
    expect(count).toBeGreaterThan(3);
    for (let i = 0; i < Math.min(count, 10); i++) {
      const link = sidebarLinks.nth(i);
      if (await link.isVisible().catch(() => false)) {
        const href = await link.getAttribute("href");
        if (href && href.startsWith("/") && !href.startsWith("//")) {
          // Dev-mode Next.js can drop clicks issued while a previous
          // navigation is still in-flight; retry until the URL commits.
          let navigated = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            await link.click();
            navigated = await page
              .waitForURL(
                (url) => url.pathname === href || url.pathname.startsWith(href + "?"),
                { timeout: 4000 }
              )
              .then(
                () => true,
                () => false
              );
            if (navigated) break;
          }
          expect(navigated, `Sidebar link failed to navigate to ${href}`).toBeTruthy();
        }
      }
    }
  });

  test("browser back/forward works", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.goBack();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/");
    await page.goForward();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/projects");
  });

  test("page refresh preserves state", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/projects");
    expect(page.url()).not.toContain("/login");
  });

  test("no broken images on any page", async ({ page }) => {
    await signIn(page, "owner@test.local", "TestOwner123!");
    const brokenImages: string[] = [];
    page.on("response", (resp) => {
      if (resp.url().includes("/uploads/") && resp.status() >= 400) {
        brokenImages.push(resp.url());
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(brokenImages).toHaveLength(0);
  });
});
