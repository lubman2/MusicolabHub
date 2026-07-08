# Splits Submit UI + Versions UI (#143 #144) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make two complete-but-unreachable API chains reachable from the UI: split submit-for-confirmation (#143, audit AC-05 — plus the TODO contributor notification in the submit route) and version create/publish/delete + file attach (#144, audit epic-04 + R-8.1-15 — BatchFileUpload uploads to the project but never attaches to the version).

**Architecture:** Pure UI wiring plus one route TODO. The split editor gains a Submit button (draft + total=100 gated) and the submit route implements its line-111 TODO with per-contributor `split_submitted` notifications linking to the existing `/splits/confirmations/{id}` page. The versions list gains an inline New Version form; the version detail gains Publish (body-less PATCH) and Delete (with the 409 `?confirm=true` round-trip) buttons; `BatchFileUpload` gains a backward-compatible `onFilesUploaded(fileIds)` callback the version page uses to POST `/versions/{id}/files`. All API endpoints already exist and are verified — no API behavior changes except the notification TODO.

**Tech Stack:** Next.js 16 app router (client pages), Tailwind (existing utility conventions), Playwright.

## Design decisions (spec)

- **Split Submit button** sits in the editor header next to Delete Draft; enabled only when `isDraft && total === 100`; disabled state shows why (`title` attr). `confirm()` → `POST ${apiBase}/submit` → on ok bump `refreshKey` (status flips to `pending_confirmation`, existing status-gated UI takes over); on error `alert(err.error)` (page convention).
- **Contributor notifications**: after the submit transaction, loop the transaction result's contributors that have a confirmation row; `createNotification` each (`type: "split_submitted"` — enum value exists), `sourceType: "split_confirmation"`, `sourceId: <their confirmationId>` (per-recipient sourceIds → per-recipient `createNotification` calls, NOT bulk `createNotifications`, which shares one payload), excluding the submitting owner. Errors are already swallowed by the lib.
- **New Version**: inline toggle form on the versions list page (name required, changelog optional textarea) → `POST /api/projects/{id}/versions` → `router.push` to the new version detail. No modal library (none exists in the app).
- **Publish**: shown on version detail only for `status === "draft"`; `confirm()` → body-less `PATCH` → reload. 403/409 → `alert(err.error)`.
- **Delete**: shown for `draft` and `published`; `confirm()` → `DELETE`; on 409 `confirmation_required` → second `confirm()` with the server's message → retry `DELETE ?confirm=true`; on success `router.push` to the versions list.
- **Attach wiring**: `BatchFileUpload` gets an OPTIONAL `onFilesUploaded?: (fileIds: string[]) => void` fired alongside the existing `onUploadComplete` when all files settle, carrying the successful `fileId`s (they're already stored per-file internally). The version detail page implements it: `POST /versions/{versionId}/files` with `{ fileIds }` → reload on 201; error → red banner (page already has the banner pattern). Existing `onUploadComplete` behavior unchanged (single consumer).
- **UI language:** these pages use English labels (matching the split editor / versions pages' existing copy).
- **Verification limits (honest):** e2e covers split submit end-to-end and version create→publish→delete end-to-end. The upload→attach step cannot run in local e2e (dummy S3 creds — known issue #165), so attach wiring is verified by: (a) the attach API's existing integration proof, (b) a targeted assertion that the version page sends the attach request when `onFilesUploaded` fires (component-level walk in review), and (c) explicit disclosure in the PR body.
- **The split editor's legacy `x-user-id: dev-user` headers stay untouched** (session cookie is what actually authenticates; the header is vestigial — flagged for a follow-up, not this PR).

## Global Constraints

- Node 22 for every npm command: `PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH"`; capture TRUE exit codes (`>/tmp/x.log 2>&1; echo $?`), `rm -rf .next/dev` before typecheck if it reports errors in `.next/dev/types`.
- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build` green after every task.
- No API behavior changes except the submit-route notification block. No new dependencies. Follow the styling conventions quoted in each task verbatim.
- Branch: `feat/splits-versions-ui` (created by the controller).

---

## Task 1: Split Submit button + contributor notifications (#143)

**Files:**
- Modify: `src/app/projects/[id]/splits/[splitId]/page.tsx`
- Modify: `src/app/api/projects/[id]/splits/[splitId]/submit/route.ts`

- [ ] **Step 1: Read both files completely.**

- [ ] **Step 2: Add the submit handler to the page** (next to `handleDeleteSplit`, ~line 174; mirror its style — the page's `apiBase` and `headers` consts already exist):
```tsx
  async function handleSubmitSplit() {
    if (
      !confirm(
        "Submit this split for contributor confirmation? Percentages can no longer be edited after submission.",
      )
    )
      return;
    setSaving(true);
    const res = await fetch(`${apiBase}/submit`, {
      method: "POST",
      headers,
    });
    setSaving(false);
    if (res.ok) {
      setRefreshKey((k) => k + 1);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to submit split");
    }
  }
```
(Adapt the `setSaving`/`setRefreshKey` names to the page's actual state setters — read first. If `headers` includes Content-Type only, that's fine for a body-less POST.)

- [ ] **Step 3: Add the button in the header JSX** — inside the existing `{isDraft && (...)}` block next to Delete Draft, BEFORE it:
```tsx
      <button
        onClick={handleSubmitSplit}
        disabled={saving || total !== 100}
        title={
          total !== 100
            ? "Percentages must total exactly 100% before submitting"
            : undefined
        }
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        Submit for Confirmation
      </button>
```
Wrap both buttons in a `flex items-center gap-2` container if they aren't already in one.

- [ ] **Step 4: Implement the notification TODO in the submit route.** Replace the line-111 TODO comment with (adding `createNotification` to the imports from `@/lib/notifications` — the file currently imports nothing from it; also read what the transaction result variable is called — scout says `updated`, whose contributors include nested `user {id,email}` and `confirmation`):
```ts
  // Notify each contributor that their confirmation is awaited.
  for (const contributor of updated.contributors) {
    if (!contributor.confirmation || contributor.userId === user.id) continue;
    await createNotification({
      userId: contributor.userId,
      type: "split_submitted",
      title: "A royalty split awaits your confirmation",
      body: `You are allocated ${contributor.percentage}% — please confirm or reject.`,
      sourceType: "split_confirmation",
      sourceId: contributor.confirmation.id,
    });
  }
```
Adapt field access to the actual include shape (verify `confirmation` is singular on the contributor include in this route's transaction result; if the shape lacks `confirmation`, extend the transaction's final `include` minimally to return it). `contributor.percentage` is a Decimal — render via `Number(contributor.percentage)` if template output shows an object.

- [ ] **Step 5: Gates + commit**
```bash
export PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH"; rm -rf .next/dev
npm run typecheck >/tmp/t.log 2>&1; echo "tc $?"; npm run lint >/tmp/l.log 2>&1; echo "lint $?"; npm run test:unit >/tmp/u.log 2>&1; echo "unit $?"; npm run build >/tmp/b.log 2>&1; echo "build $?"
git add "src/app/projects/[id]/splits/[splitId]/page.tsx" "src/app/api/projects/[id]/splits/[splitId]/submit/route.ts"
git commit -m "feat(splits): Submit for Confirmation button + contributor notifications (Closes #143)"
```

---

## Task 2: Version detail — Publish, Delete, attach wiring (#144 part 1)

**Files:**
- Modify: `src/components/BatchFileUpload.tsx`
- Modify: `src/app/projects/[id]/versions/[versionId]/page.tsx`

- [ ] **Step 1: Read both files completely.**

- [ ] **Step 2: `BatchFileUpload` — surface fileIds.** Add to the props interface:
```tsx
  /** Fired once when every file settles, with the fileIds that uploaded successfully. */
  onFilesUploaded?: (fileIds: string[]) => void;
```
In the existing all-done completion block (the `setFiles((currentFiles) => {...})` that computes `successCount`/`failedCount`), additionally collect and emit:
```tsx
        const uploadedIds = currentFiles
          .filter((f) => f.status === "success" && f.fileId)
          .map((f) => f.fileId as string);
        if (uploadedIds.length > 0) {
          onFilesUploaded?.(uploadedIds);
        }
```
(Place it right beside the `onUploadComplete?.(...)` call so both fire from the same settle check. Existing callers without the prop are unaffected.)

- [ ] **Step 3: Version detail page — attach after upload.** Where `<BatchFileUpload projectId={...} onUploadComplete={handleUploadComplete} />` renders (draft-only block), add the new prop `onFilesUploaded={handleFilesUploaded}` and implement:
```tsx
  async function handleFilesUploaded(fileIds: string[]) {
    const res = await fetch(
      `/api/projects/${projectId}/versions/${versionId}/files`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Failed to attach uploaded files to this version");
      return;
    }
    setReloadTrigger((prev) => prev + 1);
  }
```
(Adapt `setError`/`setReloadTrigger` to the page's actual state names — the page already has an error banner and a reload counter per the scout read. The existing `handleUploadComplete` reload stays; double reload is harmless, or fold them if trivial.)

- [ ] **Step 4: Publish + Delete buttons.** In the header area of the version detail page (near the status badge), add for `version.status === "draft"`:
```tsx
      <button
        onClick={handlePublish}
        disabled={acting}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        Publish
      </button>
```
and for `status === "draft" || status === "published"`:
```tsx
      <button
        onClick={handleDelete}
        disabled={acting}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Delete
      </button>
```
Handlers (add an `acting` boolean state):
```tsx
  async function handlePublish() {
    if (!confirm("Publish this version? The current published version will be superseded.")) return;
    setActing(true);
    const res = await fetch(`/api/projects/${projectId}/versions/${versionId}`, { method: "PATCH" });
    setActing(false);
    if (res.ok) {
      setReloadTrigger((prev) => prev + 1);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to publish version");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this version?")) return;
    setActing(true);
    let res = await fetch(`/api/projects/${projectId}/versions/${versionId}`, { method: "DELETE" });
    if (res.status === 409) {
      const err = await res.json().catch(() => ({}));
      if (err.error === "confirmation_required") {
        if (!confirm(err.message || "This version is published. Delete anyway?")) {
          setActing(false);
          return;
        }
        res = await fetch(
          `/api/projects/${projectId}/versions/${versionId}?confirm=true`,
          { method: "DELETE" },
        );
      }
    }
    setActing(false);
    if (res.ok) {
      router.push(`/projects/${projectId}/versions`);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete version");
    }
  }
```
(`router` from `useRouter()` — check it's already imported.)

- [ ] **Step 5: Gates + commit**
```bash
export PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH"; rm -rf .next/dev
npm run typecheck >/tmp/t.log 2>&1; echo "tc $?"; npm run lint >/tmp/l.log 2>&1; echo "lint $?"; npm run test:unit >/tmp/u.log 2>&1; echo "unit $?"; npm run build >/tmp/b.log 2>&1; echo "build $?"
git add src/components/BatchFileUpload.tsx "src/app/projects/[id]/versions/[versionId]/page.tsx"
git commit -m "feat(versions): publish + delete actions, attach uploaded files to draft (#144)"
```

---

## Task 3: New Version create form (#144 part 2)

**Files:**
- Modify: `src/app/projects/[id]/versions/page.tsx`

- [ ] **Step 1: Read the file completely.** It's a client component with the list fetch + pagination + a "Show all / Published only" toggle.

- [ ] **Step 2: Add state + handler:**
```tsx
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newChangelog, setNewChangelog] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          changelog: newChangelog || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data.error || "Failed to create version");
        return;
      }
      router.push(`/projects/${projectId}/versions/${data.id}`);
    } catch {
      setCreateError("Network error. Try again.");
    } finally {
      setCreating(false);
    }
  }
