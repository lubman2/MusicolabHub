# Testing

## End-to-end tests (Playwright)

The `e2e/` directory holds the Playwright suite. The first test (`happy-path.spec.ts`) exercises the core auth + project flow:
**signup → email-verification stub → login → create project → upload file → create + publish version**.

### Prerequisites

The suite drives a real Next.js dev server backed by a real Postgres database. You need:

1. **Postgres** with the schema applied:
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost:5432/musiccollabhub_e2e"
   npx prisma migrate deploy
   ```
   Use a dedicated database — tests create + delete users.

2. **Required env vars** (`.env.local` is fine):
   - `DATABASE_URL` — Postgres connection
   - `NEXTAUTH_SECRET` — any 32+ byte string
   - `AWS_S3_BUCKET` — any value (real S3 calls are mocked, see below)
   - `AWS_REGION` — e.g. `eu-central-1`
   - `APP_URL` — `http://127.0.0.1:3100`

3. **Browsers** (one-time, ~150 MB):
   ```bash
   npx playwright install chromium
   ```

### Running

```bash
npm run test:e2e           # headless
npm run test:e2e:headed    # with visible browser
npm run test:e2e:ui        # Playwright UI mode
```

Playwright spawns `next dev` on port 3100 with `E2E_TEST_MODE=1`. To point the suite at an already-running server, set `E2E_BASE_URL=http://localhost:3000`.

### How the test side-steps real infrastructure

- **Test-only API surface** — when `E2E_TEST_MODE=1`, the routes under `src/app/api/test/*` are live: seed a user, mark a user `onboarded`, fetch the latest ready file id, delete a user. Every handler returns `404` when the env var is unset, so the surface effectively does not exist in production.
- **Email verification** — there is no `/api/auth/verify-email` endpoint yet. The test calls `POST /api/test/users/by-email/:email/onboard` to flip the freshly signed-up user from `unverified` to `onboarded`. When the real verify endpoint lands, replace `markUserOnboardedByEmail` in `e2e/helpers/db.ts` with a token-link click.
- **S3 uploads** — `src/lib/s3.ts::checkFileExists` short-circuits to `true` when `E2E_TEST_MODE=1`. The Playwright test additionally intercepts the presigned `PUT` request (matched by the `X-Amz-Signature=` query param) and fulfills it with `200 OK`. See `e2e/fixtures.ts::mockS3Upload`.
- **Email send** — `sendVerificationEmail` already no-ops when `SMTP_HOST` is unset (it just `console.log`s the link), so no SMTP is required.

### Adding a new test

1. **Pick a happy path.** Frame it as user goal (e.g. "creator hires a freelancer for a gig"), not a single endpoint.
2. **Reuse fixtures from `e2e/fixtures.ts`:**
   ```ts
   import { test, expect } from "./fixtures";

   test("dashboard shows owned projects", async ({ authedPage, testUser }) => {
     await authedPage.goto("/dashboard");
     await expect(authedPage.getByText(testUser.displayName)).toBeVisible();
   });
   ```
   - `testUser` — pre-seeded onboarded user, plaintext credentials, auto-cleanup
   - `authedPage` — `Page` already logged in via the login form
3. **Prefer UI assertions.** Drive the user-visible flow when one exists; fall back to API calls for capabilities without UI yet (e.g. publishing a version).
4. **Mock external services**, don't call them. Use `page.route(/X-Amz-Signature=/, …)` for S3, or extend `fixtures.ts` for new mocks (Stripe, etc.).
5. **Always clean up.** Wrap mutations in `try/finally` and delete via `cleanupUser(userId)` so failed runs don't pollute the DB.
6. **Keep tests independent.** No shared state between specs — each test seeds its own user. `playwright.config.ts` sets `workers: 1` for now to avoid DB write contention; reconsider once the DB-cleanup story is more robust.

### Out of scope (future epics)

- Marketplace / gig flows (EPIC-10)
- Hire approval (EPIC-11)
- Stripe payments + payouts (EPIC-08, EPIC-12)
- Mobile viewport tests
- API smoke tests (separate harness)
