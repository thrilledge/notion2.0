import { test as base, expect, type Page } from "@playwright/test";

const OWNER_EMAIL = process.env.TEST_OWNER_EMAIL || "owner@test.local";
const OWNER_PASSWORD = process.env.TEST_OWNER_PASSWORD || "TestOwner123!";
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL || "member@test.local";
const MEMBER_PASSWORD = process.env.TEST_MEMBER_PASSWORD || "TestMember123!";
const MEMBER_NAME = "QA Test Member";
const OWNER_NAME = "QA Test Owner";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/", { timeout: 60000 });
}

async function signUpIfNeeded(
  page: Page,
  name: string,
  email: string,
  password: string
) {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(3000);
}

async function signOut(page: Page) {
  const userButton = page.locator("button").filter({ hasText: /owner|member|qa/i }).first();
  if (await userButton.isVisible().catch(() => false)) {
    await userButton.click();
    await page.getByText("Sign out").click();
    await page.waitForURL("**/login", { timeout: 10000 });
  }
}

export const test = base.extend({
  ownerPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, OWNER_EMAIL, OWNER_PASSWORD);
    await use(page);
    await context.close();
  },

  memberPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await use(page);
    await context.close();
  },

  unauthPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect, signIn, signUpIfNeeded, signOut, OWNER_EMAIL, OWNER_PASSWORD, MEMBER_EMAIL, MEMBER_PASSWORD };
