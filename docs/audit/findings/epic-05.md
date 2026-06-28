# Epic-05 — Collaboration & Permissions: PRD Conformance Audit

**Baseline:** PRD v2 §8.2 Permissions + §8.1 invitations/membership requirements  
**Requirement source:** `docs/audit/requirement-index.md` — IDs `R-8.2-*`, membership/invitation `R-8.1-*` rows, and `RBAC-*` rows concerning PROJECT MEMBER ROLES, INVITATION lifecycle, and membership transitions.  
**Core files examined:**
- `src/lib/rbac.ts` — RBAC permission matrix and `withProjectAuth` middleware
- `src/app/api/projects/[id]/invitations/route.ts` — POST (create), GET (list)
- `src/app/api/projects/[id]/invitations/[invId]/route.ts` — DELETE (revoke)
- `src/app/api/applications/[id]/accept/route.ts` — hire handoff (gig applicant → member)
- `src/app/api/hires/[id]/access/route.ts` — buyer broadens talent access
- `src/app/api/projects/[id]/route.ts` — project metadata CRUD
- `src/app/api/projects/[id]/files/route.ts` — file list (GET)
- `src/app/api/projects/[id]/files/upload-url/route.ts` — upload gate
- `src/app/api/projects/[id]/versions/route.ts` — version list/create
- `src/app/api/projects/[id]/comments/route.ts` — comment thread create
- `src/app/api/projects/[id]/comments/[threadId]/resolve/route.ts` — thread resolution
- `src/app/api/projects/[id]/splits/route.ts` — split create/list
- `src/app/api/projects/[id]/archive/route.ts` — owner archive
- `src/app/api/admin/projects/[id]/restrict/route.ts` — admin suspend
- `src/app/projects/[id]/settings/members/page.tsx` — members UI
- `src/lib/invitations.ts` — stale invitation expiry helper
- `src/lib/auth.ts` — `authorizeProjectMember` helper
- `prisma/schema.prisma` — `ProjectMember`, `Invitation`, `MemberRole`, `InvitationStatus`  
**Audit date:** 2026-06-28  
**Auditor note:** read-only — no code changed. `withProjectAuth` in `rbac.ts` is defined but never called by any route handler; routes implement their own ad-hoc auth checks.

