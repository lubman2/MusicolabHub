import { test, expect, type Page } from "@playwright/test";
import {
  TEST_PASSWORD,
  activateUser,
  deleteUserByEmail,
  getUserIdByEmail,
  uniqueEmail,
} from "./fixtures/users";
import { attachFileToVersion, seedReadyFile } from "./fixtures/files";
import { closeDb } from "./fixtures/db";

test.describe("happy path: signup → login → project → file → publish", () => {
  let email: string;

  test.beforeEach(() => {
    email = uniqueEmail();
  });

  test.afterEach(async () => {
    await deleteUserByEmail(email);
  });

  test.afterAll(async () => {
    await closeDb();
  });

  test("user can sign up, log in, create a project, and publish a version", async ({
    page,
    request,
  }) => {
    // ── 1. Signup via UI ──────────────────────────────────────────────
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /sign up/i })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel("Confirm password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });

    // The /api/auth/verify-email callback isn't implemented, so the fixture
    // flips status directly. See e2e/fixtures/users.ts for rationale.
    await activateUser(email);

    // ── 2. Login via UI ───────────────────────────────────────────────
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // ── 3. Create project via UI ──────────────────────────────────────
    await page.goto("/projects/new");
    const projectTitle = `E2E Project ${Date.now()}`;
    await page.getByLabel(/title/i).fill(projectTitle);
    await page.getByRole("button", { name: /create|save/i }).click();
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+/i, { timeout: 15_000 });

    const projectId = new URL(page.url()).pathname.split("/")[2];
    expect(projectId).toBeTruthy();
    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();

    // ── 4. "Upload" a file (fixture seed; bypasses S3) ────────────────
    const userId = await getUserIdByEmail(email);
    expect(userId).not.toBeNull();
    const file = await seedReadyFile({
      projectId,
      uploaderId: userId!,
      filename: "happy-path.mp3",
    });

    // ── 5. Create draft version + attach file ─────────────────────────
    const apiHeaders = await sessionHeaders(page);
    const versionRes = await request.post(
      `/api/projects/${projectId}/versions`,
      {
        headers: apiHeaders,
        data: { name: "v1.0", changelog: "first cut" },
      },
    );
    expect(versionRes.ok()).toBeTruthy();
    const version = (await versionRes.json()) as { id: string };

    await attachFileToVersion(version.id, file.id);

    // ── 6. Publish ────────────────────────────────────────────────────
    const publishRes = await request.patch(
      `/api/projects/${projectId}/versions/${version.id}`,
      { headers: apiHeaders },
    );
    expect(publishRes.ok()).toBeTruthy();
    const published = (await publishRes.json()) as {
      status: string;
      publishedAt: string | null;
    };
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();

    // ── 7. Verify the published version page renders ──────────────────
    await page.goto(`/projects/${projectId}/versions/${version.id}`);
    await expect(page.getByText(/v1\.0/)).toBeVisible({ timeout: 10_000 });
  });
});

/** Build header set carrying the page's session cookie for direct API calls. */
async function sessionHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
  };
}
