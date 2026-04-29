import { test as base, expect, type Page } from "@playwright/test";
import { cleanupUser, seedOnboardedUser, type SeededUser } from "./helpers/db";

export { expect };

export interface TestFixtures {
  /**
   * A pre-seeded verified+onboarded user with plaintext credentials.
   * Auto-cleans after the test (deletes the user; cascades drop their data).
   */
  testUser: SeededUser;

  /**
   * A `Page` with the test user already logged in via the login form.
   * Lands on the dashboard.
   */
  authedPage: Page;
}

export const test = base.extend<TestFixtures>({
  testUser: async ({ request }, use) => {
    const user = await seedOnboardedUser(request);
    await use(user);
    await cleanupUser(request, user.id);
  },

  authedPage: async ({ page, testUser }, use) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(testUser.email);
    await page.getByLabel("Password").fill(testUser.password);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/);
    await use(page);
  },
});

/**
 * Stub the presigned S3 PUT issued by FileUpload / BatchFileUpload.
 *
 * Pairs with `E2E_TEST_MODE=1` on the server (which short-circuits
 * `checkFileExists` to `true`) so the confirm step reports `ready` without
 * touching a real bucket.
 */
export async function mockS3Upload(page: Page): Promise<void> {
  await page.route(/X-Amz-Signature=/, (route) => {
    if (route.request().method() === "PUT") {
      return route.fulfill({ status: 200, body: "" });
    }
    return route.continue();
  });
}
