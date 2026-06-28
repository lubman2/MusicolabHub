# Epic 02 — Project Hub Core: PRD Conformance Audit

**Datum auditu:** 2026-06-28  
**Auditor:** Claude Code (read-only, žádné změny kódu)  
**Rozsah:** PRD §8.1 Project Hub — projekt CRUD, metadata, listing/dashboard, lifecycle (archive / restore / soft-delete)  
**Vyloučeno z tohoto epicu:** upload souborů (R-8.1-01..12), verzování (R-8.1-13..16), komentáře (R-8.1-17..19), real-time (R-8.1-20..21)

---

## Hlavní zdrojové soubory

- `src/app/api/projects/route.ts` — GET (listing) + POST (create)
- `src/app/api/projects/[id]/route.ts` — GET + PUT (metadata) + DELETE (soft-delete)
- `src/app/api/projects/[id]/archive/route.ts` — PUT (archive)
- `src/app/api/projects/[id]/restore/route.ts` — PUT (restore z archived → active)
- `src/app/api/admin/projects/[id]/restrict/route.ts` — POST (suspend)
- `src/app/api/admin/projects/[id]/restore/route.ts` — POST (restore z suspended → active)
- `prisma/schema.prisma` — model `Project`, enum `ProjectStatus`
- `src/app/projects/new/page.tsx` — UI pro vytvoření projektu
- `src/app/projects/[id]/page.tsx` — detail projektu
- `src/app/projects/[id]/settings/page.tsx` — editace metadat
- `src/app/dashboard/page.tsx` — listing / dashboard
- `src/lib/subscription.ts` — middleware `withActiveSubscription`

---

