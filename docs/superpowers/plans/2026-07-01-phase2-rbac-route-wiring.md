# Phase 2 RBAC Route-Wiring (#141 #142) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every inline `isOwner || isEditor` / ad-hoc ownerId authorization check in the project-scoped API routes with the matrix-driven `authorizeProjectPermission` helper, fixing viewer/commenter file-access (#141) and missing admin override (#142) everywhere at once.

**Architecture:** Two small additions to the `PERMISSIONS` matrix (`src/lib/rbac.ts`), then a mechanical per-route swap: every inline authorization block is replaced by one `authorizeProjectPermission(userId, projectId, "<permission>")` call. No business logic changes. Verified by unit test (matrix), static checks (typecheck/lint/build), and integration checks against an ephemeral Docker Postgres (same technique as the p0 pass).

**Tech Stack:** Next.js 16, TypeScript 6, Prisma 7, `node:test` + `tsx`, Postgres (Docker for tests), `gh` CLI.

## Global Constraints

- `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test:unit` MUST stay green after every task.
- No unrelated refactors — only the authorization check changes; validation, business logic, response shapes stay untouched.
- Role-sets come only from `Role_Lifecycle_Tables_MUSICCOLLABHUB.md §1` (capability table) + lifecycle rules; no new capability semantics beyond what's specified.
- Gig/application/hire/admin/connect routes are OUT OF SCOPE — do not touch anything under `src/app/api/gigs`, `src/app/api/applications`, `src/app/api/hires`, `src/app/api/admin`, `src/app/api/connect`, or `src/app/api/projects/[id]/gigs/**`.
- Two approved behavior changes ship in this plan (not regressions — confirmed with the project owner):
  1. `splits` GET (list + detail) tightens from "any project member" to `view_split` (owner + admin only) — matches audit finding RBAC-12.
  2. `versions` GET (list + detail) gains a membership gate (`view_project`) where today ANY authenticated user (even non-members) can read published versions of any project — closes a previously-undocumented gap.

---

## Shared verification commands (used after every task)

```bash
npm run typecheck 2>&1 | tail -10; echo "tc $?"
npm run lint 2>&1 | tail -5; echo "lint $?"
npm run test:unit 2>&1 | tail -10; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
```
All four must report `0` (build may only fail at Prisma page-data collection due to a missing `DATABASE_URL` — a genuine type/compile error is NOT acceptable).

---

## Task 1: Extend the PERMISSIONS matrix

**Files:**
- Modify: `src/lib/rbac.ts`
- Modify: `src/lib/rbac.test.ts`

**Interfaces:**
- Produces: two new `Permission` keys — `create_version` and `manage_project_lifecycle` — usable by `can()` and `authorizeProjectPermission()` in every later task.

- [ ] **Step 1: Write the failing test cases**

Append to `src/lib/rbac.test.ts` (after the existing four tests):
```ts
test("editor can create version", () => {
  assert.equal(can("editor", "create_version"), true);
});
test("commenter cannot create version", () => {
  assert.equal(can("commenter", "create_version"), false);
});
test("owner can manage project lifecycle", () => {
  assert.equal(can("owner", "manage_project_lifecycle"), true);
});
test("editor cannot manage project lifecycle", () => {
  assert.equal(can("editor", "manage_project_lifecycle"), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit 2>&1 | tail -20
```
Expected: FAIL — `create_version` / `manage_project_lifecycle` are not valid keys of `PERMISSIONS`, so `can()` looks up `undefined` and throws (`Cannot read properties of undefined (reading 'includes')`).

- [ ] **Step 3: Add the two matrix keys**

