import { test, expect } from "@playwright/test";
import { seedOnboardedUser, cleanupUser } from "./helpers/db";

/**
 * Invitation accept flow (#139): owner invites → invitee fetches the real
 * token → logs in via UI → accepts on /invitations/accept → lands as a
 * project member → replaying the same token is rejected (RBAC-20).
 */
test.describe("invitation accept flow", () => {
  const run = Date.now();
  const ownerEmail = `owner-${run}@e2e.test`;
  const inviteeEmail = `invitee-${run}@e2e.test`;
  const password = "E2eTest1234!";
  const ids: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of ids) await cleanupUser(request, id);
  });

  test("invite → accept → membership works end-to-end", async ({
    page,
    request,
  }) => {
    // 1. Seed owner + invitee (both onboarded), owner creates a project
    const owner = await seedOnboardedUser(request, {
      email: ownerEmail,
      password,
    });
    ids.push(owner.id);
    const invitee = await seedOnboardedUser(request, {
      email: inviteeEmail,
      password,
    });
    ids.push(invitee.id);

    const ownerLogin = await request.post("/api/auth/login", {
      data: { email: ownerEmail, password },
    });
    expect(ownerLogin.ok()).toBeTruthy();

    const projectRes = await request.post("/api/projects", {
      data: { title: `Invite e2e ${run}` },
    });
    expect(projectRes.ok()).toBeTruthy();
    const projectId = (await projectRes.json()).id;

    // 2. Owner invites the invitee as editor
    const inviteRes = await request.post(
      `/api/projects/${projectId}/invitations`,
      { data: { emails: [inviteeEmail], role: "editor" } },
    );
    expect(inviteRes.ok()).toBeTruthy();

    const tokenRes = await request.get(
      `/api/test/invitations/by-email/${encodeURIComponent(inviteeEmail)}/token`,
    );
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = await tokenRes.json();

    // 3. Invitee logs in via UI, opens the accept page, accepts
    await page.goto("/login");
    await page.getByLabel("Email").fill(inviteeEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/invitations/accept?token=${token}`);
    await page.getByRole("button", { name: /accept invitation/i }).click();
    await page.waitForURL(new RegExp(`/projects/${projectId}`));

    // 4. Accepted invitation is not reusable (RBAC-20)
    const replay = await page.request.post("/api/invitations/accept", {
      data: { token },
    });
    expect(replay.status()).toBe(409);
  });
});
