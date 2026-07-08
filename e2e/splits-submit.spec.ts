import { test, expect } from "@playwright/test";
import { seedOnboardedUser, cleanupUser, addProjectMember } from "./helpers/db";

const PASSWORD = "E2eTest1234!";

/**
 * Splits submit-for-confirmation flow (#143).
 *
 * Owner + contributor are seeded via the API. The contributor is added as a
 * `ProjectMember` directly via a new gated `/api/test/projects/:id/members`
 * helper (see e2e/helpers/db.ts::addProjectMember) — this branch has no
 * invitation-accept flow yet (that's a separate, unmerged PR), and the
 * contributors route requires the target user to already be a project
 * member, so there is otherwise no reachable path to satisfy that check.
 *
 * The owner then drives the actual UI: submit is enabled once contributor
 * percentages total exactly 100%, disabled otherwise, and clicking it
 * flips the split's status badge to "pending confirmation" via the
 * confirm() → POST /submit → refetch flow.
 */
test("splits submit: enabled at 100%, disabled otherwise, notifies the contributor", async ({
  page,
  request,
  browser,
}) => {
  const stamp =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const owner = await seedOnboardedUser(request, {
    email: `e2e-split-owner-${stamp}@e2e.test`,
    password: PASSWORD,
  });
  const contributor = await seedOnboardedUser(request, {
    email: `e2e-split-contrib-${stamp}@e2e.test`,
    password: PASSWORD,
  });

  try {
    // Auto-accept the "Submit this split..." confirm() dialog.
    page.on("dialog", (dialog) => dialog.accept());

    // Owner logs in via the UI (matches happy-path's login convention).
    await page.goto("/login");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill(owner.password);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL(/\/dashboard/);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Owner creates the project via API.
    const projRes = await request.post("/api/projects", {
      data: { title: `E2E Splits Project ${stamp}` },
      headers: { cookie: cookieHeader },
    });
    expect(projRes.ok()).toBe(true);
    const project = (await projRes.json()) as { id: string };
    const projectId = project.id;

    // Contributor must be a project member before they can be added to a
    // split — see the note above.
    await addProjectMember(request, projectId, contributor.id);

    // --- Split A: contributor fully allocated at 100% ────────────────
    const splitARes = await request.post(`/api/projects/${projectId}/splits`, {
      headers: { cookie: cookieHeader },
    });
    expect(splitARes.status()).toBe(201);
    const splitA = (await splitARes.json()) as { id: string };

    const contribARes = await request.post(
      `/api/projects/${projectId}/splits/${splitA.id}/contributors`,
      {
        data: { userId: contributor.id, role: "songwriter", percentage: 100 },
        headers: { cookie: cookieHeader },
      },
    );
    expect(contribARes.status()).toBe(201);

    await page.goto(`/projects/${projectId}/splits/${splitA.id}`);
    const submitButtonA = page.getByRole("button", {
      name: "Submit for Confirmation",
    });
    await expect(submitButtonA).toBeEnabled();

    const [submitResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith(`/splits/${splitA.id}/submit`) &&
          res.request().method() === "POST",
      ),
      submitButtonA.click(),
    ]);
    expect(submitResponse.ok()).toBe(true);

    await expect(
      page.getByText("pending confirmation", { exact: true }),
    ).toBeVisible();

    // --- Split B: contributor only at 50% — submit stays disabled ────
    const splitBRes = await request.post(`/api/projects/${projectId}/splits`, {
      headers: { cookie: cookieHeader },
    });
    expect(splitBRes.status()).toBe(201);
    const splitB = (await splitBRes.json()) as { id: string };

    const contribBRes = await request.post(
      `/api/projects/${projectId}/splits/${splitB.id}/contributors`,
      {
        data: { userId: contributor.id, role: "songwriter", percentage: 50 },
        headers: { cookie: cookieHeader },
      },
    );
    expect(contribBRes.status()).toBe(201);

    await page.goto(`/projects/${projectId}/splits/${splitB.id}`);
    await expect(
      page.getByRole("button", { name: "Submit for Confirmation" }),
    ).toBeDisabled();

    // --- Pragmatic notification assertion ─────────────────────────────
    // What this checks, precisely: that the submit route's contributor
    // notification loop (the line-111 TODO the plan asked Task 1 to
    // implement) actually persisted a `split_submitted` Notification row
    // for the contributor, with sourceType "split_confirmation" pointing
    // at their SplitConfirmation id. We verify this by logging the
    // contributor in (a second browser context, since the owner's page
    // above already holds the owner's session) and hitting the real
    // GET /api/notifications endpoint — not by re-deriving the
    // confirmation id from the submit response and merely checking that
    // /api/splits/confirmations/:id is *reachable* (that would only prove
    // the id exists, not that a notification was created).
    const contributorContext = await browser.newContext();
    const contributorPage = await contributorContext.newPage();
    try {
      await contributorPage.goto("/login");
      await contributorPage.getByLabel("Email").fill(contributor.email);
      await contributorPage.getByLabel("Password").fill(contributor.password);
      await contributorPage
        .getByRole("button", { name: /^log in$/i })
        .click();
      await contributorPage.waitForURL(/\/dashboard/);

      const notifRes = await contributorPage.request.get(
        "/api/notifications",
      );
      expect(notifRes.ok()).toBe(true);
      const notifBody = (await notifRes.json()) as {
        data: Array<{
          type: string;
          sourceType: string | null;
          sourceId: string | null;
        }>;
      };
      const splitNotification = notifBody.data.find(
        (n) => n.type === "split_submitted",
      );
      expect(splitNotification).toBeTruthy();
      expect(splitNotification?.sourceType).toBe("split_confirmation");
      expect(splitNotification?.sourceId).toBeTruthy();
    } finally {
      await contributorContext.close();
    }
  } finally {
    // Delete the owner first: Project has onDelete: Cascade on ownerId,
    // which cascades away SplitRecord → SplitContributor → SplitConfirmation
    // (and ProjectMember). Only after that is the contributor user free of
    // FK references (SplitContributor.userId has no cascade) and safe to
    // delete cleanly.
    await cleanupUser(request, owner.id);
    await cleanupUser(request, contributor.id);
  }
});