In `src/lib/rbac.ts`, add two lines to `PERMISSIONS` (after `edit_project_metadata`, before `add_comment` — ordering doesn't matter functionally, this keeps related "editor-level" capabilities together):
```ts
export const PERMISSIONS = {
  view_project: ["owner", "editor", "commenter", "viewer"],
  download_files: ["owner", "editor", "commenter", "viewer"],
  upload_files: ["owner", "editor"],
  publish_version: ["owner", "editor"],
  create_version: ["owner", "editor"],
  edit_project_metadata: ["owner", "editor"],
  manage_project_lifecycle: ["owner"],
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:unit 2>&1 | tail -15
```
Expected: PASS — 8/8 tests.

- [ ] **Step 5: Verify + commit**

```bash
npm run typecheck 2>&1 | tail -5; echo "tc $?"
npm run lint 2>&1 | tail -3; echo "lint $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
git add src/lib/rbac.ts src/lib/rbac.test.ts
git commit -m "feat(rbac): add create_version and manage_project_lifecycle permissions"
```

---

## Task 2: Wire `projects/[id]` core routes

**Files:**
- Modify: `src/app/api/projects/[id]/route.ts`
- Modify: `src/app/api/projects/[id]/archive/route.ts`
- Modify: `src/app/api/projects/[id]/restore/route.ts`

**Interfaces:**
- Consumes: `authorizeProjectPermission(userId, projectId, permission)` from `@/lib/auth` (produced in p0, unchanged signature); `"view_project"`, `"edit_project_metadata"`, `"manage_project_lifecycle"` permission keys (the last one new from Task 1).

- [ ] **Step 1: `src/app/api/projects/[id]/route.ts` — refactor `loadAuthorizedProject` to take a permission**

Change the import line (line 1-4):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, getCurrentUser, authorizeProjectPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import type { Permission } from "@/lib/rbac";
```

Replace the `loadAuthorizedProject` function (currently lines 28-66):
```ts
async function loadAuthorizedProject(
  projectId: string,
  userId: string,
  permission: Permission,
): Promise<
  | { ok: true; project: { ownerId: string } }
  | { ok: false; status: number; error: string }
> {
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active", deletedAt: null },
    select: { ownerId: true },
  });

  if (!project) {
    return { ok: false, status: 404, error: "Project not found" };
  }

  const authed = await authorizeProjectPermission(userId, projectId, permission);
  if (!authed) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, project };
}
```

Update the two call sites. In `GET` (currently `const auth = await loadAuthorizedProject(projectId, user.id, false);`):
```ts
  const auth = await loadAuthorizedProject(projectId, user.id, "view_project");
```

In `PUT` (currently `const auth = await loadAuthorizedProject(projectId, user.id, true);`):
```ts
  const auth = await loadAuthorizedProject(projectId, user.id, "edit_project_metadata");
```

In `DELETE`, replace the ownerId check:
```ts
  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can delete this project" },
      { status: 403 },
    );
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(
    user.id,
    projectId,
    "manage_project_lifecycle",
  );
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can delete this project" },
      { status: 403 },
    );
  }
```

- [ ] **Step 2: `src/app/api/projects/[id]/archive/route.ts`**

Change the import (line 1-4):
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
```

Replace the ownerId check:
```ts
  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can archive this project" },
      { status: 403 },
    );
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(
    user.id,
    projectId,
    "manage_project_lifecycle",
  );
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can archive this project" },
      { status: 403 },
    );
  }
```

- [ ] **Step 3: `src/app/api/projects/[id]/restore/route.ts`**

Change the import (line 1-4):
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
```

Replace the ownerId check:
```ts
  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can restore this project" },
      { status: 403 },
    );
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(
    user.id,
    projectId,
    "manage_project_lifecycle",
  );
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can restore this project" },
      { status: 403 },
    );
  }
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck 2>&1 | tail -10; echo "tc $?"
npm run lint 2>&1 | tail -5; echo "lint $?"
npm run test:unit 2>&1 | tail -5; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
grep -n "ownerId !== user.id" src/app/api/projects/\[id\]/route.ts src/app/api/projects/\[id\]/archive/route.ts src/app/api/projects/\[id\]/restore/route.ts || echo "no raw ownerId compares left"
```
Expected: all four commands `0`; grep finds nothing left in these three files.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/\[id\]/route.ts src/app/api/projects/\[id\]/archive/route.ts src/app/api/projects/\[id\]/restore/route.ts
git commit -m "refactor(rbac): wire projects/[id] core routes to authorizeProjectPermission"
```

---

## Task 3: Wire `projects/[id]/files` routes (fixes #141)

**Files:**
- Modify: `src/app/api/projects/[id]/files/route.ts`
- Modify: `src/app/api/projects/[id]/files/[fileId]/route.ts`
- Modify: `src/app/api/projects/[id]/files/upload-url/route.ts`
- Modify: `src/app/api/projects/[id]/files/confirm/route.ts`

**Interfaces:**
- Consumes: `authorizeProjectPermission` from `@/lib/auth`; permissions `"download_files"`, `"upload_files"`, `"delete_published"`.

- [ ] **Step 1: `src/app/api/projects/[id]/files/route.ts` (GET)**

Change the import (line 1-3):
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
```

Replace the isOwner/isEditor block:
```ts
  const isOwner = project.ownerId === user.id;
  let isEditor = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }

  if (!isOwner && !isEditor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "download_files");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

- [ ] **Step 2: `src/app/api/projects/[id]/files/[fileId]/route.ts` (GET + DELETE)**

