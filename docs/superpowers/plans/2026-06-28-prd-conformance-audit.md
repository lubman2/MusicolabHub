# PRD Conformance Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a complete, evidence-backed conformance report of the MusicCollabHub implementation against the PRD + supporting docs across all 12 epics, plus a deduplicated GitHub-issue backlog of the gaps.

**Architecture:** Read-only audit. A requirement index is extracted from the baseline docs; per-epic subagents map code to those requirements and record findings with file:line evidence; the main thread runs runtime verification of critical flows, runs three cross-cutting passes (security/RBAC/decisions), synthesizes one report, then creates/links GitHub issues. No production code is modified.

**Tech Stack:** Next.js 16, TypeScript 6, Prisma 7, Postgres, Stripe, AWS S3, Playwright (e2e). Tooling: `gh` CLI for issues, `git` for commits, `grep`/`rg` for evidence-gathering.

## Global Constraints

- **Read-only on app code.** No edits under `src/`, `prisma/`, `e2e/`. The audit only creates files under `docs/audit/` and GitHub issues. Verbatim from spec §1, §8.
- **Every requirement gets a status** from exactly: ✅ hotovo / 🟡 částečně / ❌ chybí / ⚠️ odchyluje se. Verbatim from spec §2.3.
- **Every non-❌ finding carries evidence** as `soubor:řádek`. Verbatim from spec §3.1.
- **Every finding carries a verification level**: `čteno` (static) or `spuštěno` (runtime) or `neověřeno-runtime` (infra missing). Verbatim from spec §3.3.
- **No duplicate GitHub issues** vs the existing backlog (#1–#92, #114, #123–#126). Link existing where one matches. Verbatim from spec §5.3.
- **Baseline docs** (source of truth): `PRD_v2_MUSICCOLLABHUB.md`, `Decision_Log_MUSICCOLLABHUB.md`, `Red_Team_Matrix_MUSICCOLLABHUB.md`, `Role_Lifecycle_Tables_MUSICCOLLABHUB.md`.
- **Report date slug:** `2026-06-28`.

---

## Shared Conventions

### Finding row format (used in every findings file and the report)

```markdown
| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|:------:|----------------------|--------|-------------------|--------|
| R-8.1-03 | Snapshot-based version history | 🟡 | src/lib/... :42; src/app/api/projects/[id]/versions/route.ts:1 | čteno | chybí soft-delete verze | — |
```

Status legend: ✅ hotovo · 🟡 částečně · ❌ chybí · ⚠️ odchyluje se.
Úroveň legend: `čteno` · `spuštěno` · `neověřeno-runtime`.

### Requirement ID scheme

- `R-8.x-NN` — functional requirement bullet under PRD §8.x.
- `AC-NN` — acceptance criterion from PRD §13.
- `SEC-NN` — Red Team Matrix scenario.
- `RBAC-NN` — Role Lifecycle Tables rule/transition.
- `DEC-NN` — Decision Log decision.

### Epic → PRD area map (which baseline sections each epic agent checks)

| Epic | Název | Primární PRD sekce |
|------|-------|--------------------|
| 00 | Project Bootstrap | §9 Data/State Model, §10 Non-Functional |
| 01 | Auth & Onboarding | §8.1 (account/onboarding/profile), §11 Legal/GDPR |
| 02 | Project Hub Core | §8.1 Project Hub |
| 03 | File Management & Storage | §8.1 (files) |
| 04 | Version Management | §8.1 (versioning) |
| 05 | Collaboration & Permissions | §8.2 Permissions, §8.1 (invitations/membership) |
| 06 | Comments & Activity | §8.1 (comments/activity/notifications) |
| 07 | Ownership Splits | §8.5 Ownership and Contributor Records |
| 08 | Subscription & Billing | §8.4 Payments (subscriptions) |
| 09 | Admin & Support | §8.6 Admin and Support |
| 10 | Marketplace — Gigs & Discovery | §8.3 Marketplace (gigs) |
| 11 | Marketplace — Hiring & Delivery | §8.3 Marketplace (hiring/delivery) |
| 12 | Marketplace — Payments & Payouts | §8.4 Payments (payouts), §8.3 |

### Code map (where to look)

- API: `src/app/api/**/route.ts`
- Data model: `prisma/schema.prisma`
- Domain logic: `src/lib/**`
- UI pages: `src/app/**/page.tsx`
- Test mode helpers: `src/app/api/test/**`, `e2e/happy-path.spec.ts`, `TESTING.md`

---

## Task 1: Requirement index (foundation)

**Files:**
- Create: `docs/audit/requirement-index.md`

**Interfaces:**
- Produces: the canonical list of requirement IDs (`R-8.x-NN`, `AC-NN`, `SEC-NN`, `RBAC-NN`, `DEC-NN`) that every later task references.

- [ ] **Step 1: Extract functional requirements**

Read `PRD_v2_MUSICCOLLABHUB.md` §8.1–8.6 and §13. For each distinct requirement bullet/sentence, create one row: `ID | text požadavku | PRD §`. Use the ID scheme above.

- [ ] **Step 2: Extract supporting-doc requirements**

Read the three supporting docs. For each: one row per scenario/rule/decision → `SEC-NN` (Red Team Matrix), `RBAC-NN` (Role Lifecycle Tables), `DEC-NN` (Decision Log), with source line reference.

- [ ] **Step 3: Write the index file**

Write `docs/audit/requirement-index.md`: a heading per source, a table `ID | Požadavek | Zdroj (doc §/řádek)`. No statuses yet — this is the checklist only.

- [ ] **Step 4: Verify coverage**

Run:
```bash
grep -cE '^\| (R-8|AC-|SEC-|RBAC-|DEC-)' docs/audit/requirement-index.md
grep -cE '^- |^\* |^[0-9]+\.' PRD_v2_MUSICCOLLABHUB.md
```
Expected: index row count ≥ number of distinct §8/§13 bullets in the PRD (sanity check that nothing was dropped). Eyeball that every §8.1–8.6 and §13 has at least one row.

- [ ] **Step 5: Commit**

```bash
git add docs/audit/requirement-index.md
git commit -m "audit: requirement index from PRD + supporting docs"
```

---

## Task 2: Runtime-infra probe

**Files:**
- Create: `docs/audit/runtime-infra.md`

**Interfaces:**
- Produces: the decision of which of the 5 critical flows can be verified `spuštěno` vs must be marked `neověřeno-runtime`. Task 4 consumes this.

- [ ] **Step 1: Detect available infra**

Run:
```bash
test -f .env && echo "has .env" || echo "no .env"
grep -oE '^(DATABASE_URL|STRIPE_SECRET_KEY|AWS_S3_BUCKET|SMTP_HOST|E2E_TEST_MODE)=' .env 2>/dev/null
cat TESTING.md | head -40
ls src/app/api/test
```

- [ ] **Step 2: Probe the database**

Run (non-destructive):
```bash
npx prisma db execute --stdin <<<'SELECT 1;' 2>&1 | tail -3 || echo "DB unreachable"
```
Record whether a usable dev DB is reachable.

- [ ] **Step 3: Write the infra report**

Write `docs/audit/runtime-infra.md` with a table: `Flow (auth/stripe/splits/rbac/files) | Lze ověřit runtime? (ano/ne) | Jak (E2E_TEST_MODE / test routes / ruční) | Pokud ne, proč`. This drives Task 4's level column.

- [ ] **Step 4: Commit**

```bash
git add docs/audit/runtime-infra.md
git commit -m "audit: runtime infra probe + verification feasibility"
```

---

## Task 3 (×13): Per-epic static audit — DISPATCH ONE SUBAGENT PER EPIC

> **Execution note:** During subagent-driven execution, dispatch one fresh subagent per epic (00–12). All 13 are independent and may run in parallel. Each produces one findings file. The procedure below is **identical** for every epic; only the epic number, name, and PRD-area subset (from the Epic→PRD map) change.

**Files (per epic XX):**
- Create: `docs/audit/findings/epic-XX.md`
- Read-only: `docs/audit/requirement-index.md`, baseline docs, `src/**`, `prisma/schema.prisma`

**Interfaces:**
- Consumes: requirement IDs from `docs/audit/requirement-index.md` matching this epic's PRD area(s).
- Produces: `docs/audit/findings/epic-XX.md` containing one finding row (Shared Conventions format) for **every** requirement ID in this epic's PRD-area subset.

**Subagent prompt template (fill EPIC_NUM, EPIC_NAME, PRD_SECTIONS):**

> You are auditing epic EPIC_NUM (EPIC_NAME) of MusicCollabHub against the PRD. This is READ-ONLY: do not edit any code. Baseline: `PRD_v2_MUSICCOLLABHUB.md` sections PRD_SECTIONS, plus `Decision_Log`, `Red_Team_Matrix`, `Role_Lifecycle_Tables` where relevant to this epic. Requirement IDs are in `docs/audit/requirement-index.md` — audit every ID whose source falls in PRD_SECTIONS.
>
> For each requirement: locate the implementing code across API routes (`src/app/api/**/route.ts`), model (`prisma/schema.prisma`), domain logic (`src/lib/**`), and UI (`src/app/**/page.tsx`). Assign a status (✅/🟡/❌/⚠️), cite evidence as `soubor:řádek`, set level `čteno`, and note the gap. For ⚠️ include both the PRD citation and the code citation so the divergence is independently judgeable.
>
> Output ONLY the file `docs/audit/findings/epic-EPIC_NUM.md`: a short heading, then a table in this exact format: `| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |` with Issue# left as `—`. Cover every relevant requirement ID; do not invent IDs.

- [ ] **Step 1: Dispatch the 13 epic agents** (parallel) using the template above with these parameters:

| EPIC_NUM | EPIC_NAME | PRD_SECTIONS |
|----------|-----------|--------------|
| 00 | Project Bootstrap | §9, §10 |
| 01 | Auth & Onboarding | §8.1 (account/onboarding/profile), §11 |
| 02 | Project Hub Core | §8.1 |
| 03 | File Management & Storage | §8.1 (files) |
| 04 | Version Management | §8.1 (versioning) |
| 05 | Collaboration & Permissions | §8.2, §8.1 (invitations/membership) |
| 06 | Comments & Activity | §8.1 (comments/activity/notifications) |
| 07 | Ownership Splits | §8.5 |
| 08 | Subscription & Billing | §8.4 (subscriptions) |
| 09 | Admin & Support | §8.6 |
| 10 | Marketplace — Gigs & Discovery | §8.3 (gigs) |
| 11 | Marketplace — Hiring & Delivery | §8.3 (hiring/delivery) |
| 12 | Marketplace — Payments & Payouts | §8.4 (payouts), §8.3 |

- [ ] **Step 2: Verify each findings file is complete**

Run:
```bash
ls docs/audit/findings/epic-*.md | wc -l   # expect 13
for f in docs/audit/findings/epic-*.md; do
  echo "$f: $(grep -cE '^\| (R-|AC-|SEC-|RBAC-|DEC-)' "$f") rows"
done
# every data row must have a status emoji
grep -LE '✅|🟡|❌|⚠️' docs/audit/findings/epic-*.md || echo "all files have statuses"
```
Expected: 13 files, each with rows, all containing status emoji.

- [ ] **Step 3: Spot-check evidence validity**

Pick 3 random non-❌ rows across files and confirm the cited `soubor:řádek` actually contains the claimed implementation (open the file at that line). If a citation is wrong, send the relevant epic agent back to fix it.

- [ ] **Step 4: Commit**

```bash
git add docs/audit/findings/epic-*.md
git commit -m "audit: per-epic static conformance findings (epics 00-12)"
```

---

## Task 4: Runtime verification of critical flows

**Files:**
- Create: `docs/audit/findings/runtime.md`
- Read-only: `docs/audit/runtime-infra.md`

**Interfaces:**
- Consumes: feasibility table from `docs/audit/runtime-infra.md`.
- Produces: `docs/audit/findings/runtime.md` — runtime evidence that upgrades the `Úroveň` of the 5 critical flows in the synthesis.

- [ ] **Step 1: Auth flow**

If infra allows (per Task 2): exercise signup → email verify → login → session → logout → password reset, using `E2E_TEST_MODE`/test routes where available. Otherwise mark `neověřeno-runtime` with reason. Record outcome per sub-flow.

Run (when DB+test mode available):
```bash
npm run build >/dev/null 2>&1 && echo build-ok
npx playwright test e2e/happy-path.spec.ts 2>&1 | tail -20
```

- [ ] **Step 2: Stripe payments flow**

Verify checkout session creation, webhook handler idempotence + grace period, subscription state, trial expiry (`src/app/api/webhooks/stripe`, `src/lib/subscription.ts`, `src/lib/trial-expiry.ts`, `src/app/api/cron/expire-trials`). Use Stripe test keys if present; else `neověřeno-runtime`.

- [ ] **Step 3: Splits confirmation flow**

Verify draft → submit → confirm/reject → supersede (`src/app/api/projects/[id]/splits/**`, `src/app/api/splits/confirmations/**`, `src/lib`). Drive via test routes/API if DB available; else `neověřeno-runtime`.

- [ ] **Step 4: RBAC enforcement**

For the Role Lifecycle rules: attempt an action through a role that must NOT have the right and confirm the **server** (not just UI) rejects it (`src/lib/rbac.ts` + the guarded routes). This is the highest-value runtime check — do at least 3 negative cases. Record each as `RBAC-NN | spuštěno | pass/fail`.

- [ ] **Step 5: File access control**

Verify presigned upload/download URLs and that a non-member cannot fetch another project's file (`src/app/api/projects/[id]/files/**`, `src/lib/s3.ts`).

- [ ] **Step 6: Write runtime findings**

Write `docs/audit/findings/runtime.md`: table `ID/Flow | Sub-flow | Výsledek (pass/fail/neověřeno-runtime) | Důkaz (příkaz/odpověď/soubor:řádek) | Poznámka`.

- [ ] **Step 7: Commit**

```bash
git add docs/audit/findings/runtime.md
git commit -m "audit: runtime verification of critical flows"
```

---

## Task 5: Cross-cutting passes (security / RBAC / decisions)

> **Execution note:** Dispatch 3 independent subagents (one per sub-pass). Each is read-only.

**Files:**
- Create: `docs/audit/findings/security.md`, `docs/audit/findings/rbac.md`, `docs/audit/findings/decisions.md`

**Interfaces:**
- Consumes: `SEC-NN`, `RBAC-NN`, `DEC-NN` IDs from the requirement index; RBAC also consumes Task 4 Step 4 results.
- Produces: three cross-cutting findings files.

- [ ] **Step 1: Security pass (Red Team Matrix)**

Subagent prompt: "Read-only. For every `SEC-NN` in `docs/audit/requirement-index.md` (sourced from `Red_Team_Matrix_MUSICCOLLABHUB.md`), determine whether the codebase mitigates the scenario. Cite `soubor:řádek`. Output `docs/audit/findings/security.md` in the shared finding-row format." Cover authz bypass, IDOR on project/file/split resources, webhook signature verification, input validation, secret handling.

- [ ] **Step 2: RBAC pass (Role Lifecycle Tables)**

Subagent prompt: "Read-only. For every `RBAC-NN` (sourced from `Role_Lifecycle_Tables_MUSICCOLLABHUB.md`), confirm `src/lib/rbac.ts` and the route guards enforce the rule server-side. Fold in the runtime results from `docs/audit/findings/runtime.md` (Task 4 Step 4). Output `docs/audit/findings/rbac.md`."

- [ ] **Step 3: Decisions pass (Decision Log)**

Subagent prompt: "Read-only. For every `DEC-NN` (sourced from `Decision_Log_MUSICCOLLABHUB.md`), determine whether the code honors the decision; flag any ⚠️ where code contradicts a logged decision. Output `docs/audit/findings/decisions.md`."

- [ ] **Step 4: Verify**

```bash
ls docs/audit/findings/{security,rbac,decisions}.md
grep -LE '✅|🟡|❌|⚠️' docs/audit/findings/{security,rbac,decisions}.md || echo "all have statuses"
```
Expected: 3 files, all with statuses.

- [ ] **Step 5: Commit**

```bash
git add docs/audit/findings/security.md docs/audit/findings/rbac.md docs/audit/findings/decisions.md
git commit -m "audit: cross-cutting passes (security, RBAC, decisions)"
```

---

## Task 6: Synthesize the conformance report

**Files:**
- Create: `docs/audit/PRD_Conformance_Audit_2026-06-28.md`
- Read-only: all `docs/audit/findings/*.md`, `docs/audit/requirement-index.md`

**Interfaces:**
- Consumes: every findings file.
- Produces: the single report; its tables carry an `Issue#` column that Task 7 fills.

- [ ] **Step 1: Assemble report body**

Reorganize findings into the report structure (spec §5.1):
- Sections §8.1–8.6 (pull rows from the relevant epic findings),
- Section §13 Acceptance Criteria,
- Cross-cutting: Security, RBAC, Decisions.
Each section = the shared finding-row table. Keep IDs so rows are traceable to the index.

- [ ] **Step 2: Write executive summary**

At the top: a status-count matrix per epic (✅/🟡/❌/⚠️ counts), the **launch-blocking gaps** (MVP epics 00–09 only, status ❌/🟡/⚠️ on launch-critical requirements), and the top security/RBAC risks.

Generate the counts:
```bash
for f in docs/audit/findings/epic-*.md; do
  printf "%s ✅%s 🟡%s ❌%s ⚠️%s\n" "$(basename "$f")" \
    "$(grep -c '✅' "$f")" "$(grep -c '🟡' "$f")" "$(grep -c '❌' "$f")" "$(grep -c '⚠️' "$f")"
done
```

- [ ] **Step 3: Verify every index requirement appears in the report**

```bash
# Each requirement ID from the index must appear in the report
comm -23 \
  <(grep -oE '(R-8\.[0-9]+-[0-9]+|AC-[0-9]+|SEC-[0-9]+|RBAC-[0-9]+|DEC-[0-9]+)' docs/audit/requirement-index.md | sort -u) \
  <(grep -oE '(R-8\.[0-9]+-[0-9]+|AC-[0-9]+|SEC-[0-9]+|RBAC-[0-9]+|DEC-[0-9]+)' docs/audit/PRD_Conformance_Audit_2026-06-28.md | sort -u)
```
Expected: empty output (no requirement missing from the report). Any ID printed = a gap to fill before continuing.

- [ ] **Step 4: Commit**

```bash
git add docs/audit/PRD_Conformance_Audit_2026-06-28.md
git commit -m "audit: synthesized PRD conformance report"
```

---

## Task 7: Create / link GitHub issues (deduplicated)

**Files:**
- Modify: `docs/audit/PRD_Conformance_Audit_2026-06-28.md` (fill `Issue#` column)

**Interfaces:**
- Consumes: report rows with status ❌/🟡/⚠️.
- Produces: GitHub issues (or links to existing) and a back-filled report.

- [ ] **Step 1: Snapshot existing issues for dedup**

```bash
gh issue list --state all --limit 300 --json number,title,state \
  > docs/audit/.existing-issues.json
```

- [ ] **Step 2: For each actionable finding, dedup then create-or-link**

For every report row with ❌/🟡/⚠️:
1. Search `.existing-issues.json` for a title matching the same requirement/epic. If found → record that number in the row's `Issue#`, do NOT create a new issue.
2. If none → create:
```bash
gh issue create \
  --title "[epic-XX] <stručný popis mezery>" \
  --label "epic-XX,<bug|feature|task>,<p0|p1|p2|p3>" \
  --body "Zdroj: <PRD §/podpůrný doc> (ID <REQ-ID>). Důkaz: <soubor:řádek>. Mezera: <popis>. Navrhovaný fix / akceptační kritérium: <…>. Z auditu: docs/audit/PRD_Conformance_Audit_2026-06-28.md"
```
Label mapping: `bug` = ⚠️ odchylka/defekt, `feature` = ❌ chybí funkce, `task` = 🟡 dotažení. Priority: launch-blocking MVP gap → `p0`/`p1`, jinak `p2`/`p3`. Record the new number in the row.

- [ ] **Step 3: Update the umbrella tracking issue**

```bash
gh issue comment 114 --body "Audit dokončen — report: docs/audit/PRD_Conformance_Audit_2026-06-28.md. Založené/propojené issues viz appendix reportu."
```

- [ ] **Step 4: Verify no actionable row is left without an issue**

```bash
# rows with a gap status but empty Issue# (—) should be zero
grep -E '❌|🟡|⚠️' docs/audit/PRD_Conformance_Audit_2026-06-28.md | grep -E '\| *— *\|$' && echo "UNRESOLVED ROWS ^" || echo "all actionable rows linked"
```
Expected: "all actionable rows linked".

- [ ] **Step 5: Commit**

```bash
rm -f docs/audit/.existing-issues.json
git add docs/audit/PRD_Conformance_Audit_2026-06-28.md
git commit -m "audit: link findings to GitHub issues"
```

---

## Task 8: Final acceptance check + push

**Files:** none created; verification + push only.

- [ ] **Step 1: Check acceptance criteria (spec §7)**

Confirm each:
```bash
test -f docs/audit/PRD_Conformance_Audit_2026-06-28.md && echo "report exists"
# §8.1–8.6 + §13 + 3 cross-cutting sections present
grep -cE '^##+ ' docs/audit/PRD_Conformance_Audit_2026-06-28.md
# no requirement missing (re-run Task 6 Step 3 comm) -> expect empty
```
Manually confirm: every §8/§13 requirement has a status; critical flows show `spuštěno` or justified `neověřeno-runtime`; exec summary lists launch-blocking gaps.

- [ ] **Step 2: Push**

```bash
git pull --rebase
git push
git status   # expect: up to date with origin
```

- [ ] **Step 3: Report handoff**

Summarize for the user: status counts per epic, the launch-blocking gaps, top security/RBAC risks, count of issues created vs linked. State that Fáze 2 (konsolidace) can now be planned from the new issue backlog.

---

## Self-Review (run by planner before handoff)

- **Spec coverage:** §2 záběr → Tasks 1,3; §3 metodika → Tasks 3 (static) + 4 (runtime); §4 provádění → Tasks 3,4,5; §5 výstupy → Tasks 6 (report) + 7 (issues, dedup); §6 rizika → Task 2 (infra) + level column; §7 akceptační kritéria → Task 8. All covered.
- **Placeholder scan:** angle-bracket `<…>` tokens in Task 7 are intentional per-finding fill-ins (the finding text differs per row), not plan placeholders; every step has concrete commands/format.
- **Type/name consistency:** filenames consistent — `docs/audit/requirement-index.md`, `docs/audit/findings/epic-XX.md`, `…/runtime.md`, `…/security.md`, `…/rbac.md`, `…/decisions.md`, report `docs/audit/PRD_Conformance_Audit_2026-06-28.md`. ID scheme identical across Tasks 1, 3, 5, 6.
