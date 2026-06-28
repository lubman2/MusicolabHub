# Epic 06 – Comments & Activity: PRD Conformance Audit

**Datum auditu:** 2026-06-28  
**Auditor:** Claude Code (read-only)  
**Základ:** PRD v2.1 §8.1 (Commenting model, Real-time model), requirement-index.md (`R-8.1-17` až `R-8.1-21`), `RBAC-06` až `RBAC-08`, `RBAC-31` až `RBAC-34`, plus notifikační události v `NotificationType` a `ActivityAction` schématu.

---

## Zkoumané soubory

| Soubor | Účel |
|--------|------|
| `prisma/schema.prisma` řádky 337–489 | Modely `CommentThread`, `Comment`, `ActivityLog`, `Notification` |
| `src/app/api/projects/[id]/comments/route.ts` | POST – vytvoření vlákna + prvního komentáře |
| `src/app/api/projects/[id]/comments/[threadId]/replies/route.ts` | POST – přidání odpovědi do vlákna |
| `src/app/api/projects/[id]/comments/[threadId]/resolve/route.ts` | PUT – označení vlákna jako vyřešeného |
| `src/app/api/projects/[id]/comments/[threadId]/comments/[commentId]/route.ts` | DELETE – soft-delete komentáře |
| `src/app/api/projects/[id]/activity/route.ts` | GET – aktivitní feed projektu |
| `src/app/api/notifications/route.ts` | GET – notifikace uživatele |
| `src/app/api/notifications/[id]/read/route.ts` | PUT – označení notifikace jako přečtené |
| `src/lib/activity-log.ts` | Helper `logActivity()` |
| `src/lib/notifications.ts` | Helpery `createNotification()`, `createNotifications()`, `getProjectAudience()` |
| `src/app/projects/[id]/activity/page.tsx` | UI stránka aktivitního feedu |
| `src/components/notification-bell.tsx` | UI notifikační zvonek (polling) |

---