Change the import (line 1-5):
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { generatePresignedDownloadUrl } from "@/lib/s3";
```

In `GET`, replace the isOwner/isEditor block (identical shape to Step 1) with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "download_files");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

In `DELETE`, replace the ownerId check:
```ts
  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can delete files" },
      { status: 403 },
    );
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "delete_published");
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can delete files" },
      { status: 403 },
    );
  }
```

- [ ] **Step 3: `src/app/api/projects/[id]/files/upload-url/route.ts` (POST)**

Change the import (line 1-9), adding `authorizeProjectPermission`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import {
  buildS3Key,
  generatePresignedUploadUrl,
  MAX_FILE_SIZE,
  S3_BUCKET,
} from "@/lib/s3";
```

Replace the isOwner/isEditor block with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "upload_files");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

- [ ] **Step 4: `src/app/api/projects/[id]/files/confirm/route.ts` (POST)**

Change the import (line 1-5):
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import { checkFileExists } from "@/lib/s3";
import { logActivity } from "@/lib/activity-log";
```

Replace the isOwner/isEditor block with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "upload_files");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

- [ ] **Step 5: Verify**

```bash
npm run typecheck 2>&1 | tail -10; echo "tc $?"
npm run lint 2>&1 | tail -5; echo "lint $?"
npm run test:unit 2>&1 | tail -5; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
grep -rn "isOwner\|isEditor" src/app/api/projects/\[id\]/files/ || echo "no inline isOwner/isEditor left in files/"
```
Expected: all four green; grep finds nothing.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/projects/\[id\]/files/
git commit -m "fix(rbac): wire files routes to authorizeProjectPermission (Closes #141)"
```

---

## Task 4: Wire `projects/[id]/versions` routes (adds membership gate per approved decision)

**Files:**
- Modify: `src/app/api/projects/[id]/versions/route.ts`
- Modify: `src/app/api/projects/[id]/versions/[versionId]/route.ts`
- Modify: `src/app/api/projects/[id]/versions/[versionId]/files/route.ts`

**Interfaces:**
- Consumes: `authorizeProjectPermission` from `@/lib/auth`; permissions `"view_project"`, `"publish_version"`, `"create_version"`, `"delete_published"`.

- [ ] **Step 1: `src/app/api/projects/[id]/versions/route.ts` (GET — new gate; POST)**

Change the import (line 1-4):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import type { VersionStatus } from "@/generated/prisma";
```

In `GET`, insert a new membership gate right after the `if (!project) { ... }` check and BEFORE the existing role computation (which stays, unchanged, since it's still needed to decide the status filter):
```ts
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "view_project");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Determine role ---
  const isOwner = project.ownerId === user.id;
  let isEditor = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }
```
(This is the ONLY route in this task where the isOwner/isEditor block is kept — it's still needed for the `?status=all` filter decision, not for gating. Do not remove it here.)

In `POST`, replace the isOwner/isEditor gating block:
```ts
  // --- Authz: owner or editor ---
  const isOwner = project.ownerId === user.id;
  let isEditor = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }

  if (!isOwner && !isEditor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "create_version");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

- [ ] **Step 2: `src/app/api/projects/[id]/versions/[versionId]/route.ts` (GET — new gate; PATCH; DELETE)**

Change the import (line 1-9):
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import {
  createNotifications,
  getProjectAudience,
} from "@/lib/notifications";
import { generatePresignedDownloadUrl } from "@/lib/s3";
```

In `GET`, insert the new gate right after the `if (!project) { ... }` check, keeping the existing isOwner/isEditor computation below it (still needed to decide draft visibility):
```ts
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "view_project");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isOwner = project.ownerId === user.id;
  let isEditor = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }
```

In `PATCH`, replace the isOwner/isEditor gating block:
```ts
  // --- Authz: owner or editor ---
  const isOwner = project.ownerId === user.id;
  let isEditor = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }

  if (!isOwner && !isEditor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "publish_version");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

In `DELETE`, replace the ownerId check:
```ts
  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can delete versions" },
      { status: 403 },
    );
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "delete_published");
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can delete versions" },
      { status: 403 },
    );
  }
```

- [ ] **Step 3: `src/app/api/projects/[id]/versions/[versionId]/files/route.ts` (POST)**

Change the import (line 1-3):
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
```

Replace the isOwner/isEditor gating block:
```ts
  // --- Authz: owner or editor ---
  const isOwner = project.ownerId === user.id;
  let isEditor = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }

  if (!isOwner && !isEditor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "create_version");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck 2>&1 | tail -10; echo "tc $?"
