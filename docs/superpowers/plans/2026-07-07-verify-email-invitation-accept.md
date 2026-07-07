# Verify-email + Invitation Accept (#138 #139) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two missing halves of existing e-mail flows: `GET /api/auth/verify-email` (issue #138, audit R-7.1-04 — signup e-mail links to a nonexistent endpoint, users stay `unverified` forever) and the invitation accept flow `/invitations/accept` page + `POST /api/invitations/accept` (issue #139, audit RBAC-19/AC-03 — invite e-mail links to a nonexistent page).

**Architecture:** Both are token-redemption flows copying the proven `reset-password` pattern (plaintext unique token, expiry, `usedAt`/status guard, `$transaction`, sibling invalidation). Verify-email is a GET endpoint that redirects to `/login` with a query flag (the e-mail already points there); the login page gains a banner + safe `?next=` redirect. Invitation accept is a client page with an explicit Accept button calling a new auth-required POST API that upserts `ProjectMember`, marks the invitation `accepted`, logs `member_joined` activity, and notifies the inviter. Two `E2E_TEST_MODE`-gated token-fetch routes enable real Playwright e2e specs for both flows.

**Tech Stack:** Next.js 16 (app router), TypeScript 6, Prisma 7, Playwright, `gh` CLI.

## Design decisions (spec)

- **verify-email is a GET with redirect** (not JSON): the e-mail already links `${APP_URL}/api/auth/verify-email?token=...` (src/lib/email.ts:83). Success → redirect `/login?verified=1`; bad/missing token → `/login?verify_error=invalid`; expired → `/login?verify_error=expired`.
- **Status transition:** only `unverified → verified`. Never downgrade `onboarded`/`verified` users; a re-clicked (used) token redirects to success if the account is no longer `unverified` (e-mail-scanner tolerance), else invalid.
- **Accept requires login + identity match:** if `invitation.inviteeUserId` is set it must equal the current user id; otherwise `invitation.inviteeEmail` must equal the current user's e-mail (case-insensitive). Mismatch → 403.
- **Accept is idempotent on membership:** `projectMember.upsert` with `update: {}` (same as applications-accept, route.ts:172-186) — an existing membership keeps its current role; the invitation still flips to `accepted`.
- **RBAC-20:** non-`pending` invitations are rejected 409 (`expireStaleInvitations()` runs first, so overdue `pending` rows become `expired` and hit the same 409).
- **Login `?next=` redirect:** only paths starting with `/` and not `//` are honored (open-redirect guard).

## Global Constraints

- Every npm/npx command MUST run with Node 22 in PATH: prefix `PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH"` (default Node 20 breaks the `test:unit` glob).
- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build` MUST stay green after every task.
- Do not modify e-mail templates (`src/lib/email.ts`), the Prisma schema, or any existing API route except the two login-page-adjacent files named in Task 1. No migrations — all enum values used (`verified`, `accepted`, `member_joined` in both `ActivityAction` and `NotificationType`) already exist in the schema.
- Error-shape convention: `NextResponse.json({ error, code? }, { status })`; success `{ ok: true, ... }`. Copy status-code semantics from reset-password (400 INVALID_TOKEN/EXPIRED) and invitations revoke (409 on bad status).
- Test-only routes MUST be gated `if (process.env.E2E_TEST_MODE !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });` exactly like `src/app/api/test/users/by-email/[email]/onboard/route.ts`.
- Branch: `feat/verify-email-invitation-accept` (already created by the controller).

---

## Task 1: `GET /api/auth/verify-email` + login page banner/next support

**Files:**
- Create: `src/app/api/auth/verify-email/route.ts`
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Produces: `GET /api/auth/verify-email?token=<hex>` → 307 redirect to `/login?verified=1` | `/login?verify_error=invalid|expired`. Login page honors `?verified=1` (green banner), `?verify_error=` (red banner), `?next=<path>` (post-login redirect, `/`-prefixed only).

- [ ] **Step 1: Create the endpoint**

`src/app/api/auth/verify-email/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/verify-email?token=... — target of the signup e-mail link.
 * Redirects to /login with a status flag rather than returning JSON,
 * because the user arrives here by clicking a link in their mail client.
 */