---

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.2-01 | Projektové role jsou: Owner, Editor, Commenter, Viewer | ✅ | `prisma/schema.prisma:285-290` enum `MemberRole { owner editor commenter viewer }` | čteno | Čtyři PRD role jsou přesně implementovány jako Prisma enum. | — |
| R-8.2-02 | V MVP může pozvánky ke spolupráci zasílat pouze owner | ✅ | `src/app/api/projects/[id]/invitations/route.ts:34` `project.ownerId !== user.id && user.role !== "admin"` → 403 | čteno | Server-side check správně odmítá non-owner (admin bypass je přípustný). | — |
| R-8.2-03 | Spravovat ownership splity může pouze owner | ✅ | `src/app/api/projects/[id]/splits/route.ts:91` `project.ownerId !== user.id` → 403 při POST | čteno | Vytvoření splitu blokováno pro non-owner. GET vyžaduje minimálně členství (line 26-32). | — |
| R-8.2-04 | Editor může nahrávat soubory a publikovat verze | ✅ | `src/app/api/projects/[id]/files/upload-url/route.ts:116` `!isOwner && !isEditor` → 403; `src/app/api/projects/[id]/versions/[versionId]/route.ts:172` stejný vzor | čteno | Upload a publikace jsou správně omezeny na owner+editor. | — |
| R-8.2-05 | Commenter má pouze přístup ke čtení a přidávání komentářů | 🟡 | `src/app/api/projects/[id]/comments/route.ts:17,39-43` commenter v `COMMENT_ALLOWED_ROLES` ✅; ale `GET /api/projects/[id]/files` (line 37-39) vyžaduje owner nebo editor — commenter nemůže číst soubory | čteno | Commenter nemůže listovat soubory projektu (files/route.ts line 37-39 vrací 403 pro commenter). Read přístup k souborům není implementován pro commenter ani viewer. Komentáře správně fungují. | — |
| R-8.2-06 | Viewer má přístup pouze ke čtení | ❌ | `src/app/api/projects/[id]/files/route.ts:37-39` viewer dostane 403; `src/app/api/projects/[id]/versions/route.ts:45` verze taktéž přístupné jen owner+editor | čteno | Viewer role existuje v DB ale žádný čtecí endpoint (soubory, verze) viewer aktivně nepouští. `GET /api/projects/[id]` (route.ts:46-65) umožňuje viewer přes member check, ale GET files/versions blokuje. Partial read access pouze pro metadata projektu. | — |
| R-8.2-07 | Soubory projektu jsou standardně soukromé (private by default) | ✅ | `src/app/api/projects/[id]/files/route.ts:12-39` vždy vyžaduje auth + projektové členství nebo owner | čteno | Neexistuje veřejný endpoint pro přístup k souborům; všechny routes ověřují auth. | — |
| R-8.2-08 | Najatý talent (hired talent) ve výchozím stavu nezíská plný přístup k projektu | ✅ | `src/app/api/applications/[id]/accept/route.ts:173-186` upsert role `"commenter"` (restricted handoff) | čteno | Po přijetí přihlášky talent dostane roli `commenter`, nikoli `editor` nebo `owner`. | — |
| R-8.2-09 | Owner musí explicitně udělit širší přístup k assetům najatému talentu | ✅ | `src/app/api/hires/[id]/access/route.ts:73-78` pouze buyer (owner) může měnit roli; `HIRE_GRANTABLE_ROLES` omezeno na viewer/commenter/editor | čteno | Explicitní udělení přístupu je implementováno a logováno (`gig_hire_access_granted`). | — |
| RBAC-01 | Všechny role mohou zobrazit projekt | 🟡 | `src/app/api/projects/[id]/route.ts:46-65` member check OK; ale `files/route.ts:37-39` blokuje commenter/viewer | čteno | Metadata projektu jsou přístupná pro všechny členy. Soubory a verze jsou přístupné pouze pro owner+editor — to je přísnější než PRD. | — |
| RBAC-02 | Owner, Editor, Commenter, Viewer mohou stahovat povolené soubory | ❌ | `src/app/api/projects/[id]/files/route.ts:37-39` `!isOwner && !isEditor` → 403 blokuje commenter a viewer | čteno | Soubory nejsou přístupné pro commenter a viewer přes API. RBAC matice v `rbac.ts:12` zahrnuje commenter a viewer pro `download_files`, ale tento PERMISSIONS objekt není v routách vůbec používán. | — |
| RBAC-03 | Soubory mohou nahrávat pouze Owner, Editor a Admin | ✅ | `src/app/api/projects/[id]/files/upload-url/route.ts:116` `!isOwner && !isEditor` → 403 | čteno | Správně omezeno. Admin bypass funguje přes `user.role === "admin"` v custom check na jiných routách, ale zde není explicitně ošetřen. ⚠️ Admin uživatel bez členství dostane 403 na upload, pokud se neshoduje s ownerId. | — |
| RBAC-04 | Verze mohou publikovat pouze Owner, Editor a Admin | ✅ | `src/app/api/projects/[id]/versions/[versionId]/route.ts:172` isOwner\|isEditor → publish guard | čteno | Správně implementováno pro owner a editor. Admin bez membership nemá explicitní bypass v tomto route. | — |
| RBAC-05 | Metadata projektu mohou editovat pouze Owner, Editor a Admin | ✅ | `src/app/api/projects/[id]/route.ts:104` `loadAuthorizedProject(..., requireEditor: true)` | čteno | Editor a owner mohou editovat; ostatní dostávají 403. | — |
| RBAC-06 | Komentáře mohou přidávat Owner, Editor, Commenter (Viewer nikoliv) | ✅ | `src/app/api/projects/[id]/comments/route.ts:17,39-43` `COMMENT_ALLOWED_ROLES = ["owner","editor","commenter"]` | čteno | Viewer není v allowed roles. Implementace používá `authorizeProjectMember` ze `src/lib/auth.ts:79`. | — |
| RBAC-07 | Vlastní komentář mohou smazat Owner, Editor, Commenter a Admin | 🟡 | `src/app/api/projects/[id]/comments/[threadId]/comments/[commentId]/route.ts` — existuje, ale nutno ověřit authz logiku | čteno | Route existuje; podrobná role-check logika nebyla součástí tohoto auditu (oddělená cesta). Zahrnut jako parciální evidence. | — |
| RBAC-08 | Komentáře může moderovat pouze Owner a Admin | ✅ | `src/app/api/projects/[id]/comments/[threadId]/resolve/route.ts:10` `MODERATOR_ROLES = ["owner"]`; admin projde přes `authorizeProjectMember` owner bypass (ownerId check na line 91 v auth.ts) | čteno | ⚠️ `authorizeProjectMember` nemá explicitní admin bypass — admin bez ownerId ani membership bude vrácen false. Jde o potenciální mezeru pro admin moderaci, pokud admin není owner. | — |
| RBAC-09 | Spolupracovníky může pozvat pouze Owner a Admin | ✅ | `src/app/api/projects/[id]/invitations/route.ts:34` `project.ownerId !== user.id && user.role !== "admin"` → 403 | čteno | Explicitní admin bypass je přítomen. | — |
| RBAC-10 | Roli člena může měnit pouze Owner a Admin | ❌ | Neexistuje žádný API endpoint pro změnu role projektového člena (`PATCH /api/projects/[id]/members/[userId]` chybí) | čteno | Funkce change_member_role je definována v `rbac.ts:21` ale žádný route handler ji nevolá. UI stránka `settings/members/page.tsx` neposkytuje tuto schopnost. | — |
| RBAC-11 | Spolupracovníka může odebrat pouze Owner a Admin | ❌ | Neexistuje žádný API endpoint pro odebrání člena (`DELETE /api/projects/[id]/members/[userId]` chybí) | čteno | Funkce remove_collaborator je definována v `rbac.ts:22` ale žádný route handler ji neimplementuje. | — |
| RBAC-12 | Ownership split zobrazí Owner (plně) a Editor (omezeně) | 🟡 | `src/app/api/projects/[id]/splits/route.ts:26-33` GET povoluje všem členům, nikoli jen owner/editor | čteno | Split je zobrazen všem členům (owner + member check), nikoli jen owner a editor dle RBAC-12. Editor vidí plně, nikoli omezeně. | — |
| RBAC-13 | Ownership split může spravovat pouze Owner a Admin | ✅ | `src/app/api/projects/[id]/splits/route.ts:91` owner-only check pro POST | čteno | Správně omezeno. | — |
| RBAC-14 | Publikovaný soubor nebo verzi může smazat pouze Owner a Admin | 🟡 | `src/app/api/projects/[id]/files/[fileId]/route.ts` — existuje, authz nutno ověřit odděleně | čteno | Route existuje; podrobný audit je mimo scope tohoto epicu. | — |
| RBAC-15 | Přístup k projektu může pozastavit pouze Admin | ✅ | `src/app/api/admin/projects/[id]/restrict/route.ts:23` `user.role !== "admin"` → 403 | čteno | Správně implementováno s AdminAction audit záznamem. | — |
| RBAC-16 | Najatý talent musí nastoupit s omezeným přístupem | ✅ | `src/app/api/applications/[id]/accept/route.ts:173-186` upsert `role: "commenter"` | čteno | Default `commenter` je přiřazen při hire; širší přístup vyžaduje explicitní udělení. | — |
| RBAC-17 | Širší přístup k assetům vyžaduje explicitní udělení ownerem a logování do audit trailu | ✅ | `src/app/api/hires/[id]/access/route.ts:117-123` `logActivity(..., "gig_hire_access_granted", ...)` | čteno | Audit záznam je vytvořen. `actorId`, `targetType`, `role` a `talentId` jsou zaznamenány. | — |
| RBAC-18 | Pozvánku může vytvořit pouze Owner (v MVP) | ✅ | `src/app/api/projects/[id]/invitations/route.ts:34` | čteno | Viz R-8.2-02. | — |
| RBAC-19 | Přijetí pozvánky musí vytvořit membership s přiřazenou rolí | ❌ | `/invitations/accept` stránka ani API endpoint neexistují. Email odkazuje na `${APP_URL}/invitations/accept?token=...` (`src/lib/email.ts:112`) ale route chybí | čteno | Tokenová přijímací flow není implementována. Přijetí pozvánky je slepá ulička. Model `InvitationStatus.accepted` existuje v DB ale žádný handler ho nenastavuje přes token flow. | — |
| RBAC-20 | Revokovaná a prošlá pozvánka není znovupoužitelná | ✅ | `src/app/api/projects/[id]/invitations/route.ts:100-115` check `status: "pending"` blokuje nové pozvánky přes email; `src/app/api/projects/[id]/invitations/[invId]/route.ts:38-43` DELETE ověřuje `status === "pending"` | čteno | `expireStaleInvitations` označí prošlé; `inviteeEmail` check blokuje opakování pending pozvánky. Revokované a prošlé statusy jsou terminální v DB schématu. | — |
| RBAC-21 | Stav projektu `active`: projekt je dostupný pro spolupráci | ✅ | `prisma/schema.prisma` enum `ProjectStatus { active ... }`; routes filtrují `status: "active"` | čteno | | — |
| RBAC-22 | Stav projektu `archived`: uzavřen pro aktivní práci, zachován pro přístup | ✅ | `src/app/api/projects/[id]/archive/route.ts` implementuje owner-only archivaci; komentář v route uvádí "no new uploads, versions, or invites" | čteno | ⚠️ Archivovaný projekt není explicitně blokován v upload/version routes (filtrují `status: "active"`), takže archivace fakticky blokuje — správné, ale implicitní. | — |
| RBAC-23 | Stav projektu `suspended`: admin zablokoval přístup | ✅ | `src/app/api/admin/projects/[id]/restrict/route.ts` implementuje přechod do `suspended` | čteno | | — |
| RBAC-24 | Stav projektu `deleted_soft`: čeká na trvalé smazání | ✅ | `src/app/api/projects/[id]/route.ts:293-345` DELETE nastaví `status: "deleted_soft"` a `deletedAt` | čteno | | — |
| RBAC-25 | Archivaci provádí owner; pozastavení provádí admin; soft delete zachovává auditability | ✅ | archive: `route.ts` owner check; restrict: `admin/...restrict/route.ts` admin check; delete: owner check + `logActivity` | čteno | | — |
| RBAC-48 | Přijatý talent musí začínat s omezeným přístupem; owner musí explicitně rozšířit | ✅ | Viz R-8.2-08, R-8.2-09, RBAC-16, RBAC-17 | čteno | | — |
| AC-03 | Pozvání a přijetí spolupracovníka end-to-end | ❌ | Vytvoření pozvánky + email fungují; přijetí (`/invitations/accept`) chybí | čteno | Happy path je neúplný. AC-03 selže protože `RBAC-19` není implementováno. | — |