npm run lint 2>&1 | tail -5; echo "lint $?"
npm run test:unit 2>&1 | tail -5; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
grep -n "authorizeProjectPermission" src/app/api/projects/\[id\]/versions/route.ts src/app/api/projects/\[id\]/versions/\[versionId\]/route.ts src/app/api/projects/\[id\]/versions/\[versionId\]/files/route.ts
```
Expected: typecheck/lint/unit/build all `0`; grep shows the new calls present in all three files (2 occurrences expected in `route.ts` and in `[versionId]/route.ts`, 1 in `files/route.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/\[id\]/versions/
git commit -m "refactor(rbac): wire versions routes to authorizeProjectPermission, add view_project gate to GET"
```

---

## Task 5: Wire `comments` + `activity` routes

**Files:**
- Modify: `src/app/api/projects/[id]/comments/route.ts`
- Modify: `src/app/api/projects/[id]/comments/[threadId]/replies/route.ts`
- Modify: `src/app/api/projects/[id]/comments/[threadId]/resolve/route.ts`
- Modify: `src/app/api/projects/[id]/comments/[threadId]/comments/[commentId]/route.ts`
- Modify: `src/app/api/projects/[id]/activity/route.ts`

**Interfaces:**
- Consumes: `authorizeProjectPermission` from `@/lib/auth`; permissions `"add_comment"`, `"moderate_comments"`, `"delete_own_comment"`, `"view_project"`.
- These 5 routes already gate via `authorizeProjectMember` with role lists that match the matrix exactly (behavior-preserving swap, not a tightening or loosening).

- [ ] **Step 1: `src/app/api/projects/[id]/comments/route.ts`**

Replace the import block (lines 1-17):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectPermission,
  unauthorized,
  forbidden,
} from "@/lib/auth";
import {
  createNotifications,
  getProjectAudience,
} from "@/lib/notifications";
import type { TargetType } from "@/generated/prisma";

const VALID_TARGET_TYPES: TargetType[] = ["project", "file", "version"];
```
(This drops the `COMMENT_ALLOWED_ROLES` constant entirely.)

Replace the authorization call:
```ts
  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    [...COMMENT_ALLOWED_ROLES],
  );
  if (!allowed) return forbidden();
```
with:
```ts
  const allowed = await authorizeProjectPermission(userId, projectId, "add_comment");
  if (!allowed) return forbidden();
```

- [ ] **Step 2: `src/app/api/projects/[id]/comments/[threadId]/replies/route.ts`**

Replace the import block (lines 1-11):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectPermission,
  unauthorized,
  forbidden,
} from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
```
(Drops `COMMENT_ALLOWED_ROLES`.)

Replace the authorization call:
```ts
  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    [...COMMENT_ALLOWED_ROLES],
  );
  if (!allowed) return forbidden();
```
with:
```ts
  const allowed = await authorizeProjectPermission(userId, projectId, "add_comment");
  if (!allowed) return forbidden();
```

- [ ] **Step 3: `src/app/api/projects/[id]/comments/[threadId]/resolve/route.ts`**

Replace the import block (lines 1-10):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectPermission,
  unauthorized,
  forbidden,
} from "@/lib/auth";
```
(Drops `MODERATOR_ROLES`.)

Replace the authorization call:
```ts
  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    [...MODERATOR_ROLES],
  );
  if (!allowed) return forbidden();
```
with:
```ts
  const allowed = await authorizeProjectPermission(userId, projectId, "moderate_comments");
  if (!allowed) return forbidden();
```

- [ ] **Step 4: `src/app/api/projects/[id]/comments/[threadId]/comments/[commentId]/route.ts`**

Replace the import block (lines 1-11):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectPermission,
  unauthorized,
  forbidden,
} from "@/lib/auth";
```
(Drops `COMMENT_AUTHOR_ROLES` and `MODERATOR_ROLES`; keeps `RECENT_DELETE_WINDOW_MS`.)

Replace the first authorization call:
```ts
  const isAuthorRoleOk = await authorizeProjectMember(
    userId,
    projectId,
    [...COMMENT_AUTHOR_ROLES],
  );
  if (!isAuthorRoleOk) return forbidden();
```
with:
```ts
  const isAuthorRoleOk = await authorizeProjectPermission(
    userId,
    projectId,
    "delete_own_comment",
  );
  if (!isAuthorRoleOk) return forbidden();
```

Replace the second authorization call:
```ts
  const isModerator = await authorizeProjectMember(
    userId,
    projectId,
    [...MODERATOR_ROLES],
  );
```
with:
```ts
  const isModerator = await authorizeProjectPermission(
    userId,
    projectId,
    "moderate_comments",
  );
```

- [ ] **Step 5: `src/app/api/projects/[id]/activity/route.ts`**

Replace the import block (lines 1-9):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectPermission,
  unauthorized,
  forbidden,
} from "@/lib/auth";
import type { ActivityAction } from "@/generated/prisma";
```
(Drops `VIEW_ROLES`.)