export async function GET(request: NextRequest) {
  const redirectToLogin = (params: string) =>
    NextResponse.redirect(new URL(`/login${params}`, request.nextUrl.origin));

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return redirectToLogin("?verify_error=invalid");
  }

  const verification = await prisma.emailVerification.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { status: true } },
    },
  });

  if (!verification) {
    return redirectToLogin("?verify_error=invalid");
  }

  if (verification.usedAt) {
    // Re-clicked link (mail-scanner prefetch, double click): if the account
    // already made it past unverified, treat as success.
    return verification.user.status !== "unverified"
      ? redirectToLogin("?verified=1")
      : redirectToLogin("?verify_error=invalid");
  }

  if (verification.expiresAt < new Date()) {
    return redirectToLogin("?verify_error=expired");
  }

  await prisma.$transaction([
    ...(verification.user.status === "unverified"
      ? [
          prisma.user.update({
            where: { id: verification.userId },
            data: { status: "verified" },
          }),
        ]
      : []),
    prisma.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate any other outstanding verification tokens for this user
    prisma.emailVerification.updateMany({
      where: {
        userId: verification.userId,
        usedAt: null,
        id: { not: verification.id },
      },
      data: { usedAt: new Date() },
    }),
  ]);

  return redirectToLogin("?verified=1");
}
```

- [ ] **Step 2: Rework the login page — banner + safe `next` redirect**

`src/app/login/page.tsx` currently defines everything inside `export default function LoginPage()` (no `useSearchParams`). Restructure it exactly like `src/app/reset-password/page.tsx` (inner form component + `<Suspense>`):

1. Change the imports (lines 1-6) to:
```tsx
"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Nav } from "@/components/nav";
```
2. Rename the current component body to `function LoginForm()` and inside it, before the state hooks, add:
```tsx
  const searchParams = useSearchParams()!;
  const verified = searchParams.get("verified") === "1";
  const verifyError = searchParams.get("verify_error");
  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;
```
3. In `onSubmit`, replace the redirect decision (currently
`const next = data?.user?.status === "unverified" ? "/onboarding" : "/dashboard"; router.push(next);`) with:
```tsx
      const fallback =
        data?.user?.status === "unverified" ? "/onboarding" : "/dashboard";
      router.push(safeNext ?? fallback);
```
4. In the JSX, directly above the `<form ...>` element, add the banners:
```tsx
          {verified && (
            <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
              Email verified. You can log in now.
            </p>
          )}
          {verifyError && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
              {verifyError === "expired"
                ? "Verification link expired. Please sign up again to receive a new one."
                : "Invalid verification link."}
            </p>
          )}
```
5. The new `export default function LoginPage()` renders the shell (copy the reset-password page structure):
```tsx
export default function LoginPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <h1 className="text-2xl font-bold">Log in</h1>
          <Suspense
            fallback={<p className="text-sm text-neutral-500">Loading…</p>}
          >
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </>
  );
}
```
The `<h1>` moves to the shell; `LoginForm` returns the banners + `<form>` + the links `<div>` (everything that was inside the old `max-w-sm` div except the `<h1>`).

- [ ] **Step 3: Verify + commit**

```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck 2>&1 | tail -5; echo "tc $?"; npm run lint 2>&1 | tail -3; echo "lint $?"; npm run test:unit 2>&1 | tail -4; echo "unit $?"; npm run build >/tmp/b.log 2>&1; echo "build $?"'
git add src/app/api/auth/verify-email/route.ts src/app/login/page.tsx
git commit -m "feat(auth): implement GET /api/auth/verify-email + login banner/next redirect (#138)"
```
Expected: all four gates `0`.

---

## Task 2: `POST /api/invitations/accept`

**Files:**
- Create: `src/app/api/invitations/accept/route.ts`

**Interfaces:**
- Consumes: `getCurrentUser`, `unauthorized`, `forbidden` from `@/lib/auth`; `expireStaleInvitations` from `@/lib/invitations`; `createNotification` from `@/lib/notifications`.
- Produces: `POST /api/invitations/accept` body `{ token: string }` → `200 { ok: true, projectId }` | `401` | `400 { error }` (missing token) | `404 { error }` (unknown token) | `409 { error }` (status not pending) | `403 { error: "Forbidden" }` (identity mismatch).

- [ ] **Step 1: Create the route**

`src/app/api/invitations/accept/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/auth";
import { expireStaleInvitations } from "@/lib/invitations";
import { createNotification } from "@/lib/notifications";

