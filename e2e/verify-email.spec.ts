import { test, expect } from "@playwright/test";
import { cleanupUser } from "./helpers/db";

/**
 * Email verification flow (#138): signup → 403 before verify → click the
 * real verification link → login succeeds → link is scanner-tolerant on
 * replay → garbage tokens surface the error banner.
 */
test.describe("email verification flow", () => {
  const email = `verify-${Date.now()}@e2e.test`;
  const password = "E2eTest1234!";
  let userId: string | null = null;

  test.afterAll(async ({ request }) => {
    if (userId) await cleanupUser(request, userId);
  });

  test("signup → verify link → login works", async ({ page, request }) => {
    // 1. Signup via API (UI signup already covered by happy-path)
    const signupRes = await request.post("/api/auth/signup", {
      data: { email, password },
    });
    expect(signupRes.status()).toBe(201);
    userId = (await signupRes.json()).userId;

    // 2. Unverified login is rejected
    const blockedLogin = await request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(blockedLogin.status()).toBe(403);

    // 3. Fetch the real token and click the real link
    const tokenRes = await request.get(
      `/api/test/users/by-email/${encodeURIComponent(email)}/verification-token`,
    );
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = await tokenRes.json();

    await page.goto(`/api/auth/verify-email?token=${token}`);
    await expect(page).toHaveURL(/\/login\?verified=1/);
    await expect(page.getByText("Email verified")).toBeVisible();

    // 4. Login now succeeds via the UI
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL(/\/(dashboard|onboarding)/);

    // 5. Re-clicking the used link still lands on success (scanner tolerance)
    await page.goto(`/api/auth/verify-email?token=${token}`);
    await expect(page).toHaveURL(/\/login\?verified=1/);

    // 6. Garbage token shows the error banner
    await page.goto(`/api/auth/verify-email?token=not-a-real-token`);
    await expect(page).toHaveURL(/\/login\?verify_error=invalid/);
  });
});