Replace the authorization call:
```ts
  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    [...VIEW_ROLES],
  );
  if (!allowed) return forbidden();
```
with:
```ts
  const allowed = await authorizeProjectPermission(userId, projectId, "view_project");
  if (!allowed) return forbidden();
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck 2>&1 | tail -10; echo "tc $?"
npm run lint 2>&1 | tail -5; echo "lint $?"
npm run test:unit 2>&1 | tail -5; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
grep -rn "authorizeProjectMember\|_ALLOWED_ROLES\|MODERATOR_ROLES\|VIEW_ROLES" src/app/api/projects/\[id\]/comments/ src/app/api/projects/\[id\]/activity/ || echo "no old role-list constants or authorizeProjectMember left"
```
Expected: all four green; grep finds nothing (confirms the dead constants and the old helper calls are gone).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/projects/\[id\]/comments/ src/app/api/projects/\[id\]/activity/
git commit -m "refactor(rbac): wire comments and activity routes to authorizeProjectPermission"
```

---

## Task 6: Wire `invitations` routes

**Files:**
- Modify: `src/app/api/projects/[id]/invitations/route.ts`
- Modify: `src/app/api/projects/[id]/invitations/[invId]/route.ts`

**Interfaces:**
- Consumes: `authorizeProjectPermission` from `@/lib/auth`; permission `"invite_collaborator"`.
- These routes already have owner-or-admin checks written inline (`project.ownerId !== user.id && user.role !== "admin"`) — the swap is behavior-identical (same owner+admin outcome), just delegated to the shared helper.

- [ ] **Step 1: `src/app/api/projects/[id]/invitations/route.ts` (POST + GET)**

Change the import (line 1-8):
```ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";
import { sendInvitationEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { expireStaleInvitations } from "@/lib/invitations";
import type { MemberRole } from "@/generated/prisma";
```

In `POST`, replace:
```ts
  if (project.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "invite_collaborator");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

In `GET`, replace the identical block:
```ts
  if (project.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "invite_collaborator");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

- [ ] **Step 2: `src/app/api/projects/[id]/invitations/[invId]/route.ts` (DELETE)**

Change the import (line 1-3):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";
```

Replace:
```ts
  if (project.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "invite_collaborator");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck 2>&1 | tail -10; echo "tc $?"
npm run lint 2>&1 | tail -5; echo "lint $?"
npm run test:unit 2>&1 | tail -5; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
grep -n "user.role !== \"admin\"" src/app/api/projects/\[id\]/invitations/route.ts src/app/api/projects/\[id\]/invitations/\[invId\]/route.ts || echo "no raw admin-role compares left"
```
Expected: all four green; grep finds nothing.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/projects/\[id\]/invitations/
git commit -m "refactor(rbac): wire invitations routes to authorizeProjectPermission"
```

---

## Task 7: Wire `splits` routes (tightens view_split to owner+admin, per approved decision)

**Files:**
- Modify: `src/app/api/projects/[id]/splits/route.ts`
- Modify: `src/app/api/projects/[id]/splits/[splitId]/route.ts`
- Modify: `src/app/api/projects/[id]/splits/[splitId]/submit/route.ts`
- Modify: `src/app/api/projects/[id]/splits/[splitId]/contributors/route.ts`
- Modify: `src/app/api/projects/[id]/splits/[splitId]/contributors/[contributorId]/route.ts`

**Interfaces:**
- Consumes: `authorizeProjectPermission` from `@/lib/auth`; permissions `"view_split"`, `"manage_split"`.

- [ ] **Step 1: `src/app/api/projects/[id]/splits/route.ts` (GET — tightened; POST)**

Change the import (line 1-3):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";
```

In `GET`, replace the "owner or any member" block:
```ts
  // Allow project owner or any project member
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== user.id) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (!member) {
      return NextResponse.json({ error: "Not a project member" }, { status: 403 });
    }
  }
```
with:
```ts
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "view_split");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

In `POST`, replace:
```ts
  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can create splits" },
      { status: 403 },
    );
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "manage_split");
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can create splits" },
      { status: 403 },
    );
  }
```

- [ ] **Step 2: `src/app/api/projects/[id]/splits/[splitId]/route.ts` (GET — tightened; DELETE)**

Change the import (line 1-3):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";
```

