# Phase 2 (p0) Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three p0 audit findings — Prisma 7 migrate regression (#135), unauthenticated billing/checkout (#134), and the dead/divergent RBAC mechanism (#136) — without unrelated refactors and with green build/lint.

**Architecture:** Three independent code fixes. #135 removes the Prisma-6-only `datasource.url` from the schema (URL already lives in `prisma.config.ts`). #134 derives the user from the verified session instead of the request body. #136 makes the `PERMISSIONS` matrix the single source of truth via a pure `can()` helper, adds an admin override to `authorizeProjectMember`, and deletes the dead `withProjectAuth` wrapper. Verification uses an ephemeral Docker Postgres + `node:test`.

**Tech Stack:** Next.js 16, TypeScript 6, Prisma 7, Postgres (Docker for tests), `tsx` + `node:test` for unit tests, Stripe, `gh` CLI.

## Global Constraints

- `npm run build` AND `npm run lint` MUST stay green after every task.
- `npm run typecheck` (`tsc --noEmit`) MUST pass after every task.
- No unrelated refactors; preserve existing route structure and patterns.
- Runtime Prisma client behavior MUST NOT break — verify with a real query.
- Do NOT rewire the ~30 project routes onto the new RBAC helper — that is #141/#142, a later pass (spec §8).

---

## Shared test infrastructure (ephemeral Postgres)

Tasks 1 and 2 verify against a throwaway Postgres container. Start it once; the final task removes it.

```bash
# start (idempotent)
docker rm -f mcb-p2-pg >/dev/null 2>&1
docker run -d --name mcb-p2-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_USER=pg -e POSTGRES_DB=mcb -p 5433:5432 postgres:16
for i in $(seq 1 20); do docker exec mcb-p2-pg pg_isready -U pg -d mcb >/dev/null 2>&1 && break; sleep 1; done

# minimal env for CLI + dev server (.env.local is gitignored)
cat > .env.local <<'EOF'
DATABASE_URL="postgresql://pg:pg@localhost:5433/mcb"
NEXTAUTH_SECRET="p2-secret-00000000000000000000000000000000"
APP_URL="http://127.0.0.1:3100"
NEXT_PUBLIC_APP_URL="http://127.0.0.1:3100"
AWS_ACCESS_KEY_ID="dummy"
AWS_SECRET_ACCESS_KEY="dummy"
AWS_S3_BUCKET="dummy-bucket"
AWS_REGION="eu-central-1"
STRIPE_SECRET_KEY="sk_test_dummy"
STRIPE_PRO_PRICE_ID="price_dummy"
STRIPE_TEAM_PRICE_ID="price_dummy"
EOF
```

---

## Task 1: #135 — Prisma 7 migrate fix

**Files:**
- Modify: `prisma/schema.prisma:6-9` (datasource block)
- Possibly modify: `src/lib/prisma.ts:8-14`

**Interfaces:**
- Produces: a schema that `prisma migrate`/`db push` accepts under Prisma 7; runtime client unchanged in behavior.

- [ ] **Step 1: Reproduce the failure**

Start the shared Postgres (above), then run:
```bash
DATABASE_URL="postgresql://pg:pg@localhost:5433/mcb" npx prisma migrate deploy 2>&1 | grep -E "P1012|url is no longer"
```
Expected: prints the `P1012 … url is no longer supported` error (confirms the bug).

- [ ] **Step 2: Remove `url` from the schema datasource**

Edit `prisma/schema.prisma` — the datasource block becomes:
```prisma
datasource db {
  provider = "postgresql"
}
```
(Delete only the line `  url      = env("DATABASE_URL")`. The URL is already provided by `prisma.config.ts`.)

- [ ] **Step 3: Regenerate client + typecheck (decide if prisma.ts needs a change)**

Run:
```bash
npx prisma generate 2>&1 | tail -3
npm run typecheck 2>&1 | tail -15
```
Expected: generate succeeds. If typecheck reports an error on the `datasources` option in `src/lib/prisma.ts`, apply Step 3a. If typecheck is clean, SKIP Step 3a.

