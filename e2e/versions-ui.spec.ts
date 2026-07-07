import { test, expect } from "./fixtures";

/**
 * Versions UI: create draft (inline form) → publish (confirm dialog) →
 * delete (409 round-trip on a published version, second confirm, retry with
 * ?confirm=true) → redirected back to the (published-only) versions list.
 *
 * UI-driven throughout except project creation, which has no dedicated
 * create form exercised here (happy-path.spec.ts already covers that UI).
 */
test("versions UI: create → publish → delete", async ({
  authedPage: page,
  testUser,
  request,
}) => {
  // Auto-accept every confirm() for the rest of this test: Publish and both
  // steps of the Delete 409 round-trip all go through window.confirm().
  page.on("dialog", (dialog) => dialog.accept());

  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const projRes = await request.post("/api/projects", {
    data: { title: `E2E Versions Project ${stamp}` },
    headers: { cookie: cookieHeader },
  });
  expect(projRes.ok()).toBe(true);
  const project = (await projRes.json()) as { id: string };
  const projectId = project.id;

  // 1. Create a draft version via the inline "New Version" form ──────────
  await page.goto(`/projects/${projectId}/versions`);
  await page.getByRole("button", { name: "New Version" }).click();
  await page.getByLabel("Name").fill("e2e draft");
  await page.getByRole("button", { name: /create draft/i }).click();

  await page.waitForURL(
    new RegExp(`/projects/${projectId}/versions/[^/]+$`),
  );
  const versionId = page.url().match(/\/versions\/([^/?]+)$/)?.[1];
  expect(versionId).toBeTruthy();

  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  // Author line doubles as a sanity check that this is really the
  // authedPage's seeded testUser session driving the create.
  await expect(page.getByText(`Author: ${testUser.displayName}`)).toBeVisible();

  // 2. Publish ─────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("published", { exact: true })).toBeVisible();

  // 3. Delete — published version triggers the 409 confirmation_required
  //    round-trip; the second dialog (server message) is auto-accepted by
  //    the same listener registered above, then the page retries with
  //    ?confirm=true and redirects to the versions list on success. ─────
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(new RegExp(`/projects/${projectId}/versions$`));

  // Default (published-only) view no longer lists the now-deleted version.
  await expect(page.getByText("e2e draft")).not.toBeVisible();

  // Owner "show all" view (?status=all) confirms it's actually gone, not
  // just filtered out of the published-only default.
  await page.goto(`/projects/${projectId}/versions?status=all`);
  await expect(page.getByText("e2e draft")).not.toBeVisible();
});