## Výsledky auditu

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.1-17 | Komentáře jsou plain-text vlákna (comment threads) | ✅ | `schema.prisma:393–423` – modely `CommentThread` + `Comment` s polem `body String`; `comments/route.ts:86–121` – transakce vytváří vlákno a první komentář | čteno | Plně implementováno. | — |
| R-8.1-18 | Komentáře mohou cílit na projekt, soubor nebo verzi | ✅ | `schema.prisma:347–351` – enum `TargetType { project, file, version }`; `comments/route.ts:15,65,143–167` – validace `targetType` + ověření existence targetu v projektu | čteno | Všechny tři cíle podporovány a ověřovány. | — |
| R-8.1-19 | Waveform komentáře s časovým razítkem nejsou v MVP povinné | ✅ | `schema.prisma:393–423` – žádné pole pro waveform timestamp v modelu `Comment` | čteno | Správně vynecháno; žádný atribut časového razítka zvukové vlny. | — |
| R-8.1-20 | Real-time model je pouze lightweight event delivery (polling, refresh, optimistic UI nebo WebSocket) | ✅ | `notification-bell.tsx:30,60–66` – polling interval `60 000 ms`; `activity/page.tsx:259–288` – fetch na mount + navigaci; žádné WebSocket spojení | čteno | Implementováno jako polling (60 s), což odpovídá PRD. | — |
| R-8.1-21 | Live sync editace není součástí MVP | ✅ | Žádný WebSocket ani live-editor kód v repozitáři nalezen | čteno | Splněno vynecháním. | — |
| RBAC-06 | Komentáře mohou přidávat Owner, Editor, Commenter a Admin (Viewer nikoliv) | 🟡 | `comments/route.ts:17` – `COMMENT_ALLOWED_ROLES = ["owner", "editor", "commenter"]`; `replies/route.ts:11` – totéž | čteno | **Admin chybí.** Administrátor systému (`UserRole.admin`) není zahrnut do `COMMENT_ALLOWED_ROLES`. Pokud admin není zároveň `ProjectMember` s rolí owner/editor/commenter, bude mu vráceno 403. RBAC-06 explicitně vyžaduje, aby Admin mohl přidávat komentáře. | — |
| RBAC-07 | Vlastní nedávný komentář mohou smazat Owner, Editor, Commenter a Admin | 🟡 | `comments/[commentId]/route.ts:10–11,71–80` – okno 15 min pro autora s rolí ≥ commenter; moderátor zkontrolován přes `MODERATOR_ROLES = ["owner"]` | čteno | **Admin chybí v `MODERATOR_ROLES`.** Admin může smazat komentář pouze tehdy, je-li zároveň `ProjectMember` s rolí owner. Administrátor bez členství je blokován. | — |
| RBAC-08 | Komentáře může moderovat (resolve/delete vlákna) pouze Owner a Admin | ⚠️ | `resolve/route.ts:10` – `MODERATOR_ROLES = ["owner"]`; endpoint pro soft-delete celého vlákna (`ThreadStatus.deleted_soft`) neexistuje | čteno | **Dvojí gap:** (1) Admin není v `MODERATOR_ROLES` pro resolve; (2) Chybí endpoint pro soft-delete vlákna – `ThreadStatus.deleted_soft` je definován ve schématu (`schema.prisma:344`), ale žádná API route neprovádí přechod do tohoto stavu. PRD §8.1 ani RBAC-33 nenabízejí tuto funkci, ale `schema.prisma` ji definuje a RBAC-34 říká „Owner/Admin mohou vlákna řešit nebo moderovat". | — |
| RBAC-31 | Komentářové vlákno `open`: vlákno je aktivní a přijímá odpovědi | ✅ | `schema.prisma:341–344` – enum `ThreadStatus { open, resolved, deleted_soft }`; `comments/route.ts:87` – výchozí stav `open` | čteno | Implementováno. | — |
| RBAC-32 | Komentářové vlákno `resolved`: vlákno je považováno za vyřízené | ✅ | `resolve/route.ts:56–64` – UPDATE na `status: "resolved"` s kontrolou idempotence | čteno | Implementováno, ale chybí notifikace při resolve (žádné volání `createNotification` v `resolve/route.ts`). | — |
| RBAC-33 | Komentářové vlákno `deleted_soft`: vlákno odstraněno z normálního UI, ale zachováno pro audit | ❌ | `schema.prisma:344` – stav existuje v enumu; adresář `src/app/api/projects/[id]/comments/[threadId]/` neobsahuje `route.ts` ani `delete/route.ts` | čteno | Stav `deleted_soft` je definován ve schématu, ale neexistuje žádná API route, která by vlákno do tohoto stavu převedla. Moderace vlákna (mazání) není implementována. | — |
| RBAC-34 | Vlákna mohou vytvářet Commenter, Editor a Owner; pouze autorizovaní uživatelé mohou odpovídat; Owner/Admin mohou vlákna řešit nebo moderovat | 🟡 | `comments/route.ts:17` – vytváření OK; `replies/route.ts:11` – odpovídání OK; `resolve/route.ts:10` – resolve pouze Owner; thread-delete chybí | čteno | **Admin chybí v moderaci.** Admin není v `MODERATOR_ROLES` pro resolve ani pro smazání vlákna. | — |
| R-8.1 (ActivityLog) | Systém musí logovat aktivitu | ✅ | `activity-log.ts:16–44` – helper `logActivity()`; `comments/route.ts:109–118` – `comment_added` při vytvoření; `replies/route.ts:85–94` – `comment_added` při odpovědi; `schema.prisma:353–391` – `ActivityAction` enum s 33 hodnotami | čteno | Aktivita loggována atomicky v transakci pro comment_added. | — |
| R-8.1 (ActivityFeed UI) | Aktivitní feed projektu musí být dostupný | ✅ | `activity/route.ts:52–133` – GET s paginací a filtry; `activity/page.tsx:248–435` – UI s grupováním, relativními časy a paginací | čteno | Implementováno. Feed zobrazuje 16 typů akcí, filtruje `targetType` a `action`. | — |
| R-8.1 (Notification model) | Systém musí doručovat notifikační události | 🟡 | `schema.prisma:445–488` – `NotificationType` s 25 hodnotami; `notifications.ts:45–93` – `createNotifications()` bulk; `notifications/route.ts` – GET; `[id]/read/route.ts` – PUT | čteno | **Tři notifikační události nejsou doručeny:** (a) `split_submitted` – `submit/route.ts:111` obsahuje `TODO: Send notification to each contributor`; (b) `split_confirmed` / `split_rejected` – `confirm/route.ts` a `reject/route.ts` odesílají pouze e-mail (`sendConfirmationResponseEmail`), žádné in-app `createNotification`; (c) `member_joined` – akce je definována v enumu i UI, ale žádná route ji nevolá (invitation acceptance flow chybí nebo ji neloguje). | — |
| R-8.1 (Notification UI) | Notifikace musí být zobrazeny uživateli | ✅ | `notification-bell.tsx:32–175` – polling 60 s, dropdown s unread count, mark-as-read | čteno | UI implementováno. Lokální typ `NotificationType` v bell.tsx (řádky 6–12) neobsahuje gig/hire/payout typy – jde o scope bell komponentu, nikoliv backend model. | — |
| RBAC-07 (soft-delete komentáře) | Soft-delete komentáře zachovává záznam (deletedAt) | ✅ | `schema.prisma:411–423` – pole `deletedAt DateTime?` v modelu `Comment`; `comments/[commentId]/route.ts:84–93` – UPDATE nastavuje `deletedAt: new Date()` | čteno | Implementováno jako soft-delete, ne hard-delete. | — |

---

## Souhrnná tabulka statusů

| Status | Počet | Popis |
|--------|-------|-------|
| ✅ | 9 | Plně implementováno |
| 🟡 | 5 | Implementováno s mezerou (admin role nebo chybějící notifikace) |
| ❌ | 1 | Chybí implementace (thread soft-delete endpoint) |
| ⚠️ | 1 | Dvojí gap (admin v moderaci + chybějící endpoint) |

---

## Klíčové nálezy

1. **Admin role v comment moderaci** (RBAC-06, RBAC-07, RBAC-08, RBAC-34): `MODERATOR_ROLES` a `COMMENT_ALLOWED_ROLES` odkazují pouze na `ProjectMember.role`, nikoliv na `User.role`. Admin systémový uživatel bez explicitního `ProjectMember` záznamu s rolí `owner` nemůže přidávat komentáře, mazat je ani resolvovat vlákna.

2. **Chybějící endpoint pro thread soft-delete** (RBAC-33): Stav `ThreadStatus.deleted_soft` je definován ve schématu, ale neexistuje žádná API route (`DELETE /api/projects/[id]/comments/[threadId]`), která by vlákno do tohoto stavu převedla.

3. **Tři notifikační události nejsou doručeny**: `split_submitted` (TODO v kódu), `split_confirmed` a `split_rejected` (pouze e-mail, žádné in-app), `member_joined` (žádné volání v invitation-accept flow).

4. **Resolve bez notifikace**: Endpoint `resolve/route.ts` nevolá `createNotification` – autor vlákna není informován, že jeho vlákno bylo uzavřeno.