/** POST /api/invitations/accept — redeem an invitation token (AC-03, RBAC-19). */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  // Lazy expiry pass so overdue pending invitations reject consistently (RBAC-20).
  await expireStaleInvitations();

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      id: true,
      projectId: true,
      inviterId: true,
      inviteeEmail: true,
      inviteeUserId: true,
      role: true,
      status: true,
      project: { select: { title: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: `Cannot accept invitation with status: ${invitation.status}` },
      { status: 409 },
    );
  }

  const identityMatches = invitation.inviteeUserId
    ? invitation.inviteeUserId === user.id
    : invitation.inviteeEmail.toLowerCase() === user.email.toLowerCase();
  if (!identityMatches) return forbidden();

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.upsert({
      where: {
        projectId_userId: { projectId: invitation.projectId, userId: user.id },
      },
      create: {
        projectId: invitation.projectId,
        userId: user.id,
        role: invitation.role,
      },
      update: {},
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted", inviteeUserId: user.id },
    });

    await tx.activityLog.create({
      data: {
        projectId: invitation.projectId,
        actorId: user.id,
        action: "member_joined",
        targetType: "invitation",
        targetId: invitation.id,
      },
    });
  });

  // Post-commit, non-blocking (createNotification swallows its own errors).
  await createNotification({
    userId: invitation.inviterId,
    type: "member_joined",
    title: `${user.email} joined ${invitation.project.title}`,
    sourceType: "project",
    sourceId: invitation.projectId,
  });

  return NextResponse.json({ ok: true, projectId: invitation.projectId });
}
```
Before committing, open `src/app/api/projects/[id]/invitations/route.ts` and compare its in-transaction `tx.activityLog.create` field names (`targetType`/`targetId`/`metadata`) and its `createNotification` payload shape for `invitation_received` — if the field names differ from the code above (e.g. the activity log uses a `metadata` JSON or different key casing), match the existing shapes exactly and note the adjustment in your report.

- [ ] **Step 2: Verify + commit**

```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck 2>&1 | tail -5; echo "tc $?"; npm run lint 2>&1 | tail -3; echo "lint $?"; npm run test:unit 2>&1 | tail -4; echo "unit $?"; npm run build >/tmp/b.log 2>&1; echo "build $?"'
git add src/app/api/invitations/accept/route.ts
git commit -m "feat(invitations): POST /api/invitations/accept — token redemption to membership (#139)"
```
Expected: all four gates `0`.

---

## Task 3: `/invitations/accept` page

**Files:**
- Create: `src/app/invitations/accept/page.tsx`

**Interfaces:**
- Consumes: `POST /api/invitations/accept` (Task 2). Login page `?next=` support (Task 1).

- [ ] **Step 1: Create the page**

`src/app/invitations/accept/page.tsx` (conventions copied from `src/app/reset-password/page.tsx` — `"use client"`, inner component, `<Suspense>`, `<Nav />` shell):
```tsx
"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Nav } from "@/components/nav";

