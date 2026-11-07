import { expect, test } from "@playwright/test";

test.describe("registration validation", () => {
  test.use({ locale: "en-GB", extraHTTPHeaders: { "Accept-Language": "en-GB,en;q=0.9" } });

  test("shows field errors without submitting to the server", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("This field is required.").first()).toBeVisible();
  });

  test("enforces the password policy and confirmation", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Ana Popescu");
    await page.getByLabel("E-mail", { exact: true }).fill("ana@example.com");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("different");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/at least 10 characters/i)).toBeVisible();
  });

  test("login form validates the e-mail", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("x");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid e-mail address.")).toBeVisible();
  });
});

test.describe("languages", () => {
  // A browser language we do not support falls back to Romanian (the default).
  test.use({ locale: "fr-FR" });

  test("defaults to Romanian and can switch to Russian", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
    await page.getByRole("button", { name: "Limba" }).click();
    await page.getByRole("menuitemradio", { name: "Русский" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });
});

test.describe("public pages", () => {
  test("landing page links to registration", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("link", { name: /Începe gratuit|Start for free|Начать бесплатно/ }).first();
    await expect(cta).toHaveAttribute("href", "/register");
  });

  test("unknown routes show the 404 page", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
  });
});