```
(`router` via `useRouter()` — add the import if missing.)

- [ ] **Step 3: Add the button + inline form JSX** in the page header area (near the status toggle):
```tsx
      <button
        onClick={() => setShowCreate((v) => !v)}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
      >
        New Version
      </button>
```
and, below the header when `showCreate`:
```tsx
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
        >
          <label className="block">
            <span className="block text-sm font-medium">Name</span>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              placeholder="v1.0 — first mix"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium">Changelog (optional)</span>
            <textarea
              value={newChangelog}
              onChange={(e) => setNewChangelog(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create draft"}
          </button>
        </form>
      )}
```
Fit the button into the page's existing header layout (flex container with the toggle) without disturbing the toggle.

- [ ] **Step 4: Gates + commit**
```bash
export PATH="/Users/lubman/.nvm/versions/node/v22.22.2/bin:$PATH"; rm -rf .next/dev
npm run typecheck >/tmp/t.log 2>&1; echo "tc $?"; npm run lint >/tmp/l.log 2>&1; echo "lint $?"; npm run test:unit >/tmp/u.log 2>&1; echo "unit $?"; npm run build >/tmp/b.log 2>&1; echo "build $?"
git add "src/app/projects/[id]/versions/page.tsx"
git commit -m "feat(versions): New Version create form on versions list (#144)"
```

---

## Task 4: E2E specs for both flows

**Files:**
- Create: `e2e/versions-ui.spec.ts`
- Create: `e2e/splits-submit.spec.ts`

- [ ] **Step 1: Recon** — read `e2e/happy-path.spec.ts`, `e2e/helpers/db.ts`, `e2e/fixtures.ts`, `playwright.config.ts`. Reuse their conventions exactly (password constant, anchored selectors, seedOnboardedUser signature, cleanup discipline). Note: this branch does NOT include the test-user-subscription seeding (that's PR #169) — no route here is subscription-gated on this branch, so no interaction.

- [ ] **Step 2: `e2e/versions-ui.spec.ts`** — owner seeds via `seedOnboardedUser`, logs in via UI, creates a project via API (`request.post("/api/projects", ...)` with the browser-context cookies or per happy-path's pattern), then via UI:
  1. Navigate to `/projects/{id}/versions` → click "New Version" → fill name `e2e draft` → submit → expect URL `/projects/{id}/versions/{newId}` and status badge `draft`.
  2. Click Publish → accept the confirm dialog (`page.on("dialog", d => d.accept())` registered before) → expect status badge `published`.
  3. Click Delete → two confirms (409 round-trip: published needs the second) → expect redirect to the versions list and the version no longer listed (published-only view shows nothing).
  Assertions on the intermediate 409 flow: register a dialog auto-accept handler; after delete, `waitForURL(/\/versions$/)`.
  Cleanup via `cleanupUser`.

- [ ] **Step 3: `e2e/splits-submit.spec.ts`** — owner + contributor seeded; owner creates project via API; owner creates a draft split via API (`POST /api/projects/{id}/splits` — read the route for the body shape) and adds the contributor at 100% via API (`POST .../splits/{splitId}/contributors` — body shape from the route); then via UI:
  1. Owner logs in, opens `/projects/{id}/splits/{splitId}` → "Submit for Confirmation" button enabled (total 100) → click + accept confirm → status badge becomes `pending confirmation`.
  2. Negative control first (before adding the contributor... restructure: create a SECOND split with a 50% contributor → button disabled (`toBeDisabled()`)).
  3. API assertion: contributor's notifications contain a `split_submitted` row — via `page.request.get("/api/notifications")` as the contributor if such an endpoint exists (check `src/app/api/notifications/` — if absent, assert via the confirmation page instead: log in as contributor, GET their confirmation id from... simplest: assert `GET /api/splits/confirmations/{id}` reachable — get the id from the submit response captured via `page.waitForResponse` on the submit POST; keep it pragmatic and document what you asserted).
  Cleanup both users.

- [ ] **Step 4: Run for real** — same ephemeral recipe as prior e2e runs (container `mcb-e2e-pg`, `.env.local` guard + backup, `E2E_TEST_MODE=1` dev server; see `.git/sdd` reports from the verify-email branch if helpful, or TESTING.md). Both new specs MUST pass; also re-run `verify-email.spec.ts` isn't on this branch — regression = `happy-path.spec.ts` expected to fail only at its known S3 step (#165); it must still pass project creation. Full teardown.

- [ ] **Step 5: Gates (typecheck+lint) + commit**
```bash
git add e2e/
git commit -m "test(e2e): splits submit + versions UI flows (#143 #144)"
```

---

## Task 5: Final verification + PR

- [ ] **Step 1:** Full gates + `./scripts/rbac-integration-check.sh` (5/5 expected — no authz surface touched).
- [ ] **Step 2:** Push `feat/splits-versions-ui`; controller runs the final whole-branch review, then opens the PR (Closes #143, Closes #144) with the attach-verification disclosure and the `x-user-id` legacy-header follow-up note.

---

## Self-Review

- **Issue coverage:** #143 → Task 1 (button + the route's TODO notification, linking to the existing confirmation UI); #144 → Tasks 2+3 (publish/delete/create UI + the R-8.1-15 attach wiring via the new BatchFileUpload callback); Task 4 proves the AC-05 and create→publish→delete paths through the real UI.
- **Placeholder scan:** page edits carry complete code with named adaptation points (state-setter names verified on read); e2e task names its pragmatic-assertion fallbacks explicitly rather than leaving TODOs.
- **Type consistency:** `onFilesUploaded(fileIds: string[])` produced in Task 2 Step 2 = consumed in Step 3; attach body `{ fileIds }` matches the API contract (non-empty string array, draft-only, ready-only); create response `data.id` used for the redirect matches the POST's 201 body (returns the version object).
