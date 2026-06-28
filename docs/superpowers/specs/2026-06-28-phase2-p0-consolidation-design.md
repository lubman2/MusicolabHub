# Fáze 2 (p0) — Konsolidace kritických nálezů (Design / Spec)

**Datum:** 2026-06-28
**Stav:** návrh ke schválení
**Navazuje na:** audit `docs/audit/PRD_Conformance_Audit_2026-06-28.md`

---

## 0. Kontext a zařazení

Toto je **první konsolidační průchod Fáze 2** z třífázového plánu (Audit → Konsolidace →
Launch-readiness). Audit založil backlog #134–#146. Tento spec řeší **jen tři p0
nálezy** — ostatní (p1/p2) jdou do dalších průchodů.

Rozsah (schváleno):
- **#135** — Prisma 7 migrate regrese (blokuje deploy/ops).
- **#134** — `billing/checkout` bez autentizace (IDOR na billing).
- **#136** — dva rozcházející se RBAC mechanismy; matice je mrtvý kód.

---

## 1. Cíl

Odblokovat DB migrace, uzavřít kritickou billing auth díru a sjednotit autorizaci na
jeden matici-řízený mechanismus s admin override — bez nesouvisejících refaktorů a se
zelenými `build`/`lint`.

---

## 2. Globální omezení

- `npm run build` i `npm run lint` musí zůstat zelené po každém tasku.
- Žádné nesouvisející refaktory; zachovat stávající vzory a strukturu rout.
- Runtime chování (Prisma klient) se nesmí rozbít — ověřit reálným dotazem.

---

## 3. #135 — Prisma 7 migrate fix

**Problém:** `prisma migrate`/`db push` padají (`P1012`): Prisma 7 nepodporuje
`datasource.url` ve schématu. URL je už v `prisma.config.ts`. Runtime klient funguje
(constructor `datasources` je tolerován), rozbité je jen CLI.

**Řešení:**
1. `prisma/schema.prisma` — odstranit řádek `url = env("DATABASE_URL")` z bloku
   `datasource db { ... }`. Ponechat `provider = "postgresql"`.
2. `src/lib/prisma.ts` — pokud `prisma generate`/runtime vyhodí deprecation/error na
   `datasources` constructor option pod Prisma 7, přepnout na
   `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })`. Pokud ne, ponechat
   beze změny.

**Akceptační kritéria:**
- `npx prisma migrate deploy` proti efemérní Docker Postgres proběhne bez `P1012`.
- Runtime dotaz (`prisma.user.findMany` přes test route nebo skript) vrátí data.
- `npm run build` + `npm run lint` zelené.

---

## 4. #134 — billing/checkout auth fix

**Problém:** `src/app/api/billing/checkout/route.ts` bere `userId` z těla requestu bez
ověření session → kdokoli manipuluje cizí billing. Sourozenecké routy (`billing/portal`,
`hires/[id]/checkout`) volají `getCurrentUser()` správně.

**Řešení:**
- Na začátku handleru volat `getCurrentUser(request)` (import z `@/lib/auth`).
- Když není uživatel → vrátit 401 (`unauthorized()`).
- `userId` odvodit z ověřeného uživatele; parametr `userId` z body **ignorovat** (smazat
  z body typu i validace).
- `plan` z body ponechat.

**Akceptační kritéria:**
- `POST /api/billing/checkout` bez session → **401** (nevytvoří se Stripe session ani
  Subscription řádek).
- S platnou session → checkout proběhne jen pro účet přihlášeného uživatele.
- Žádný regres: `plan` validace zůstává.

---

## 5. #136 — RBAC konsolidace (matice = zdroj pravdy)

**Problém:** dva mechanismy:
- `src/lib/rbac.ts`: `PERMISSIONS` matice + `withProjectAuth` — **mrtvý kód** (žádný
  caller; navíc psaný pro segment `[projectId]`, ale routy mají `[id]`).
- `src/lib/auth.ts`: `authorizeProjectMember` — **reálně používaný**, bez admin override,
  s ad-hoc role listy rozcházejícími se s maticí.

**Řešení:**
1. `src/lib/rbac.ts`:
   - Ponechat `PERMISSIONS` matici a typ `Permission`.
   - Přidat čistou funkci `can(role: MemberRole, permission: Permission): boolean`, která
     vrací `PERMISSIONS[permission].includes(role)`.
   - **Smazat** `withProjectAuth` a nepoužité typy (`AuthContext`, `AuthenticatedHandler`,
     `RouteContext`), které na něm visí, pokud je nic jiného nepoužívá.
2. `src/lib/auth.ts` — rozšířit `authorizeProjectMember`:
   - Přidat **admin override**: načíst i `user.role`; když `=== "admin"` → vrátit `true`
     (před membership lookupem). Signatura přijme buď `User`, nebo zůstane `userId` a
     dotáhne se role z DB — viz plán (zvolí se varianta, která nezmění existující call-sites
     destruktivně).
   - Umožnit autorizaci přes `Permission` klíč: nový přetížený/companion helper
     `authorizeProjectPermission(userId, projectId, permission: Permission)` který použije
     `can(member.role, permission)` (a owner/admin override). Stávající
     `authorizeProjectMember(userId, projectId, roles[])` zůstane funkční (zpětná
     kompatibilita), interně může delegovat.

**Záměrně MIMO záběr tohoto p0 průchodu:**
- Přepojení jednotlivých ~30 rout na nový helper.
- Oprava viewer/commenter 403 na souborech (#141) a admin bypass napříč routami (#142) —
  ty využijí tento základ v dalším průchodu.

**Akceptační kritéria:**
- `can()` vrací správně pro reprezentativní dvojice (owner→manage_split true, viewer→
  download_files true, viewer→upload_files false, commenter→moderate_comments false).
- `authorizeProjectMember` vrací `true` pro globálního admina bez membership.
- `withProjectAuth` a jeho mrtvé typy odstraněny; `grep` nenajde žádného callera.
- `npm run build` + `npm run lint` zelené (žádný dangling import).

---

## 6. Ověření (testing)

- **`can()`** — čistá funkce → unit test `src/lib/rbac.test.ts` spuštěný přes
  `node --test` s `tsx` loaderem (žádný nový framework; `tsx` je už dev dependency).
- **`authorizeProjectMember` admin override** — pokrýt v rámci integračního ověření nebo
  jednoduchým testem s mockem Prisma (preferováno integračně přes Docker Postgres, ať se
  netříští mockováním).
- **#134, #135** — integrační ověření proti **efemérní Docker Postgres** (port 5433,
  schéma z `prisma/migrations`): `migrate deploy`, runtime dotaz, a `curl` na
  `billing/checkout` bez/s session. Po ověření kontejner odstranit.
- Po každém tasku: `npm run build` + `npm run lint`.

---

## 7. Akceptační kritéria průchodu (kdy je p0 hotové)

- [ ] #135: migrate deploy projde, runtime OK, build/lint zelené.
- [ ] #134: bez session 401, se session jen vlastní účet.
- [ ] #136: `can()` test prochází, admin override funguje, mrtvý kód pryč, build/lint zelené.
- [ ] Issues #134, #135, #136 uzavřeny (commit „Closes #…"), report aktualizovat není nutné.
- [ ] Vše commitnuto a pushnuto na `master`.

---

## 8. Mimo záběr (explicitně)

- p1/p2 nálezy (#137–#146).
- Přepojení rout na nový RBAC helper (#141/#142).
- Zavádění vitest/jest nebo širší test infrastruktury.
- Doplňování chybějících flow/UI (verify-email, invitation accept, splits/versions UI).
