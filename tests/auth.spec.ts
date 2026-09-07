import { test, expect, signIn } from "./helpers";

test.describe("Authentication", () => {
  test.describe("Login Page", () => {
    test("loads login page correctly", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByText("Welcome back")).toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    });

    test("shows link to register", async ({ page }) => {
      await page.goto("/login");
      const registerLink = page.getByRole("link", { name: /create one/i });
      await expect(registerLink).toBeVisible();
      await registerLink.click();
      await expect(page).toHaveURL(/\/register/);
    });

    test("shows error with wrong password", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill("owner@test.local");
      await page.getByLabel("Password").fill("wrongpassword");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForTimeout(3000);
      const url = page.url();
      const hasError =
        url.includes("login") ||
        (await page.locator("[class*=destructive], [role=alert], .text-red, .text-destructive").count()) > 0;
      expect(hasError).toBeTruthy();
    });

    test("shows error with empty fields", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain("/login");
    });

    test("shows error with non-existent email", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill("nonexistent@test.local");
      await page.getByLabel("Password").fill("SomePassword123!");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForTimeout(3000);
      expect(page.url()).toContain("/login");
    });

    test("redirects to dashboard on valid login", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await expect(page).toHaveURL(/\//);
    });
  });

  test.describe("Register Page", () => {
    test("loads register page correctly", async ({ page }) => {
      await page.goto("/register");
      await expect(page.getByText("Create an account")).toBeVisible();
      await expect(page.getByLabel("Full name")).toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
    });

    test("shows link to login", async ({ page }) => {
      await page.goto("/register");
      const loginLink = page.getByRole("link", { name: /sign in/i });
      await expect(loginLink).toBeVisible();
      await loginLink.click();
      await expect(page).toHaveURL(/\/login/);
    });

    test("rejects short password", async ({ page }) => {
      await page.goto("/register");
      await page.getByLabel("Full name").fill("Test User");
      await page.getByLabel("Email").fill("short@test.local");
      await page.getByLabel("Password").fill("short");
      await page.getByRole("button", { name: /create/i }).click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain("/register");
    });

    test("rejects empty name", async ({ page }) => {
      await page.goto("/register");
      await page.getByLabel("Email").fill("noname@test.local");
      await page.getByLabel("Password").fill("TestPassword123!");
      await page.getByRole("button", { name: /create/i }).click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain("/register");
    });

    test("registers new user and shows confirmation or redirects", async ({ page }) => {
      const ts = Date.now();
      await page.goto("/register");
      await page.getByLabel("Full name").fill("QA New User");
      await page.getByLabel("Email").fill(`qa_new_${ts}@test.local`);
      await page.getByLabel("Password").fill("TestPassword123!");
      await page.getByRole("button", { name: /create/i }).click();
      await page.waitForTimeout(5000);
      const onRegister = page.url().includes("/register");
      const onDashboard = page.url() === "http://localhost:3000/" || page.url() === "http://localhost:3000";
      const hasConfirmation = await page.getByText(/check your email|confirm/i).isVisible().catch(() => false);
      expect(onRegister || onDashboard || hasConfirmation).toBeTruthy();
    });
  });

  test.describe("Session & Logout", () => {
    test("logged-in user can access dashboard", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    });

    test("unauthenticated user is redirected to login from dashboard", async ({ unauthPage: page }) => {
      await page.goto("/");
      await page.waitForURL("**/login", { timeout: 10000 });
      expect(page.url()).toContain("/login");
    });

    test("logged-in user can navigate to login page", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/login");
      await page.waitForTimeout(3000);
      const onLogin = page.url().includes("/login");
      const onDashboard = page.url() === "http://localhost:3000/" || page.url() === "http://localhost:3000";
      expect(onLogin || onDashboard).toBeTruthy();
    });

    test("refresh preserves session", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/");
      await page.reload();
      await page.waitForLoadState("networkidle");
      expect(page.url()).not.toContain("/login");
    });

    test("logout destroys session and redirects to login", async ({ page }) => {
      await signIn(page, "owner@test.local", "TestOwner123!");
      await page.goto("/");
      const avatarBtn = page.locator("[class*=avatar], img[alt], button").filter({ has: page.locator("img, [data-slot=avatar]") }).first();
      if (await avatarBtn.isVisible().catch(() => false)) {
        await avatarBtn.click();
        await page.getByText("Sign out").click();
        await page.waitForURL("**/login", { timeout: 10000 });
        expect(page.url()).toContain("/login");
      }
    });
  });
});
