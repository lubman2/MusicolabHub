# Testing

This project uses **Playwright** for end-to-end (E2E) tests. The E2E suite
exercises the app through a real browser against a real Next.js dev server
backed by a real Postgres database.

> Unit/integration tests are tracked separately in future epics.

---

## Layout

```
e2e/
├── fixtures/
│   ├── db.ts        # Singleton Prisma client used only in tests
│   ├── users.ts     # createTestUser / activateUser / deleteUserByEmail
│   └── files.ts     # seedReadyFile  (bypasses S3 — see "S3 strategy" below)
└── happy-path.spec.ts
```

Tests do **not** import anything from `src/lib/prisma.ts`. The fixture-side
Prisma client (`e2e/fixtures/db.ts`) is owned by the test process and is
disconnected in `afterAll` to avoid leaked handles.

---

## Prerequisites

1. **Postgres** running and reachable via `DATABASE_URL`.
2. **Migrations** applied: `npx prisma migrate deploy`.
3. **Browser** installed: `npx playwright install chromium`.
4. `NEXTAUTH_SECRET` set (the dev server fails to start without it).

`.env.example` lists every variable the app reads. The E2E suite needs only
`DATABASE_URL` and `NEXTAUTH_SECRET` to be real — S3 and Stripe values can be
left as placeholders, since those flows are stubbed in fixtures (see below).

---

## Run

```bash
# Default: starts a dev server on :3100 and runs all specs headlessly
npm run test:e2e

# With a visible browser (for debugging)
npm run test:e2e:headed

# Interactive UI mode
npm run test:e2e:ui

# Open the last HTML report
npm run test:e2e:report
```

If a dev server is already running, set `E2E_NO_WEBSERVER=1` to reuse it.
Override the port with `E2E_PORT=3210` and the URL with `E2E_BASE_URL`.

---

## What the happy path covers

`e2e/happy-path.spec.ts` walks the core flow that a brand-new user would take:

1. **Sign up** through `/signup` (UI form submit hits `/api/auth/signup`)
2. **Activate** the user — the public `/api/auth/verify-email` callback is
   not implemented yet, so the fixture flips `User.status = "active"` directly.
3. **Log in** through `/login`
4. **Create a project** through `/projects/new`
5. **Attach a "ready" file** — fixture-seeded directly in the DB to skip the
   S3 round-trip (see *S3 strategy* below).
6. **Create + publish a draft version** through the API.
7. **Verify** the published version renders on its detail page.

Each test creates a fresh user with a unique `e2e+<rand>@musicolabhub.test`
email and tears it down (along with all owned projects, files, versions, and
activity entries) in `afterEach`.

---

## S3 strategy

File uploads go through:

```
client → POST /api/projects/:id/files/upload-url   (returns presigned PUT URL)
client → PUT  s3://...                             (real S3)
client → POST /api/projects/:id/files/confirm      (HEAD-checks S3, marks ready)
```

The middle step requires a real S3 bucket. CI environments don't have one,
so the happy path fabricates a `ProjectFile` row with `status = "ready"`
directly via Prisma in `e2e/fixtures/files.ts`. The S3 contract itself is
covered by separate API/integration tests (future epic).

When the upload-URL flow needs end-to-end validation, point
`AWS_*` env vars at LocalStack or MinIO and replace the fixture call with the
real flow — the rest of the test stays identical.

---

## Adding a new E2E test

1. Drop a new file under `e2e/` matching `*.spec.ts`.
2. Reuse the user fixture pattern:

   ```ts
   import { test, expect } from "@playwright/test";
   import {
     TEST_PASSWORD, activateUser, deleteUserByEmail, uniqueEmail,
   } from "./fixtures/users";

   test.describe("my flow", () => {
     let email: string;
     test.beforeEach(() => { email = uniqueEmail(); });
     test.afterEach(async () => { await deleteUserByEmail(email); });

     test("does the thing", async ({ page }) => {
       // ...
     });
   });
   ```

3. **Always clean up state you create.** Tests run sequentially (workers=1)
   today, but adding cleanup keeps the suite parallelizable.
4. **Prefer UI assertions for user-visible behavior**; reach for the API
   only when the UI doesn't expose the step (e.g. publishing a version
   today happens via `PATCH`).
5. Use unique IDs (timestamps, random tokens) for any titles or names you
   create — never rely on a fixed string that could collide with seed data.

---

## CI considerations

`playwright.config.ts` already sets:

- `forbidOnly` when `CI=1` (so an accidental `test.only` fails the build)
- `retries: 2` on CI to absorb dev-server cold-start jitter
- `reporter: ["github", "html"]` on CI for inline annotations + report artifact

CI must:

1. Bring up Postgres
2. `npx prisma migrate deploy`
3. `npx playwright install --with-deps chromium`
4. `npm run test:e2e`

Artifacts to upload: `playwright-report/`, `test-results/`.

---

## Out of scope (tracked in follow-ups)

- Gigs/marketplace flows (EPIC-10)
- Hire approval flow (EPIC-11)
- Stripe payment + payout flows (EPIC-08, EPIC-12)
- Mobile viewport tests
- API smoke tests