- [ ] **Step 3a (only if Step 3 errored): switch prisma.ts to `datasourceUrl`**

Replace the body of `createPrismaClient()` in `src/lib/prisma.ts`:
```ts
function createPrismaClient() {
  return new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });
}
```

- [ ] **Step 4: Verify migrate now works**

Run:
```bash
DATABASE_URL="postgresql://pg:pg@localhost:5433/mcb" npx prisma migrate deploy 2>&1 | tail -5
docker exec mcb-p2-pg psql -U pg -d mcb -tc "select count(*) from information_schema.tables where table_schema='public';"
```
Expected: migrate reports applied/up-to-date (no `P1012`); table count > 25.

- [ ] **Step 5: Verify runtime client still works**

Run a real query through the app's client:
```bash
DATABASE_URL="postgresql://pg:pg@localhost:5433/mcb" npx tsx -e "import {prisma} from './src/lib/prisma.ts'; const n = await prisma.user.count(); console.log('user count', n); process.exit(0);" 2>&1 | tail -5
```
Expected: prints `user count 0` (connects + queries successfully).

- [ ] **Step 6: Build + lint**

Run:
```bash
npm run build >/tmp/b.log 2>&1; echo "build $?"
npm run lint  >/tmp/l.log 2>&1; echo "lint $?"
```
Expected: both `0`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/prisma.ts
git commit -m "fix(prisma): drop datasource.url from schema for Prisma 7 migrate (Closes #135)"
```

---

## Task 2: #134 — billing/checkout authentication

**Files:**
- Modify: `src/app/api/billing/checkout/route.ts:1-20`

**Interfaces:**
- Consumes: `getCurrentUser` from `@/lib/auth`, `unauthorized` from `@/lib/auth`.
- Produces: `POST /api/billing/checkout` requires a valid session; `userId` comes from the session, not the body.

- [ ] **Step 1: Apply the auth fix**

In `src/app/api/billing/checkout/route.ts`, change the imports (line 1-3) and the handler head (lines 5-20).

New imports block:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe, getPlans, TRIAL_PERIOD_DAYS, type PlanKey } from "@/lib/stripe";
import { getCurrentUser, unauthorized } from "@/lib/auth";
```

Replace lines 5-20 (the body parse + `userId` extraction/validation) with:
```ts
export async function POST(request: NextRequest) {
  const authedUser = await getCurrentUser(request);
  if (!authedUser) {
    return unauthorized();
  }

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { plan } = body;
  const userId = authedUser.id;
```
(The rest of the handler — `getPlans()`, plan validation, the `prisma.user.findUnique({ where: { id: userId } })` lookup, Stripe customer/session, subscription upsert — stays unchanged and now uses the session-derived `userId`.)

- [ ] **Step 2: Typecheck + lint + build**

```bash
npm run typecheck 2>&1 | tail -5; echo "tc $?"
npm run lint 2>&1 | tail -3; echo "lint $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
```
Expected: all pass / `0`.

- [ ] **Step 3: Integration check — 401 without session**