In `GET`, replace the "owner or any member" block:
```ts
  // Allow project owner or any project member
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== user.id) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (!member) {
      return NextResponse.json({ error: "Not a project member" }, { status: 403 });
    }
  }
```
with:
```ts
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "view_split");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

In `DELETE`, replace:
```ts
  if (split.project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can delete splits" },
      { status: 403 },
    );
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "manage_split");
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can delete splits" },
      { status: 403 },
    );
  }
```

- [ ] **Step 3: `src/app/api/projects/[id]/splits/[splitId]/submit/route.ts` (POST)**

Change the import (line 1-4):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
```

Replace:
```ts
  if (split.project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can submit splits" },
      { status: 403 },
    );
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "manage_split");
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can submit splits" },
      { status: 403 },
    );
  }
```

- [ ] **Step 4: `src/app/api/projects/[id]/splits/[splitId]/contributors/route.ts` (POST)**

Change the import (line 1-3):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";
```

Replace:
```ts
  if (split.project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can edit splits" },
      { status: 403 },
    );
  }
```
with:
```ts
  const authed = await authorizeProjectPermission(user.id, projectId, "manage_split");
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can edit splits" },
      { status: 403 },
    );
  }
```

- [ ] **Step 5: `src/app/api/projects/[id]/splits/[splitId]/contributors/[contributorId]/route.ts` (shared `verifyOwnerDraft` used by PUT + DELETE)**

Change the import (line 1-3):
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";
```

Replace the `verifyOwnerDraft` function body:
```ts
async function verifyOwnerDraft(
  userId: string,
  projectId: string,
  splitId: string,
) {
  const split = await prisma.splitRecord.findFirst({
    where: { id: splitId, projectId },
    include: { project: { select: { ownerId: true } } },
  });

  if (!split) return { error: "Split not found", status: 404 } as const;
  if (split.project.ownerId !== userId)
    return { error: "Only the project owner can edit splits", status: 403 } as const;
  if (split.status !== "draft")
    return { error: "Only draft splits can be edited", status: 409 } as const;
  return null;
}
```
with:
```ts
async function verifyOwnerDraft(
  userId: string,
  projectId: string,
  splitId: string,
) {
  const split = await prisma.splitRecord.findFirst({
    where: { id: splitId, projectId },
  });

  if (!split) return { error: "Split not found", status: 404 } as const;

  const authed = await authorizeProjectPermission(userId, projectId, "manage_split");
  if (!authed)
    return { error: "Only the project owner can edit splits", status: 403 } as const;

  if (split.status !== "draft")
    return { error: "Only draft splits can be edited", status: 409 } as const;
  return null;
}
```
(The `include: { project: { select: { ownerId: true } } }` is dropped since `split.project.ownerId` is no longer read anywhere in this file — confirmed by checking both call sites, which only used it inside this function.)

- [ ] **Step 6: Verify**

```bash
npm run typecheck 2>&1 | tail -10; echo "tc $?"
npm run lint 2>&1 | tail -5; echo "lint $?"
npm run test:unit 2>&1 | tail -5; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
grep -rn "ownerId !== user.id\|ownerId !== userId\|Not a project member" src/app/api/projects/\[id\]/splits/ || echo "no raw ownerId compares left in splits/"
```
Expected: all four green; grep finds nothing.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/projects/\[id\]/splits/
git commit -m "fix(rbac): wire splits routes to authorizeProjectPermission, tighten view to owner+admin (RBAC-12)"
```

---

## Task 8: Integration verification + PR

**Files:** none changed; verification, PR creation only.

**Interfaces:**
- Consumes: every route change from Tasks 2-7.

- [ ] **Step 1: Start ephemeral Postgres and apply migrations**

```bash
docker rm -f mcb-rbac-pg >/dev/null 2>&1
docker run -d --name mcb-rbac-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_USER=pg -e POSTGRES_DB=mcb -p 5433:5432 postgres:16
for i in $(seq 1 20); do docker exec mcb-rbac-pg pg_isready -U pg -d mcb >/dev/null 2>&1 && break; sleep 1; done

cat > .env.local <<'EOF'
DATABASE_URL="postgresql://pg:pg@localhost:5433/mcb"
NEXTAUTH_SECRET="rbac-e2e-secret-0000000000000000000000"
APP_URL="http://127.0.0.1:3100"
NEXT_PUBLIC_APP_URL="http://127.0.0.1:3100"
AWS_ACCESS_KEY_ID="dummy"
AWS_SECRET_ACCESS_KEY="dummy"
AWS_S3_BUCKET="dummy-bucket"
AWS_REGION="eu-central-1"
EOF

npx prisma migrate deploy 2>&1 | tail -5
```
Expected: migrate reports applied/up-to-date, no `P1012` (regression from #135 stays fixed).

- [ ] **Step 2: Seed users, roles, and a project via the E2E test routes**

```bash
(E2E_TEST_MODE=1 npx next dev -p 3100 >/tmp/dev.log 2>&1 &) ; sleep 8

