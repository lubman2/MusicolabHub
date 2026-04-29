import { randomBytes } from "crypto";
import { getDb } from "./db";

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/** Default password used by happy-path tests; meets the signup policy. */
export const TEST_PASSWORD = "Test1234!";

/** Generate a unique e2e email — `e2e+<rand>@musicolabhub.test`. */
export function uniqueEmail(prefix = "e2e"): string {
  const rand = randomBytes(6).toString("hex");
  return `${prefix}+${rand}@musicolabhub.test`;
}

/**
 * Mark a user as verified so they can log in (bypass email verification).
 *
 * Email verification has no public callback route in the app today, so tests
 * flip the status directly. Login only blocks `unverified` and `suspended`,
 * so `verified` is enough to clear it.
 */
export async function activateUser(email: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE "User" SET status = 'verified'::"UserStatus" WHERE email = $1`,
    [email],
  );
}

/**
 * Look up a user's id by email. Returns null if the user doesn't exist.
 */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  const db = await getDb();
  const res = await db.query<{ id: string }>(
    `SELECT id FROM "User" WHERE email = $1`,
    [email],
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Delete a user and any data owned by them (projects, files, versions, etc.).
 *
 * Most relations have ON DELETE CASCADE from User, but ActivityLog.actorId
 * uses ON DELETE RESTRICT so we tear those down explicitly first.
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  const db = await getDb();
  const userRes = await db.query<{ id: string }>(
    `SELECT id FROM "User" WHERE email = $1`,
    [email],
  );
  const userId = userRes.rows[0]?.id;
  if (!userId) return;

  // Project-scoped data — projects cascade-delete on owner, but ActivityLog
  // restricts on actor, so wipe activity rows for projects this user owns.
  const projectIds = (
    await db.query<{ id: string }>(
      `SELECT id FROM "Project" WHERE "ownerId" = $1`,
      [userId],
    )
  ).rows.map((r) => r.id);

  if (projectIds.length > 0) {
    await db.query(
      `DELETE FROM "ActivityLog" WHERE "projectId" = ANY($1::text[])`,
      [projectIds],
    );
  }
  // Any ActivityLog rows where this user is the actor on a project they
  // don't own (commenter, member, etc.) — also need to go.
  await db.query(`DELETE FROM "ActivityLog" WHERE "actorId" = $1`, [userId]);

  await db.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
}
