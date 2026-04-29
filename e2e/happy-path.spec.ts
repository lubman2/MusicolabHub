import { test, expect, mockS3Upload } from "./fixtures";
import {
  cleanupUser,
  getLatestReadyFileId,
  markUserOnboardedByEmail,
} from "./helpers/db";

const PASSWORD = "E2eTest1234!";

/**
 * Happy path: signup → login → create project → upload file → publish version.
 *
 * UI-driven: signup form, login form, project create form, file upload widget.
 * API-driven: version create + publish (no UI exists for these yet — see
 * version detail page in src/app/projects/[id]/versions/[versionId]/page.tsx).
 *
 * Prereqs (see TESTING.md):
 *   - Postgres reachable via DATABASE_URL with migrations applied
 *   - NEXTAUTH_SECRET set
 *   - AWS_S3_BUCKET set (any value — real S3 calls are mocked)
 *   - Dev server runs with E2E_TEST_MODE=1 (Playwright config sets this)
 */
test("happy path: signup → login → create project → upload → publish", async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = `e2e-happy-${stamp}@e2e.test`;
  let userId: string | null = null;

  await mockS3Upload(page);

  try {
    // 1. Signup via UI ──────────────────────────────────────────────────
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();

    // Signup redirects to /onboarding, but unverified users get bounced to
    // /login. Either landing is fine — what matters is the API call succeeded.
    await page.waitForURL(/\/(onboarding|login)/);

    // 2. Promote the new account past email verification ───────────────
    // No /api/auth/verify-email endpoint exists today; flip status directly
    // via the gated /api/test/* helper.
    userId = await markUserOnboardedByEmail(request, email);

    // 3. Log in via UI ──────────────────────────────────────────────────
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/);

    // 4. Create a project via UI ───────────────────────────────────────
    await page.goto("/projects/new");
    const title = `E2E Project ${stamp}`;
    await page.getByLabel(/Title/i).fill(title);
    await page.getByLabel(/Description/i).fill("Created by e2e happy-path");
    await page.getByRole("button", { name: /create project/i }).click();

    await page.waitForURL(/\/projects\/[^/]+\?created=1/);
    const projectId = page.url().match(/\/projects\/([^/?]+)/)?.[1];
    expect(projectId).toBeTruthy();

    // 5. Upload a file via the FileUpload widget ───────────────────────
    await page.goto(`/projects/${projectId}/files`);
    await page.getByRole("button", { name: /Nahrát soubory/i }).click();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: "happy-path.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("e2e fixture file"),
    });

    // The status pill renders "Připraven" once confirm() returns ready.
    await expect(page.getByText(/Připraven|ready/i).first()).toBeVisible({
      timeout: 20_000,
    });

    // 6. Look up the uploaded file id, create + publish a version ──────
    const fileId = await getLatestReadyFileId(request, projectId!);

    // Forward the browser session cookie so server-side auth resolves.
    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const versionRes = await request.post(
      `/api/projects/${projectId}/versions`,
      {
        data: { name: "v1.0.0", changelog: "First publish" },
        headers: { cookie: cookieHeader },
      },
    );
    expect(versionRes.status()).toBe(201);
    const draft = (await versionRes.json()) as { id: string; status: string };
    expect(draft.status).toBe("draft");

    const attachRes = await request.post(
      `/api/projects/${projectId}/versions/${draft.id}/files`,
      {
        data: { fileIds: [fileId] },
        headers: { cookie: cookieHeader },
      },
    );
    expect(attachRes.ok()).toBe(true);

    const publishRes = await request.patch(
      `/api/projects/${projectId}/versions/${draft.id}`,
      { headers: { cookie: cookieHeader } },
    );
    expect(publishRes.ok()).toBe(true);
    const published = (await publishRes.json()) as {
      status: string;
      publishedAt: string | null;
    };
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();

    // 7. UI sanity check — version shows on the versions page ──────────
    await page.goto(`/projects/${projectId}/versions`);
    await expect(page.getByText("v1.0.0")).toBeVisible();
  } finally {
    if (userId) await cleanupUser(request, userId);
  }
});