With the shared Postgres running and migrated, start the dev server and probe:
```bash
(DATABASE_URL="postgresql://pg:pg@localhost:5433/mcb" E2E_TEST_MODE=1 npx next dev -p 3100 >/tmp/dev.log 2>&1 &) ; sleep 8
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3100/api/billing/checkout \
  -H 'content-type: application/json' -d '{"userId":"someone-else","plan":"pro"}'
pkill -f "next dev -p 3100" 2>/dev/null || true
```
Expected: `401` (previously this would have proceeded to look up `someone-else`). Confirms the body `userId` is ignored and auth is required.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/billing/checkout/route.ts
git commit -m "fix(billing): require session on checkout, derive userId from session (Closes #134)"
```

---

## Task 3: #136 — RBAC consolidation (matrix as source of truth)

**Files:**
- Modify: `src/lib/rbac.ts` (add `can()`, delete `withProjectAuth` + dead types + now-unused imports)
- Modify: `src/lib/auth.ts:91-117` (`authorizeProjectMember` admin override + new `authorizeProjectPermission`)
- Create: `src/lib/rbac.test.ts`
- Modify: `package.json` (add `test:unit` script)

**Interfaces:**
- Produces:
  - `can(role: MemberRole, permission: Permission): boolean` — pure matrix lookup.
  - `PERMISSIONS` and `type Permission` remain exported (unchanged).
  - `authorizeProjectMember(userId: string, projectId: string, allowedRoles: MemberRole[]): Promise<boolean>` — now returns `true` for global admins.
  - `authorizeProjectPermission(userId: string, projectId: string, permission: Permission): Promise<boolean>` — matrix-driven companion.
- Consumes: `can`, `Permission` from `@/lib/rbac` (used by `auth.ts`).

- [ ] **Step 1: Write the failing unit test**

Create `src/lib/rbac.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { can } from "./rbac.ts";

test("owner can manage splits", () => {
  assert.equal(can("owner", "manage_split"), true);
});
test("viewer can download files", () => {
  assert.equal(can("viewer", "download_files"), true);
});
test("viewer cannot upload files", () => {
  assert.equal(can("viewer", "upload_files"), false);
});
test("commenter cannot moderate comments", () => {
  assert.equal(can("commenter", "moderate_comments"), false);
});
```

- [ ] **Step 2: Add the `test:unit` script and run it (must fail — `can` not exported yet)**

In `package.json` `scripts`, add:
```json
    "test:unit": "node --import tsx --test \"src/**/*.test.ts\"",
```
Run:
```bash
npm run test:unit 2>&1 | tail -15
```
Expected: FAIL — `can` is not exported by `./rbac.ts` (import error / undefined).

- [ ] **Step 3: Rewrite `src/lib/rbac.ts` to the consolidated form**

Replace the ENTIRE contents of `src/lib/rbac.ts` with:
```ts
import type { MemberRole } from "@/generated/prisma";

/**
 * Permission matrix from PRD Role_Lifecycle_Tables.
 * Single source of truth: maps each capability to the project-level roles
 * that have it. Global admins (UserRole.admin) bypass these checks in the
 * authorization helpers (see src/lib/auth.ts) — not listed here.
 */
export const PERMISSIONS = {
  view_project: ["owner", "editor", "commenter", "viewer"],
  download_files: ["owner", "editor", "commenter", "viewer"],
  upload_files: ["owner", "editor"],
  publish_version: ["owner", "editor"],
  edit_project_metadata: ["owner", "editor"],
  add_comment: ["owner", "editor", "commenter"],
  delete_own_comment: ["owner", "editor", "commenter"],
  moderate_comments: ["owner"],
  invite_collaborator: ["owner"],
  change_member_role: ["owner"],
  remove_collaborator: ["owner"],
  view_split: ["owner"],
  manage_split: ["owner"],
  delete_published: ["owner"],
} satisfies Record<string, readonly MemberRole[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Pure matrix lookup: does `role` hold `permission`? */
export function can(role: MemberRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);
}
```
(This deletes `withProjectAuth`, `AuthContext`, `AuthenticatedHandler`, `RouteContext`, and the now-unused `NextRequest`/`NextResponse`/`getCurrentUser`/`prisma`/`User`/`ProjectMember` imports. Confirmed safe: `grep` showed those symbols are referenced only inside `rbac.ts` itself.)

- [ ] **Step 4: Run the unit test (must pass)**

```bash
npm run test:unit 2>&1 | tail -15
```
Expected: PASS — 4/4 tests.

- [ ] **Step 5: Add admin override + permission companion in `src/lib/auth.ts`**

Add an import near the top of `src/lib/auth.ts` (after the existing imports):
```ts
import { can, type Permission } from "@/lib/rbac";
```

Replace the existing `authorizeProjectMember` function (currently lines ~91-117) with these TWO functions:
```ts
/**
 * Checks whether the user may act on a project under one of `allowedRoles`.
 * Global admins and project owners are always authorized.
 */