function AcceptInvitationCard() {
  const searchParams = useSearchParams()!;
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [success, setSuccess] = useState(false);

  const loginHref = `/login?next=${encodeURIComponent(
    `/invitations/accept?token=${token}`,
  )}`;

  async function onAccept() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push(`/projects/${data.projectId}`), 1500);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-red-600">
        Missing invitation token. Please use the link from your invitation
        e-mail.
      </p>
    );
  }

  if (needsLogin) {
    return (
      <p className="text-sm">
        You need to log in first.{" "}
        <Link href={loginHref} className="text-blue-600 underline">
          Log in and come back
        </Link>
        .
      </p>
    );
  }

  if (success) {
    return (
      <p className="text-sm text-green-700">
        Invitation accepted. Taking you to the project…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        You have been invited to collaborate on a project. Accept to join.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={onAccept}
        disabled={submitting}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Accepting…" : "Accept invitation"}
      </button>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <h1 className="text-2xl font-bold">Project invitation</h1>
          <Suspense
            fallback={<p className="text-sm text-neutral-500">Loading…</p>}
          >
            <AcceptInvitationCard />
          </Suspense>
        </div>
      </main>
    </>
  );
}
```
Before committing, confirm the project detail page route is `/projects/[id]` (`ls src/app/projects`) — if the app uses a different path, adjust the `router.push` target and note it.

- [ ] **Step 2: Verify + commit**

```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck 2>&1 | tail -5; echo "tc $?"; npm run lint 2>&1 | tail -3; echo "lint $?"; npm run test:unit 2>&1 | tail -4; echo "unit $?"; npm run build >/tmp/b.log 2>&1; echo "build $?"'
git add src/app/invitations/accept/page.tsx
git commit -m "feat(invitations): /invitations/accept page with explicit accept action (#139)"
```
Expected: all four gates `0`.

---

## Task 4: Test-only token-fetch routes

**Files:**
- Create: `src/app/api/test/users/by-email/[email]/verification-token/route.ts`
- Create: `src/app/api/test/invitations/by-email/[email]/token/route.ts`

**Interfaces:**
- Produces (E2E_TEST_MODE only): `GET .../verification-token` → `{ token }` (latest unused EmailVerification for that user); `GET .../token` → `{ token }` (latest pending Invitation for that inviteeEmail). Both `404 { error: "Not found" }` outside test mode or when nothing exists.

- [ ] **Step 1: Verification-token route**

`src/app/api/test/users/by-email/[email]/verification-token/route.ts` (gating + param handling copied from the sibling `onboard/route.ts`):
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/test/users/by-email/:email/verification-token — fetch the latest
 * unused e-mail verification token so e2e can exercise the real
 * /api/auth/verify-email endpoint. Gated behind E2E_TEST_MODE=1.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail);
  const verification = await prisma.emailVerification.findFirst({
    where: { user: { email }, usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { token: true },
  });
  if (!verification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ token: verification.token });
}
```

- [ ] **Step 2: Invitation-token route**

`src/app/api/test/invitations/by-email/[email]/token/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/test/invitations/by-email/:email/token — fetch the latest pending
 * invitation token for an invitee e-mail so e2e can exercise the real
 * accept flow. Gated behind E2E_TEST_MODE=1.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail);
  const invitation = await prisma.invitation.findFirst({
    where: { inviteeEmail: email, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { token: true },
  });
  if (!invitation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ token: invitation.token });
}
```

- [ ] **Step 3: Verify + commit**

```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck 2>&1 | tail -5; echo "tc $?"; npm run lint 2>&1 | tail -3; echo "lint $?"; npm run test:unit 2>&1 | tail -4; echo "unit $?"; npm run build >/tmp/b.log 2>&1; echo "build $?"'
git add src/app/api/test/users/by-email/\[email\]/verification-token/ src/app/api/test/invitations/
git commit -m "test: E2E_TEST_MODE token-fetch routes for verify-email and invitation accept"
```
Expected: all four gates `0`.

