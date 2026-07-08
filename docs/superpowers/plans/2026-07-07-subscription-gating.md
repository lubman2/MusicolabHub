# Subscription Gating + trialEndsAt Persistence (#137) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing-but-never-called `withActiveSubscription("write", …)` gate onto every creative write route (create project, upload, create/publish version, publish gig) and persist `trialEndsAt` from Stripe so trials actually expire in production (audit R-8.4-03, DEC-08, RBAC-55/56/57, AC-06).

**Architecture:** Zero new mechanisms. The decision logic inside `src/lib/subscription.ts` is extracted into a pure, unit-tested `decideSubscriptionAccess` (same pattern as `decideProjectPermission`), consumed by both existing helpers with zero behavior change. `trialEndsAt` gets an authoritative writer (both webhook subscription handlers, from `stripeSub.trial_end`) plus a provisional writer (checkout upsert `create`, `now + TRIAL_PERIOD_DAYS`) so a delayed webhook can't leave an eternal NULL-trial. Six route handlers are wrapped with `withActiveSubscription("write", …)` — the wrapper replaces their `getCurrentUser` 401 block (it does the same thing) while project-level RBAC stays untouched. The E2E test-user route seeds a trialing subscription so existing e2e/integration flows keep working.

**Tech Stack:** Next.js 16, Prisma 7, Stripe SDK 22.3, `node:test` + `tsx`.

## Design decisions (spec)

- **The gate is the existing wrapper, not inline checks** — it already has the admin bypass, lazy `expireTrialIfDue`, grace-window semantics, and `{ error, code, redirect }` response shapes the audit reviewed and approved (DEC-08 🟡 "semantika odpovídá").
- **Gated routes (write = create/upload/publish per DEC-08):** `POST /api/projects`, `POST /api/projects/[id]/files/upload-url`, `POST /api/projects/[id]/files/confirm`, `POST /api/projects/[id]/versions`, `PATCH /api/projects/[id]/versions/[versionId]`, `POST /api/projects/[id]/gigs`. Plus a bounded check of `src/app/api/gigs/[id]/route.ts`: if it carries a draft→published status transition, gate that handler too. NOT gated: reads/downloads, metadata edits, comments, invitations, hires/payments (separate billing domain), admin routes.
- **Gate order:** the wrapper runs before project-level RBAC (account-level billing before project-level role). A role-denied viewer without a subscription now gets the subscription 403 first — same status code, different body; acceptable and documented.
- **`trialEndsAt` writers:** webhook `handleSubscriptionCreated` + `handleSubscriptionUpdated` write `new Date(stripeSub.trial_end * 1000)` when `trial_end` is present (authoritative); checkout upsert's `create` block writes a provisional `now + TRIAL_PERIOD_DAYS` (defense against webhook delay/loss — overwritten by the webhook).
- **DEC-08 read-for-expired divergence stands:** `withActiveSubscription` blocks even read for `expired`/`canceled`, stricter than DEC-08's "read may remain". We gate only WRITE routes, so the read branch never fires through these call sites — no change to that semantic in this plan; noted in the PR.
- **E2E compatibility:** `/api/test/users` additionally creates a `Subscription { plan: "trial", status: "trialing", trialEndsAt: now+14d }` for each test user (E2E_TEST_MODE-only route), keeping happy-path/invitation e2e and future specs working. `prisma/seed.ts` is untouched (only creator1 has a sub — acceptable for dev, noted in PR).
- **Verification:** unit tests pin the pure decision matrix; local integration proves the live gate end-to-end: no-sub 403, trialing 200, past-due-in-grace 200, past-due-out-of-grace 403, expired 403, admin bypass 200, and the lazy-expiry chain (trialing + past `trialEndsAt` → first gated call flips status to `expired` and 403s) — the last one is the production-critical proof that gating + trialEndsAt persistence compose.

## Global Constraints

