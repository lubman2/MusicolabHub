import type { APIRequestContext } from "@playwright/test";

export interface SeededUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

/**
 * Seed a verified+onboarded user via the gated /api/test/users endpoint
 * (only mounted when E2E_TEST_MODE=1).
 */
export async function seedOnboardedUser(
  request: APIRequestContext,
  overrides: Partial<{ email: string; password: string; displayName: string }> = {},
): Promise<SeededUser> {
  const res = await request.post("/api/test/users", { data: overrides });
  if (!res.ok()) {
    throw new Error(
      `Failed to seed user (${res.status()}). Is the dev server running with E2E_TEST_MODE=1?`,
    );
  }
  return (await res.json()) as SeededUser;
}

/**
 * Promote a freshly signed-up user from `unverified` to `onboarded` without
 * the email link. Workaround for the missing /api/auth/verify-email endpoint.
 */
export async function markUserOnboardedByEmail(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const res = await request.post(
    `/api/test/users/by-email/${encodeURIComponent(email)}/onboard`,
  );
  if (!res.ok()) {
    throw new Error(`Failed to onboard user ${email}: ${res.status()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function cleanupUser(
  request: APIRequestContext,
  userId: string,
): Promise<void> {
  await request.delete(`/api/test/users/${userId}`).catch(() => {
    // best-effort
  });
}

export async function getLatestReadyFileId(
  request: APIRequestContext,
  projectId: string,
): Promise<string> {
  const res = await request.get(`/api/test/projects/${projectId}/files/latest`);
  if (!res.ok()) {
    throw new Error(`No ready file for project ${projectId}: ${res.status()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}
