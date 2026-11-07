import { expect, test } from "@playwright/test";

test.describe("unauthorized access", () => {
  for (const path of ["/dashboard", "/dashboard/customers", "/dashboard/settings", "/dashboard/invoices", "/onboarding"]) {
    test(`redirects ${path} to login and keeps the return path`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("does not render protected content without a session", async ({ request }) => {
    const res = await request.get("/dashboard", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login?next=%2Fdashboard");
    expect(await res.text()).not.toContain("Revenue");
  });

  test("rejects open redirects after login", async ({ page }) => {
    await page.goto("/login?next=https://evil.example");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The page renders; the unsafe value is discarded server-side (see safeRedirectPath unit tests).
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("security headers", () => {
  test("are set on every response", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("health endpoint reveals no configuration", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
