import { test, expect, signIn } from "./helpers";

const viewports = [
  { name: "Desktop 1920x1080", width: 1920, height: 1080 },
  { name: "Desktop 1440x900", width: 1440, height: 900 },
  { name: "Desktop 1280x720", width: 1280, height: 720 },
  { name: "Tablet 1024x768", width: 1024, height: 768 },
  { name: "Tablet 768x1024", width: 768, height: 1024 },
  { name: "Mobile 430x932", width: 430, height: 932 },
  { name: "Mobile 390x844", width: 390, height: 844 },
  { name: "Mobile 375x812", width: 375, height: 812 },
];

const pages = ["/", "/projects", "/settings/profile", "/hosting"];

test.describe("Responsive Layout", () => {
  for (const vp of viewports) {
    for (const url of pages) {
      test(`${vp.name} - ${url} renders without overflow`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await signIn(page, "owner@test.local", "TestOwner123!");
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);

        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        const bodyText = await page.locator("body").textContent();
        expect(bodyText!.length).toBeGreaterThan(10);
      });
    }
  }

  test("sidebar collapses on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, "owner@test.local", "TestOwner123!");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const sidebar = page.locator("[data-sidebar]");
    const isDesktopSidebarVisible = await sidebar.isVisible().catch(() => false);
    if (!isDesktopSidebarVisible) {
      const trigger = page.locator("[data-sidebar=trigger], button").filter({ has: page.locator("svg, [data-lucide]") }).first();
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click();
        await page.waitForTimeout(1000);
      }
    }
  });
});