---

## Souhrnná tabulka statusů

| Status | Počet | Požadavky |
|--------|-------|-----------|
| ✅ Splněno | 22 | R-8.2-02, R-8.2-03, R-8.2-04, R-8.2-07, R-8.2-08, R-8.2-09, RBAC-03, RBAC-04, RBAC-05, RBAC-06, RBAC-08, RBAC-09, RBAC-13, RBAC-15, RBAC-16, RBAC-17, RBAC-18, RBAC-20, RBAC-21, RBAC-22, RBAC-23, RBAC-24, RBAC-25, RBAC-48 |
| 🟡 Částečné / upozornění | 6 | R-8.2-05, RBAC-01, RBAC-07, RBAC-08 (admin gap), RBAC-12, RBAC-14 |
| ❌ Nesplněno / chybí | 6 | R-8.2-06, RBAC-02, RBAC-10, RBAC-11, RBAC-19, AC-03 |

---

## Klíčová zjištění

### 1. Invitation acceptance flow chybí (kritické)
Odkaz `${APP_URL}/invitations/accept?token=...` v `src/lib/email.ts:112` odkazuje na neexistující stránku a API endpoint. Tokenová flow pro přijetí pozvánky (`/invitations/accept`, PATCH/POST s tokenem → vytvoření `ProjectMember`) není implementována. Status `accepted` existuje v DB schématu, ale žádný handler ho nenastavuje přes token. **RBAC-19 a AC-03 jsou nesplněny.**