- Every npm/npx command MUST run with Node 22 in PATH: prefix `PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH"`.
- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build` MUST stay green after every task.
- No Prisma schema changes. No changes to `withActiveSubscription`'s response shapes or status semantics (the extraction must be behavior-identical).
- Inside gated handlers: keep `authorizeProjectPermission` and all validation/business logic untouched; only the auth-derivation changes (`ctx.user` replaces the `getCurrentUser` + 401 block).
- Branch: `feat/subscription-gating` (created by the controller).

---

## Task 1: Extract pure `decideSubscriptionAccess` + unit tests

**Files:**
- Modify: `src/lib/subscription.ts`
- Create: `src/lib/subscription.test.ts`

**Interfaces:**
- Produces: `decideSubscriptionAccess(input: { status: SubscriptionStatus | null; accessLevel: "read" | "write"; currentPeriodEnd: Date | null; now: Date }): { allowed: boolean; code?: "NO_SUBSCRIPTION" | "SUBSCRIPTION_PAST_DUE" | "SUBSCRIPTION_INACTIVE" }` — pure, prisma-free.

- [ ] **Step 1: Read `src/lib/subscription.ts` completely** — the extraction must reproduce its branch semantics exactly: `status null` (no row) → deny NO_SUBSCRIPTION; `trialing|active` → allow; `past_due` → read allows, write allows iff `currentPeriodEnd && currentPeriodEnd > now`, else deny SUBSCRIPTION_PAST_DUE; anything else (`canceled|expired`) → deny SUBSCRIPTION_INACTIVE.

- [ ] **Step 2: Write the failing tests** (`src/lib/subscription.test.ts`, style of rbac.test.ts):
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSubscriptionAccess } from "./subscription";

const now = new Date("2026-07-07T12:00:00Z");
const future = new Date("2026-07-10T12:00:00Z");
const past = new Date("2026-07-01T12:00:00Z");

test("no subscription row denies with NO_SUBSCRIPTION", () => {
  assert.deepEqual(
    decideSubscriptionAccess({ status: null, accessLevel: "write", currentPeriodEnd: null, now }),
    { allowed: false, code: "NO_SUBSCRIPTION" },
  );
});
test("trialing and active allow write", () => {
  assert.equal(decideSubscriptionAccess({ status: "trialing", accessLevel: "write", currentPeriodEnd: null, now }).allowed, true);
  assert.equal(decideSubscriptionAccess({ status: "active", accessLevel: "write", currentPeriodEnd: null, now }).allowed, true);
});
test("past_due always allows read", () => {
  assert.equal(decideSubscriptionAccess({ status: "past_due", accessLevel: "read", currentPeriodEnd: null, now }).allowed, true);
});
test("past_due allows write inside the grace window", () => {
  assert.equal(decideSubscriptionAccess({ status: "past_due", accessLevel: "write", currentPeriodEnd: future, now }).allowed, true);
});
test("past_due denies write after the grace window", () => {
  assert.deepEqual(
    decideSubscriptionAccess({ status: "past_due", accessLevel: "write", currentPeriodEnd: past, now }),
    { allowed: false, code: "SUBSCRIPTION_PAST_DUE" },
  );
});
test("canceled and expired deny even read", () => {
  assert.deepEqual(
    decideSubscriptionAccess({ status: "canceled", accessLevel: "read", currentPeriodEnd: null, now }),
    { allowed: false, code: "SUBSCRIPTION_INACTIVE" },
  );
  assert.deepEqual(
    decideSubscriptionAccess({ status: "expired", accessLevel: "write", currentPeriodEnd: future, now }),
    { allowed: false, code: "SUBSCRIPTION_INACTIVE" },
  );
});
```

- [ ] **Step 3: RED** — `PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" npm run test:unit 2>&1 | tail -12` → FAIL (not exported).

- [ ] **Step 4: Implement + rewire.** Add the pure function to `subscription.ts` (type imported from generated prisma, type-only). Rewire `withActiveSubscription` and `getSubscriptionStatus` so every allow/deny branch decision comes from `decideSubscriptionAccess` — the wrapper keeps its own 401, admin bypass, `expireTrialIfDue` call, and the exact response bodies (`{ error, code, redirect }` strings unchanged); it just asks the pure function instead of switching inline. `getSubscriptionStatus` keeps its return shape (`canRead`/`canWrite` = two calls of the pure fn; `graceRemaining` calc untouched).

- [ ] **Step 5: GREEN + gates + commit**
```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck >/tmp/t.log 2>&1; echo "tc $?"; npm run lint >/tmp/l.log 2>&1; echo "lint $?"; npm run test:unit 2>&1 | tail -4; npm run build >/tmp/b.log 2>&1; echo "build $?"'
git add src/lib/subscription.ts src/lib/subscription.test.ts
git commit -m "refactor(billing): extract pure decideSubscriptionAccess with branch tests (#137)"
```

---