# Create owner, viewer, editor, admin, non-member users via the test-only route.
OWNER_ID=$(curl -s -X POST http://127.0.0.1:3100/api/test/users -H 'content-type: application/json' -d '{"email":"owner@test.dev","password":"testpass123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
VIEWER_ID=$(curl -s -X POST http://127.0.0.1:3100/api/test/users -H 'content-type: application/json' -d '{"email":"viewer@test.dev","password":"testpass123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
ADMIN_ID=$(curl -s -X POST http://127.0.0.1:3100/api/test/users -H 'content-type: application/json' -d '{"email":"admin@test.dev","password":"testpass123","role":"admin"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "owner=$OWNER_ID viewer=$VIEWER_ID admin=$ADMIN_ID"
```
(If `/api/test/users` does not accept a `role` field for the admin case, set it directly via SQL: `docker exec mcb-rbac-pg psql -U pg -d mcb -c "UPDATE \"User\" SET role='admin' WHERE id='$ADMIN_ID';"`.)

Log in as owner, create a project, add viewer as a `viewer`-role member (via the app's own login + invitations flow, or directly via SQL for speed):
```bash
PROJECT_ID=$(docker exec mcb-rbac-pg psql -U pg -d mcb -tc "INSERT INTO \"Project\" (id, \"ownerId\", title, status, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$OWNER_ID', 'RBAC test project', 'active', now(), now()) RETURNING id;" | tr -d ' ')
docker exec mcb-rbac-pg psql -U pg -d mcb -c "INSERT INTO \"ProjectMember\" (id, \"projectId\", \"userId\", role, \"createdAt\") VALUES (gen_random_uuid(), '$PROJECT_ID', '$VIEWER_ID', 'viewer', now());"
echo "project=$PROJECT_ID"
```

- [ ] **Step 3: Verify #141 — viewer can now read files**

```bash
VIEWER_COOKIE=$(curl -s -i -X POST http://127.0.0.1:3100/api/auth/login -H 'content-type: application/json' -d '{"email":"viewer@test.dev","password":"testpass123"}' | grep -i '^set-cookie' | sed 's/.*session=\([^;]*\).*/session=\1/')
curl -s -o /dev/null -w "GET /files as viewer: %{http_code}\n" http://127.0.0.1:3100/api/projects/$PROJECT_ID/files -H "cookie: $VIEWER_COOKIE"
```
Expected: `200` (previously `403` — this is the #141 fix).

- [ ] **Step 4: Verify #141 negative control — viewer still cannot upload**

```bash
curl -s -o /dev/null -w "POST /upload-url as viewer: %{http_code}\n" -X POST http://127.0.0.1:3100/api/projects/$PROJECT_ID/files/upload-url \
  -H "cookie: $VIEWER_COOKIE" -H 'content-type: application/json' \
  -d '{"filename":"test.mp3","mimeType":"audio/mpeg","fileSize":1000}'
```
Expected: `403` (viewer is not in `upload_files: ["owner","editor"]` — matrix still enforced correctly).

- [ ] **Step 5: Verify #142 — admin override works on a project the admin doesn't own**

```bash
ADMIN_COOKIE=$(curl -s -i -X POST http://127.0.0.1:3100/api/auth/login -H 'content-type: application/json' -d '{"email":"admin@test.dev","password":"testpass123"}' | grep -i '^set-cookie' | sed 's/.*session=\([^;]*\).*/session=\1/')
curl -s -o /dev/null -w "PUT /projects/:id as admin (not owner): %{http_code}\n" -X PUT http://127.0.0.1:3100/api/projects/$PROJECT_ID \
  -H "cookie: $ADMIN_COOKIE" -H 'content-type: application/json' -d '{"title":"Renamed by admin"}'
```
Expected: NOT `403` (admin override from p0/Task 2 applies even without project membership; expect `200`).

- [ ] **Step 6: Verify the new versions membership gate**

```bash
NONMEMBER_ID=$(curl -s -X POST http://127.0.0.1:3100/api/test/users -H 'content-type: application/json' -d '{"email":"stranger@test.dev","password":"testpass123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
STRANGER_COOKIE=$(curl -s -i -X POST http://127.0.0.1:3100/api/auth/login -H 'content-type: application/json' -d '{"email":"stranger@test.dev","password":"testpass123"}' | grep -i '^set-cookie' | sed 's/.*session=\([^;]*\).*/session=\1/')
curl -s -o /dev/null -w "GET /versions as non-member: %{http_code}\n" http://127.0.0.1:3100/api/projects/$PROJECT_ID/versions -H "cookie: $STRANGER_COOKIE"
```
Expected: `403` (previously any authenticated user could read this — this is the approved new gate from Task 4).

- [ ] **Step 7: Verify the splits view tightening**

```bash
curl -s -o /dev/null -w "GET /splits as viewer (member, not owner): %{http_code}\n" http://127.0.0.1:3100/api/projects/$PROJECT_ID/splits -H "cookie: $VIEWER_COOKIE"
```
Expected: `403` (previously any project member could list splits; now owner+admin only per RBAC-12 — this is the approved tightening from Task 7).

- [ ] **Step 8: Tear down**

```bash
pkill -f "next dev -p 3100" 2>/dev/null || true
docker rm -f mcb-rbac-pg >/dev/null 2>&1 && echo "pg removed"
rm -f .env.local
rm -rf test-results playwright-report
git status -s | grep -v "^??" || echo "working tree clean of tracked changes"
```

- [ ] **Step 9: Final static check on the clean branch**

```bash
npm run typecheck 2>&1 | tail -5; echo "tc $?"
npm run lint 2>&1 | tail -5; echo "lint $?"
npm run test:unit 2>&1 | tail -5; echo "unit $?"
npm run build >/tmp/b.log 2>&1; echo "build $?"
grep -rln "isOwner\|isEditor" src/app/api/projects/\[id\]/ | grep -v "/versions/route.ts\|/versions/\[versionId\]/route.ts" || echo "no stray isOwner/isEditor outside the two intentional versions filter blocks"
```
Expected: all four `0`; the grep confirms only the two deliberately-kept filter blocks (versions list/detail, used for status filtering, not gating) still reference `isOwner`/`isEditor`.

- [ ] **Step 10: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --base master --title "fix: RBAC route-wiring — matrix as source of truth (#141 #142)" --body "$(cat <<'EOF'
Wires every projects/[id] route onto the matrix-driven `authorizeProjectPermission` (built in the p0 pass), replacing inline `isOwner || isEditor` checks and ad-hoc ownerId comparisons.

## #141 — viewer/commenter file access
`download_files` now correctly allows all four roles per the matrix. Negative control verified: viewer still cannot upload.

## #142 — admin override
Every route now inherits the global-admin bypass built into `authorizeProjectPermission`, including projects, files, versions, comments, activity, invitations, and splits.

## Two approved behavior changes (confirmed with project owner)
1. **splits GET** (list + detail) tightens from "any project member" to owner+admin only — matches audit finding RBAC-12.
2. **versions GET** (list + detail) gains a membership gate — previously ANY authenticated user could read published versions of ANY project; now requires `view_project` (project membership).

## Scope
Only `src/app/api/projects/[id]/**` (excluding `gigs/**`). Gig/application/hire/admin/connect routes are a separate authz domain, untouched.

## Verification
- Unit: \`rbac.test.ts\` 8/8 (4 new cases for the two new permission keys).
- Static: typecheck/lint/build green throughout.
- Integration (ephemeral Postgres): viewer reads files (200), viewer still blocked from upload (403), admin bypasses ownership on a foreign project (200), non-member blocked from versions (403), viewer blocked from splits list (403).

Closes #141
Closes #142

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Spec coverage:** spec §3 (matrix extension) → Task 1; §4 route table → Tasks 2 (projects core), 3 (files → #141), 4 (versions, incl. approved gate), 5 (comments/activity), 6 (invitations), 7 (splits, incl. approved RBAC-12 tightening); §5 out-of-scope (gigs/marketplace/admin/session) → respected, never touched; §6 verification → Task 8 integration checks map 1:1 to the spec's headline cases (viewer file read, admin bypass, viewer negative control) plus the two approved changes; §7 acceptance criteria → Task 8 Steps 3-7 + 9 assert each one explicitly. All covered.
- **Placeholder scan:** every step has concrete before/after code, exact grep commands, and expected output. The only bracketed text (`$PROJECT_ID`, `$OWNER_ID`, etc.) are shell variables captured earlier in the same task, not unresolved placeholders.
- **Type consistency:** `authorizeProjectPermission(userId: string, projectId: string, permission: Permission)` — defined in p0, unchanged, imported identically (`from "@/lib/auth"`) in every task. New `Permission` keys `create_version` / `manage_project_lifecycle` defined in Task 1, consumed by name in Tasks 2 and 4 exactly as spelled there. `can()` signature unchanged. No route's response shape, status-code semantics (401 auth / 403 forbidden / 404 not found / 409 conflict), or business logic altered — confirmed per-file against the original source read before writing this plan.