---

## Task 5: Playwright e2e specs for both flows

**Files:**
- Create: `e2e/verify-email.spec.ts`
- Create: `e2e/invitation-accept.spec.ts`
- Modify (only if needed): `e2e/helpers/db.ts` (add small token-fetch helpers mirroring `markUserOnboardedByEmail`'s style)

**Interfaces:**
- Consumes: everything from Tasks 1-4; existing helpers `seedOnboardedUser`, `cleanupUser` in `e2e/helpers/db.ts`; conventions from `e2e/happy-path.spec.ts` (READ IT FIRST — reuse its signup/login/URL patterns and its cleanup discipline verbatim).

- [ ] **Step 1: Read the existing e2e infrastructure**

Read `e2e/happy-path.spec.ts`, `e2e/helpers/db.ts`, `e2e/fixtures.ts`, and `playwright.config.ts` (also `TESTING.md` if present) to confirm: base URL, how specs obtain `request` context, signup selectors, and how the dev server + DB are expected to run. Adapt the code below to those exact conventions — the flows and assertions are binding, the selector/helper spelling is not.

- [ ] **Step 2: `e2e/verify-email.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { cleanupUser } from "./helpers/db";

test.describe("email verification flow", () => {
  const email = `verify-${Date.now()}@e2e.test`;
  const password = "testpass123";
  let userId: string | null = null;

  test.afterAll(async ({ request }) => {
    if (userId) await cleanupUser(request, userId);
  });

  test("signup → verify link → login works", async ({ page, request }) => {
    // 1. Signup via API (UI signup already covered by happy-path)
    const signupRes = await request.post("/api/auth/signup", {
      data: { email, password },
    });
    expect(signupRes.status()).toBe(201);
    userId = (await signupRes.json()).userId;

    // 2. Unverified login is rejected
    const blockedLogin = await request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(blockedLogin.status()).toBe(403);

    // 3. Fetch the real token and click the real link
    const tokenRes = await request.get(
      `/api/test/users/by-email/${encodeURIComponent(email)}/verification-token`,
    );
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = await tokenRes.json();

    await page.goto(`/api/auth/verify-email?token=${token}`);
    await expect(page).toHaveURL(/\/login\?verified=1/);
    await expect(page.getByText("Email verified")).toBeVisible();

    // 4. Login now succeeds via the UI
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /log in/i }).click();
    await page.waitForURL(/\/(dashboard|onboarding)/);

    // 5. Re-clicking the used link still lands on success (scanner tolerance)
    await page.goto(`/api/auth/verify-email?token=${token}`);
    await expect(page).toHaveURL(/\/login\?verified=1/);

    // 6. Garbage token shows the error banner
    await page.goto(`/api/auth/verify-email?token=not-a-real-token`);
    await expect(page).toHaveURL(/\/login\?verify_error=invalid/);
  });
});
```

- [ ] **Step 3: `e2e/invitation-accept.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { seedOnboardedUser, cleanupUser } from "./helpers/db";

test.describe("invitation accept flow", () => {
  const run = Date.now();
  const ownerEmail = `owner-${run}@e2e.test`;
  const inviteeEmail = `invitee-${run}@e2e.test`;
  const password = "testpass123";
  const ids: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of ids) await cleanupUser(request, id);
  });

  test("invite → accept → membership works end-to-end", async ({
    page,
    request,
  }) => {
    // 1. Seed owner + invitee (both onboarded), owner creates a project
    ids.push(await seedOnboardedUser(request, ownerEmail, password));
    ids.push(await seedOnboardedUser(request, inviteeEmail, password));

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
    await page.getByRole("button", { name: /log in/i }).click();
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
```
Adapt to reality (Step 1 findings): the invitations POST body shape (`emails` array vs single `email`), project-create response field, `seedOnboardedUser`'s signature, and whether `request` (shared context) holds cookies between calls — if each API call needs an explicit auth cookie, follow how `happy-path.spec.ts` handles authenticated API calls. Keep every assertion (403 before verify, 200 after; 409 replay; URL redirects) — they encode the acceptance criteria.

- [ ] **Step 4: Run the e2e suite locally**

Follow the repo's documented e2e procedure (TESTING.md / playwright.config.ts — likely: ephemeral Postgres like `scripts/rbac-integration-check.sh`, `E2E_TEST_MODE=1` dev server, then `npm run test:e2e -- verify-email invitation-accept`). Both new specs MUST pass. `happy-path.spec.ts` must still pass (it exercises signup/login too). If the environment cannot be brought up, report BLOCKED with the exact failure — do not mark this task done on typecheck alone.

- [ ] **Step 5: Verify + commit**

```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck 2>&1 | tail -5; echo "tc $?"; npm run lint 2>&1 | tail -3; echo "lint $?"'
git add e2e/
git commit -m "test(e2e): verify-email and invitation-accept flows (#138 #139)"
```
Expected: both gates `0`, e2e evidence in the report.

---

## Task 6: Full verification + PR

**Files:** none changed.

- [ ] **Step 1: Full gates + RBAC regression check**

```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck 2>&1 | tail -5; echo "tc $?"; npm run lint 2>&1 | tail -3; echo "lint $?"; npm run test:unit 2>&1 | tail -4; echo "unit $?"; npm run build >/tmp/b.log 2>&1; echo "build $?"'
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" ./scripts/rbac-integration-check.sh
```
Expected: four gates `0`; RBAC script `RESULT: all 5 assertions passed` (proves no authz regression).

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/verify-email-invitation-accept
gh pr create --base master --title "feat: verify-email endpoint + invitation accept flow (#138 #139)" --body "$(cat <<'EOF'
Implements the two missing halves of existing e-mail flows (audit R-7.1-04, RBAC-19, AC-03).

## #138 — GET /api/auth/verify-email
The signup e-mail's link now works: token redemption per the reset-password pattern (unused + unexpired → status unverified→verified, usedAt set, sibling tokens invalidated), redirecting to /login?verified=1 with a banner. Used-token re-clicks tolerate mail scanners (success redirect when the account is already past unverified). Login page additionally honors a safe ?next= redirect.

## #139 — invitation accept flow
/invitations/accept page (explicit Accept button) + POST /api/invitations/accept: requires login, identity must match the invitation (inviteeUserId or inviteeEmail), pending-only (409 otherwise — RBAC-20), lazy expiry pass, then ProjectMember upsert with the invited role, invitation → accepted, member_joined activity + notification to the inviter.

## Tests
- Two new Playwright specs exercising the real flows end-to-end (signup→verify→login; invite→accept→membership; replay/negative cases), enabled by two new E2E_TEST_MODE-gated token-fetch routes.
- Full gates green; scripts/rbac-integration-check.sh 5/5 (no authz regression).

Closes #138
Closes #139

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Issue coverage:** #138 → Task 1 (endpoint + login UX); #139 → Tasks 2+3 (API + page); both proven by Task 5 e2e against the real endpoints (the audit's core complaint was that e-mails point at nothing — Task 5's specs click the actual e-mail URLs).
- **Placeholder scan:** all steps carry complete code; the two "adapt to reality" notes in Tasks 2/5 are bounded verification instructions against named files, with the binding assertions spelled out — not open TODOs.
- **Type consistency:** `{ token }` body/query param naming consistent across Tasks 1-5; `projectId` returned by accept API (Task 2) is what the page (Task 3) and spec (Task 5) consume; test-route paths in Task 4 match the URLs used in Task 5; enum values used (`verified`, `accepted`, `member_joined`) verified present in schema.prisma (lines 14-19, 291-296, 357, 448) by the scout pass — no migration needed.