## Task 2: Persist `trialEndsAt` (webhook authoritative + checkout provisional)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (`handleSubscriptionCreated` ~L160-191, `handleSubscriptionUpdated` ~L195-241)
- Modify: `src/app/api/billing/checkout/route.ts` (upsert ~L79-91)

- [ ] **Step 1: Webhook.** In BOTH handlers' subscription-update `data`, add (mirroring the existing `getSubscriptionPeriodEnd` conditional pattern):
```ts
      ...(stripeSub.trial_end
        ? { trialEndsAt: new Date(stripeSub.trial_end * 1000) }
        : {}),
```
(`trial_end` is unix seconds on the Stripe subscription object; absent/null for non-trial subs → field untouched.) Nothing else in the handlers changes.

- [ ] **Step 2: Checkout provisional.** In the checkout route's `prisma.subscription.upsert`, extend ONLY the `create` block:
```ts
        trialEndsAt: new Date(Date.now() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000),
```
(`TRIAL_PERIOD_DAYS` already imported/used in this file at ~L69 — verify the import. `update` block untouched: an existing row's trial timing is owned by the webhook.) Add a one-line comment: provisional; overwritten by the webhook's authoritative `trial_end`.

- [ ] **Step 3: Gates + commit**
```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck >/tmp/t.log 2>&1; echo "tc $?"; npm run lint >/tmp/l.log 2>&1; echo "lint $?"; npm run test:unit 2>&1 | tail -4; npm run build >/tmp/b.log 2>&1; echo "build $?"'
git add src/app/api/webhooks/stripe/route.ts src/app/api/billing/checkout/route.ts
git commit -m "fix(billing): persist trialEndsAt from Stripe trial_end + provisional at checkout (#137)"
```

---

## Task 3: Gate the write routes + E2E test-user subscription

**Files:**
- Modify: `src/app/api/projects/route.ts` (POST ~L115)
- Modify: `src/app/api/projects/[id]/files/upload-url/route.ts` (POST ~L38)
- Modify: `src/app/api/projects/[id]/files/confirm/route.ts` (POST ~L7)
- Modify: `src/app/api/projects/[id]/versions/route.ts` (POST ~L126)
- Modify: `src/app/api/projects/[id]/versions/[versionId]/route.ts` (PATCH ~L147)
- Modify: `src/app/api/projects/[id]/gigs/route.ts` (POST ~L62)
- Check + maybe modify: `src/app/api/gigs/[id]/route.ts` (publish transition — see Step 3)
- Modify: `src/app/api/test/users/route.ts` (seed trialing subscription)

**Interfaces:**
- Consumes: `withActiveSubscription` from `@/lib/subscription` (unchanged signature).

- [ ] **Step 1: Exemplar conversion — `POST /api/projects`.** Current shape:
```ts
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ...validation + create...
}
```
becomes:
```ts
export const POST = withActiveSubscription(
  "write",
  async (request, { user }) => {
    // ...validation + create, byte-identical, `user` now from ctx...
  },
);
```
Add the import; remove the now-dead `getCurrentUser` import IF nothing else in the file uses it (check — the file may have a GET handler using it; keep it then). The wrapper 401s exactly like the removed block.

- [ ] **Step 2: Dynamic routes — same conversion with the route context as the third arg.** Pattern for `upload-url` (and identically for confirm / versions POST / versions PATCH / project-gigs POST):
```ts
export const POST = withActiveSubscription(
  "write",
  async (request, { user }, routeContext) => {
    const { params } = routeContext as { params: Promise<{ id: string }> };
    const { id: projectId } = await params;
    // ...rest byte-identical: authorizeProjectPermission stays, 404s stay...
  },
);
```
(The wrapper forwards `...args: unknown[]`; the cast is the documented pattern — verify against `SubscriptionHandler`'s actual type in subscription.ts and adapt if it already types the args better. For `versions/[versionId]` the params type is `{ id: string; versionId: string }`.) The removed piece in each handler is ONLY `const user = await getCurrentUser(request)` + its 401 block; everything else stays.

- [ ] **Step 3: Gig publish transition check.** Read `src/app/api/gigs/[id]/route.ts`. If a PATCH/PUT handler transitions gig status to `published` (or similar publish semantics), apply the same conversion to that handler. If the route only edits/closes gigs or publish happens exclusively at creation (`POST /api/projects/[id]/gigs`), leave it untouched and record the finding. Either way the report states what the route does and what you did.

- [ ] **Step 4: E2E test users get a subscription.** In `src/app/api/test/users/route.ts` (E2E_TEST_MODE-gated), after the user create, add:
```ts
  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: "trial",
      status: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
```
(Adapt to the route's actual structure — if it uses a nested create on user, fold it in as `subscription: { create: { ... } }`. Read the file first.)

- [ ] **Step 5: Gates + grep audit + commit**
```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck >/tmp/t.log 2>&1; echo "tc $?"; npm run lint >/tmp/l.log 2>&1; echo "lint $?"; npm run test:unit 2>&1 | tail -4; npm run build >/tmp/b.log 2>&1; echo "build $?"'
grep -rln "withActiveSubscription" src/app/api/ | sort
git add -A src/app/api
git commit -m "feat(billing): gate creative write routes with withActiveSubscription (Closes #137)"
```
Expected: gates `0`; grep lists exactly the gated route files (6, or 7 with gigs/[id]).

---

## Task 4: Integration verification + PR

**Files:** none (verification + PR only).

- [ ] **Step 1: Local integration matrix.** Environment per the established recipe (`scripts/rbac-integration-check.sh` style): ephemeral postgres:16 container `mcb-gate-pg` on 5433 (remove stale first), `.env.local` guard (ABORT if exists), explicit-DATABASE_URL migrate deploy, `E2E_TEST_MODE=1 npx next dev -p 3100`, Node 22, full teardown even on failure. Then, with users created via `/api/test/users` (they now get trialing subs) and psql to mutate subscription rows, assert on `POST /api/projects` (body `{"title":"gate probe"}`, session cookie via `/api/auth/login`):
  1. Fresh test user (trialing sub) → **201/200** (created).
  2. psql: delete the user's subscription row → **403** with `"No active subscription"` in the body.
  3. psql: recreate sub `status='past_due', "currentPeriodEnd"=now()+interval '3 days'` → **200/201** (grace write).
  4. psql: `status='past_due', "currentPeriodEnd"=now()-interval '1 day'` → **403** with `SUBSCRIPTION_PAST_DUE`.
  5. psql: `status='expired'` → **403** with `SUBSCRIPTION_INACTIVE`.
  6. **Lazy-expiry chain (production-critical):** psql: `status='trialing', "trialEndsAt"=now()-interval '1 day'` → call → **403** AND psql shows the row flipped to `status='expired'` (proves `expireTrialIfDue` fires through the gate).
  7. Admin bypass: psql `UPDATE "User" SET role='admin'`, delete their subscription → **200/201**.
  8. Spot-check one dynamic gated route (upload-url) with the trialing user: expect the route to reach its RBAC/validation logic (not a subscription 403) — any non-subscription response (e.g. 403 Forbidden from RBAC on a foreign project, or 200) proves the wrapper passes through.
Record every command + output. An assertion failure = bug in Tasks 1-3 → BLOCKED with evidence.

- [ ] **Step 2: Regression:** `./scripts/rbac-integration-check.sh` → 5/5 (its assertions are status-code-only; the viewer upload-url 403 now comes from the subscription gate — seeded psql users have no subs — which still satisfies the assertion; note this in the report).

- [ ] **Step 3: Full gates, push, PR** (controller runs the final whole-branch review first):
```bash
PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH" sh -c 'npm run typecheck >/tmp/t.log 2>&1; echo "tc $?"; npm run lint >/tmp/l.log 2>&1; echo "lint $?"; npm run test:unit 2>&1 | tail -4; npm run build >/tmp/b.log 2>&1; echo "build $?"'
git push -u origin feat/subscription-gating
```

---

## Self-Review

- **Issue coverage:** #137(1) middleware wired → Task 3 (all six DEC-08 write surfaces + bounded gig-publish check); #137(2) trialEndsAt → Task 2 (webhook authoritative both handlers + checkout provisional); the audit's "batch expiry never fires" concern → proven end-to-end by Task 4's assertion 6.
- **Placeholder scan:** Task 3 gives one complete exemplar per route shape (static + dynamic) with the exact removed/kept pieces named; Task 4's assertions carry concrete expected codes/bodies. No TBDs.
- **Type consistency:** `decideSubscriptionAccess` input/output (Task 1) is what Task 1's rewire consumes; `withActiveSubscription("write", handler)` signature unchanged so Task 3's conversions compile against it; `TRIAL_PERIOD_DAYS` (Task 2) already exists in the checkout file's scope per the scout read.
