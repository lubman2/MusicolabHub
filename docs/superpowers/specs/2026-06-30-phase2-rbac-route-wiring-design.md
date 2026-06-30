# Fáze 2 (p1) — RBAC route-wiring (#141 + #142) (Design / Spec)

**Datum:** 2026-06-30
**Stav:** návrh ke schválení
**Navazuje na:** p0 konsolidace (PR #154) — `can()`, `authorizeProjectPermission`, admin override.

---

## 0. Kontext

Audit (#141, #142) zjistil dva rozcházející se vzory autorizace v projektových routách:
- **5 rout** (comments, activity) volá `authorizeProjectMember(roles[])` s ad-hoc role listy.
- **12+ rout** (files, versions, projects/[id], splits, invitations) dělá **inline
  `isOwner || isEditor`** → obchází helper úplně → žádný admin override (**#142**) a špatné
  role-sety (**#141**, files vrací 403 commenterovi/viewerovi).

p0 už postavil základ: `PERMISSIONS` matice + `can()` v `src/lib/rbac.ts` a
`authorizeProjectPermission(userId, projectId, permission)` v `src/lib/auth.ts` (owner +
global-admin override vestavěn). Zbývá **přepojit routy** na tento jediný mechanismus.

---

## 1. Cíl

Sjednotit veškerou projektovou autorizaci na matici-řízený
`authorizeProjectPermission` — čímž se opraví viewer/commenter přístup k souborům (#141) a
admin override získá napříč všemi projektovými routami (#142). Matice zůstává jediným
zdrojem pravdy, věrně zrcadlícím `Role_Lifecycle_Tables §1`.

---

## 2. Globální omezení

- `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test:unit` zelené po každém tasku.
- Žádné nesouvisející refaktory; měnit jen autorizační kontrolu, ne business logiku rout.
- Role-sety výhradně z `Role_Lifecycle_Tables §1` (capability tabulka) + lifecycle pravidel.

---

## 3. Rozšíření matice (`src/lib/rbac.ts`)

Capability tabulka (`Role_Lifecycle_Tables §1`) má 14 customer-facing capabilit; matice je
už zrcadlí. Doplnit **2 klíče** pro akce bez 1:1 řádku, role-sety odvozené z tabulky +
lifecycle:

```ts
create_version: ["owner", "editor"],        // draft = editor akce (jako upload/publish)
manage_project_lifecycle: ["owner"],        // archive/restore/delete — "archive is owner action" (§3)
```

Mazání souboru i verze → **reuse `delete_published: ["owner"]`** ("Delete published
file/version"). Žádné další nové klíče.

`can()` test (`src/lib/rbac.test.ts`) rozšířit o nové klíče (owner→create_version true,
editor→create_version true, commenter→create_version false, editor→manage_project_lifecycle
false, owner→manage_project_lifecycle true).

---

## 4. Záběr přepojení — routy pod `src/app/api/projects/[id]/**`

Přepojit na `authorizeProjectPermission` všechny projektové-membership routy:

| Route (metoda) | Permission |
|----------------|-----------|
| `[id]/route.ts` GET | `view_project` |
| `[id]/route.ts` PATCH | `edit_project_metadata` |
| `[id]/route.ts` DELETE | `manage_project_lifecycle` |
| `[id]/archive/route.ts` POST | `manage_project_lifecycle` |
| `[id]/restore/route.ts` POST | `manage_project_lifecycle` |
| `[id]/files/route.ts` GET | `download_files` |
| `[id]/files/[fileId]/route.ts` GET | `download_files` |
| `[id]/files/[fileId]/route.ts` DELETE | `delete_published` |
| `[id]/files/upload-url/route.ts` POST | `upload_files` |
| `[id]/files/confirm/route.ts` POST | `upload_files` |
| `[id]/versions/route.ts` GET | `view_project` |
| `[id]/versions/route.ts` POST | `create_version` |
| `[id]/versions/[versionId]/route.ts` GET | `view_project` |
| `[id]/versions/[versionId]/route.ts` PATCH (publish) | `publish_version` |
| `[id]/versions/[versionId]/route.ts` DELETE | `delete_published` |
| `[id]/versions/[versionId]/files/route.ts` POST | `create_version` |
| `[id]/comments/route.ts` GET | `view_project` |
| `[id]/comments/route.ts` POST | `add_comment` |
| `[id]/comments/[threadId]/replies/route.ts` POST | `add_comment` |
| `[id]/comments/[threadId]/resolve/route.ts` POST | `moderate_comments` |
| `[id]/comments/[threadId]/comments/[commentId]/route.ts` DELETE (own) | `delete_own_comment` |
| `[id]/activity/route.ts` GET | `view_project` |
| `[id]/invitations/route.ts` (create/list) | `invite_collaborator` |
| `[id]/invitations/[invId]/route.ts` (revoke) | `invite_collaborator` |
| `[id]/splits/**` (view) | `view_split` |
| `[id]/splits/**` (create/edit/submit) | `manage_split` |

**Pravidlo vzoru přepojení:** nahradit blok inline kontroly / `authorizeProjectMember(...)`
voláním:
```ts
const authed = await authorizeProjectPermission(userId, projectId, "<permission>");
if (!authed) return forbidden();   // nebo NextResponse 403, dle stávajícího vzoru route
```
`userId` se bere ze session (stávající `getCurrentUser`/`getAuthUser`/`getUserId`), `projectId`
z params. Zachovat stávající 401/404/403 sémantiku route (jen autorizační rozhodnutí jde přes helper).

### Jemnost: comment delete (own vs moderate)
`comments/[threadId]/comments/[commentId]` DELETE povoluje (a) autora vlastního komentáře
(`delete_own_comment`) NEBO (b) moderátora (`moderate_comments`). Zachovat tuto dvojitou
podmínku: `authorizeProjectPermission(..., "delete_own_comment") && isAuthor` **nebo**
`authorizeProjectPermission(..., "moderate_comments")`.

---

## 5. Mimo záběr (explicitně)

- **Gig sub-routy** `src/app/api/projects/[id]/gigs/**` a marketplace routy (`gigs/`,
  `applications/`, `hires/`, `connect/`, `admin/`) — jiná authz doména (gig/admin ownership),
  Stream 2. Neměnit.
- Session/auth mechanika (`getCurrentUser`, `withAuth`, JWT) beze změny.
- Doplňování chybějících flow (#138 verify-email, #139 invitation accept, member-management
  endpointy) — jiné issues.

---

## 6. Ověření

- **Unit:** `src/lib/rbac.test.ts` rozšířen o nové permissiony; `npm run test:unit` zelené.
- **Statika:** `typecheck` + `lint` + `build` zelené; `grep -rn "isOwner\|isEditor" src/app/api/projects` ukáže jen místa mimo authz (žádná autorizační inline kontrola nezůstane).
- **Integrační spot-check** (efemérní Docker Postgres, jako v p0): seed owner + viewer + admin;
  - viewer **GET** `/files` a `/files/[fileId]` → **200** (dříve 403) = #141,
  - admin (bez membership) na `PATCH /projects/[id]` → **ne-403** = #142,
  - viewer **POST** `/files/upload-url` → **403** (negativní kontrola: matice drží).
- **CI gate** na PR (quality + migrate-build) zelený; doručit přes PR do master.

---

## 7. Akceptační kritéria

- [ ] Matice rozšířena o `create_version`, `manage_project_lifecycle`; `delete_published` reuse.
- [ ] Všechny routy z §4 autorizují přes `authorizeProjectPermission` (žádná inline `isOwner||isEditor` autorizace v projektových routách mimo §5).
- [ ] `can()` testy pro nové klíče procházejí.
- [ ] Integrační spot-check: viewer čte soubory, admin override funguje, viewer nemá upload.
- [ ] `build`/`lint`/`typecheck`/`test:unit` zelené; CI gate na PR zelený.
- [ ] #141 a #142 uzavřeny (Closes v PR).