## Tabulka nálezů

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| AC-01 | Vytváření projektu musí fungovat end-to-end (happy path, edge case, failure state, auditability) | 🟡 | `src/app/api/projects/route.ts:184–211`, `src/app/projects/new/page.tsx:23–75` | čteno | Happy path a edge case validace (title min/max, description max, genre max) implementovány. `logActivity("project_created")` přítomno (řádek 206). Chybí: (1) **subscription gate** — POST nevyvolává `withActiveSubscription("write", ...)`, přestože `src/lib/subscription.ts` middleware existuje. Nový projekt lze vytvořit i při `past_due`/`expired`/`canceled` stavu předplatného. Failure state v API existuje (400/401), v UI (error state) existuje. Auditability přes activity log ano — ale jen project_created, bez subscription check. | — |
| RBAC-21 | Stav projektu `active`: projekt je dostupný pro spolupráci | ✅ | `prisma/schema.prisma:172–177`, `src/app/api/projects/route.ts:43` | čteno | `ProjectStatus` enum obsahuje `active`. Listing filtruje `status: "active"`. | — |
| RBAC-22 | Stav projektu `archived`: projekt je uzavřen pro aktivní práci, ale zachován pro přístup a historii | ✅ | `prisma/schema.prisma:174`, `src/app/api/projects/[id]/archive/route.ts:65–73` | čteno | Enum stav `archived` existuje. PUT archive transitions `active → archived`, loguje `project_archived`. Archived projekty vyloučeny z default listingu (baseWhere = `status: "active"`). | — |
| RBAC-23 | Stav projektu `suspended`: admin zablokoval přístup z důvodu zneužití, sporu nebo compliance | ✅ | `prisma/schema.prisma:175`, `src/app/api/admin/projects/[id]/restrict/route.ts:64` | čteno | Enum stav `suspended` existuje. Admin-only POST restrict → `status: "suspended"`, loguje `actionType: "restrict_project"`. | — |
| RBAC-24 | Stav projektu `deleted_soft`: projekt čeká na trvalé smazání v rámci retention okna | 🟡 | `prisma/schema.prisma:176`, `src/app/api/projects/[id]/route.ts:327–338` | čteno | DELETE nastavuje `status: "deleted_soft"` + `deletedAt: now()`. 30denní retention je zmíněna v komentáři kódu (řádek 288: "30 days (PRD) before a separate cleanup job purges them"), ale **cleanup job neexistuje** — žádný cron, worker ani API route pro purge soft-deleted projektů po 30 dnech nebyl nalezen. | — |
| RBAC-25 | Archivaci projektu provádí owner; pozastavení provádí admin; soft delete zachovává auditability | ✅ | `src/app/api/projects/[id]/archive/route.ts:37–39`, `src/app/api/admin/projects/[id]/restrict/route.ts:30–35`, `src/app/api/projects/[id]/route.ts:313–315` | čteno | Archive: ověřuje `ownerId === userId` (řádek 37). Restrict: admin-only (řádek 30). Soft-delete: `deletedAt` zachován, `logActivity("project_deleted")` voláno. | — |
| RBAC-05 | Metadata projektu mohou editovat pouze Owner, Editor a Admin | 🟡 | `src/app/api/projects/[id]/route.ts:57–63` | čteno | PUT `/api/projects/[id]` volá `loadAuthorizedProject(requireEditor: true)`, která povoluje `owner` nebo `editor`. Admin (role `admin`) však **není explicitně kontrolován** — prochází jako běžný user, takže admin bez project membership nezíská přístup. Střet s RBAC-05 který zahrnuje i Admin. | — |
| RBAC-25 (dashboard listing — archived) | Dashboard (listing) zobrazuje pouze aktivní projekty; archived a suspended skryty | 🟡 | `src/app/api/projects/route.ts:43` | čteno | `baseWhere = { status: "active", deletedAt: null }` — archived projekty **nelze přes dashboard procházet**. PRD §8.1 říká, že archived projekt "je zachován pro přístup a historii" (RBAC-22), ale listing endpoint nemá `filter=archived` možnost. Vlastník nemá způsob zobrazit vlastní archivované projekty v UI. | — |
| DEC-08 | Model předplatného je trial → placený pouze; vytváření/upload/publish vyžadují placený status | ❌ | `src/lib/subscription.ts:45–123`, `src/app/api/projects/route.ts:115–212` | čteno | `withActiveSubscription("write", ...)` middleware existuje a správně blokuje `past_due`/`expired` uživatele, ale **není aplikován na POST `/api/projects`**. Žádné volání `withActiveSubscription` nebylo nalezeno v žádném souboru pod `src/app/api/projects/`. PRD §8.4 + DEC-08 + RBAC-55: vytváření projektů musí být blokováno po uplynutí grace period — toto není vynucováno. | — |
| RBAC-55 | Subscription `past_due` může zachovat read přístup, ale blokuje nové vytváření | ❌ | `src/lib/subscription.ts:89–112`, `src/app/api/projects/route.ts:115` | čteno | Middleware správně implementuje pravidlo (řádky 89–112), ale POST `/api/projects` jej nepoužívá. Blokování vytváření projektů pro `past_due` uživatele po grace period fakticky nefunguje. | — |
| RBAC-56 | Po trialu musí uživatel přejít na placený plán pro zachování schopností vytváření/uploadu | ❌ | `src/lib/subscription.ts:114–123`, `src/app/api/projects/route.ts:115` | čteno | Stejná příčina jako RBAC-55/DEC-08: POST `/api/projects` nekontroluje stav předplatného. Expired/canceled uživatelé mohou vytvářet projekty. | — |
| AC-07 | Každá launch-critical schopnost musí mít pokrytý happy path | 🟡 | `src/app/api/projects/route.ts`, `src/app/projects/new/page.tsx` | čteno | Happy path vytvoření projektu funkční end-to-end (API + UI). Mezera: subscription enforcement chybí, viz výše. | — |
| AC-08 | Každá launch-critical schopnost musí mít pokryté edge case handling | 🟡 | `src/app/api/projects/route.ts:128–182` | čteno | Edge cases validace metadat (prázdný title, min/max délky, typ polí) implementovány. Chybí edge case: co se stane, když uživatel nemá předplatné (subscription gate není přiřazen). | — |
| AC-09 | Každá launch-critical schopnost musí mít pokryté failure state handling | 🟡 | `src/app/api/projects/route.ts:118–126`, `src/app/projects/new/page.tsx:58–68` | čteno | Failure states pro neplatný JSON, chybějící/neplatný title jsou pokryty. UI zobrazuje chybové stavy. Chybí: failure state pro nedostatečné předplatné. | — |
| AC-10 | Každá launch-critical schopnost musí být auditovatelná | ✅ | `src/app/api/projects/route.ts:206–209`, `src/app/api/projects/[id]/archive/route.ts:75–78`, `src/app/api/projects/[id]/restore/route.ts:61–64` | čteno | `logActivity` voláno při `project_created`, `project_archived`, `project_restored`, `project_deleted`. | — |

---

## Shrnutí

| Status | Počet |
|--------|-------|
| ✅ Splněno | 4 |
| 🟡 Částečně splněno | 7 |
| ❌ Nesplněno | 3 |
| **Celkem** | **14** |

### Kritické mezery

1. **Subscription gate pro vytvoření projektu chybí** (DEC-08, RBAC-55, RBAC-56): `withActiveSubscription("write", ...)` z `src/lib/subscription.ts` není aplikován na `POST /api/projects`. Uživatelé s `past_due` (po grace period), `canceled` nebo `expired` stavem mohou vytvářet projekty bez omezení.

2. **Cleanup job pro 30denní retention soft-deleted projektů neexistuje** (RBAC-24): Kód dokumentuje záměr ("a separate cleanup job purges them"), ale žádný cron, job ani API route pro fyzické smazání soft-deleted projektů po 30 dnech nebyl nalezen. Existuje pouze `src/app/api/cron/expire-trials/route.ts`, který se stará pouze o trial expirace.

3. **Archivované projekty nelze zobrazit v dashboardu** (RBAC-22): `GET /api/projects` filtruje pouze `status: "active"`, bez možnosti `filter=archived`. Owner nemá v UI způsob přístupu k vlastním archivovaným projektům.

4. **Admin bez project membership nemůže editovat metadata** (RBAC-05): `loadAuthorizedProject` neověřuje globální roli `admin`, pouze `ownerId` nebo `ProjectMember.role`.