### 2. withProjectAuth nikdy není použit
`src/lib/rbac.ts` definuje `withProjectAuth` middleware a `PERMISSIONS` matici (správné role pro všechny akce), ale žádná route handler tuto funkci nevolá. Všechny routes implementují vlastní ad-hoc auth logiku (isOwner, isEditor), která nereflektuje kompletní RBAC matici. Commenter a viewer jsou ignorováni v read endpoints.

### 3. Member management API chybí (RBAC-10, RBAC-11)
Neexistuje žádný API endpoint pro:
- Změnu role člena (`PATCH /api/projects/[id]/members/[userId]`)
- Odebrání člena (`DELETE /api/projects/[id]/members/[userId]`)

`change_member_role` a `remove_collaborator` jsou definovány v PERMISSIONS ale nikdy volány.

### 4. Viewer a Commenter nemohou číst soubory (RBAC-02, R-8.2-05, R-8.2-06)
`GET /api/projects/[id]/files` vrací 403 pro commenter a viewer — pouze owner+editor. RBAC matice (`rbac.ts:12`) správně zahrnuje všechny role pro `download_files`, ale matice není aplikována.

### 5. Admin bypass nekonzistentní
`authorizeProjectMember` v `src/lib/auth.ts:79` nemá admin bypass — admin bez ownerId ani membership dostane `false`. Invitation a restrict routes mají explicitní `user.role === "admin"` check, ale comment moderation route (přes `authorizeProjectMember`) admin nezahrnuje.