export async function authorizeProjectMember(
  userId: string,
  projectId: string,
  allowedRoles: MemberRole[],
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "admin") return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) return false;
  if (project.ownerId === userId) return true;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  if (!member) return false;

  return allowedRoles.includes(member.role);
}

/**
 * Matrix-driven authorization: checks a single `Permission` against the
 * PERMISSIONS source of truth. Global admins and project owners are always
 * authorized.
 */
export async function authorizeProjectPermission(
  userId: string,
  projectId: string,
  permission: Permission,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "admin") return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) return false;
  if (project.ownerId === userId) return true;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  if (!member) return false;

  return can(member.role, permission);
}
```
(`authorizeProjectMember` keeps its existing signature, so the ~30 current call-sites keep working — they now also honor admin override. `authorizeProjectPermission` is new and unused for now; routes adopt it in the #141/#142 pass.)

- [ ] **Step 6: Typecheck + lint + build + unit test (all green)**

```bash
npm run typecheck 2>&1 | tail -5; echo "tc $?"
npm run lint 2>&1 | tail -3; echo "lint $?"
npm run test:unit 2>&1 | tail -5; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
grep -rn "withProjectAuth" src/ || echo "withProjectAuth gone"
```
Expected: typecheck/lint/build `0`, unit 4/4 pass, `withProjectAuth gone`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rbac.ts src/lib/auth.ts src/lib/rbac.test.ts package.json
git commit -m "refactor(rbac): matrix-driven can() + admin override, drop dead withProjectAuth (Closes #136)"
```

---

## Task 4: Cleanup + final verification + push

**Files:** none changed; verification + cleanup + push only.

- [ ] **Step 1: Tear down ephemeral infra**

```bash
docker rm -f mcb-p2-pg >/dev/null 2>&1 && echo "pg removed"
rm -f .env.local
rm -rf test-results playwright-report
git status -s | grep -v "^??" || echo "working tree clean of tracked changes"
```

- [ ] **Step 2: Final green check on a clean tree**

```bash
npm run typecheck 2>&1 | tail -3; echo "tc $?"
npm run lint 2>&1 | tail -3; echo "lint $?"
npm run test:unit 2>&1 | tail -3; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
```
Expected: typecheck/lint/build `0`, unit pass. (Build needs no DB for compile/type-check; the earlier page-data step requires env, so a non-zero build here due ONLY to missing DATABASE_URL at page-data collection is acceptable — confirm the failure, if any, is the Prisma "Invalid value undefined for datasource" at collection, not a type error.)

- [ ] **Step 3: Push**

```bash
git pull --rebase
git push
git status   # expect: up to date with origin
```

- [ ] **Step 4: Confirm issues closed**

```bash
for n in 134 135 136; do echo "#$n: $(gh issue view $n --json state -q .state)"; done
```
Expected: all `CLOSED` (auto-closed by the `Closes #` commit messages on push to master).

---

## Self-Review

- **Spec coverage:** spec §3 (#135) → Task 1; §4 (#134) → Task 2; §5 (#136) → Task 3; §6 testing → `node:test` unit (Task 3) + Docker-PG integration (Tasks 1-2); §7 acceptance → Tasks 1-4 steps; §8 out-of-scope (no route rewiring, no new framework) → respected (only `tsx`/`node:test`, already deps). All covered.
- **Placeholder scan:** Step 3a is conditional (clearly gated on Step 3's result), not a placeholder; all code blocks are concrete. No TBD/TODO.
- **Type consistency:** `can(role: MemberRole, permission: Permission)` defined in Task 3 Step 3 and consumed in Task 3 Step 5 (`authorizeProjectPermission`) and Task 3 Step 1 test — names match. `authorizeProjectMember` keeps its existing `(userId, projectId, allowedRoles)` signature. `Permission` exported from rbac.ts, imported in auth.ts. Consistent.
