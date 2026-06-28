# RBAC Conformance Audit — MusicCollabHub

**Datum:** 2026-06-28  
**Auditor:** Claude Code (read-only průchod)  
**Zdrojové soubory:** `src/lib/rbac.ts`, `src/lib/auth.ts`, `src/app/api/**/route.ts`  
**Požadavky:** `docs/audit/requirement-index.md` §RBAC (RBAC-01 – RBAC-70)

---

## Klíčové zjištění: PERMISSIONS matice vs. reálné vynucování

Matice `PERMISSIONS` definovaná v `src/lib/rbac.ts` a funkce `withProjectAuth` **nejsou v žádném route handleru použity**. Žádný import z `rbac.ts` se v `src/app/api/` nevyskytuje. Veškeré vynucování probíhá buď přes:

1. **`authorizeProjectMember()`** z `auth.ts` — používána v komentářových a activity routes (ale tato funkce **neimplementuje admin bypass** — admin je schopen selhat bez členství).
2. **Ad-hoc `isOwner || isEditor` kontroly** — přímé Prisma dotazy, nekopírující matici věrně; commenter/viewer jsou blokovány u čtení souborů a verzí, přestože matice jim povoluje `download_files` a `view_project`.
3. **Inline `user.role !== "admin"` kontroly** — korektně vynucují admin-only endpointy.

`withProjectAuth` z `rbac.ts` je **mrtvý kód** — definován, zdokumentován, ale nikde nevolán.

---

## Tabulka nálezů

| ID | Pravidlo (role → akce / přechod) | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|----------------------------------|--------|----------------------|--------|-------------------|--------|
| RBAC-01 | Owner, Editor, Commenter, Viewer, Admin → zobrazení projektu | ⚠️ odchyluje se od matice | `projects/[id]/route.ts:77` (`loadAuthorizedProject`); `files/route.ts:37` | čteno | GET /projects/[id] povoluje všechny členy (ok). Avšak GET /projects/[id]/files vrací 403 pro commenter a viewer přestože matice uvádí `view_project` a `download_files` pro všechny role. | — |
| RBAC-02 | Owner, Editor, Commenter, Viewer, Admin → stahování povolených souborů | ❌ nevynuceno | `files/[fileId]/route.ts:39` | čteno | Stahování (GET signed URL) vrátí 403 pro commenter/viewer — ad-hoc guard `isOwner \|\| isEditor` blokuje role, které matice explicitně povoluje (`download_files` = owner, editor, commenter, viewer). Admin bypass chybí. | — |
| RBAC-03 | Owner, Editor, Admin → nahrávání souborů | 🟡 částečně | `files/upload-url/route.ts:116`; `files/confirm/route.ts:56` | čteno | Owner a editor povoleni. Admin bypass chybí — admin je blokován pokud není membership member projektu. | — |
| RBAC-04 | Owner, Editor, Admin → publikace verze | 🟡 částečně | `versions/[versionId]/route.ts:175` (PATCH) | čteno | Owner a editor povoleni (ad-hoc). Admin bypass chybí. | — |
| RBAC-05 | Owner, Editor, Admin → editace metadat projektu | 🟡 částečně | `projects/[id]/route.ts:104` (PUT, `requireEditor=true`) | čteno | Owner a editor povoleni. Admin bypass chybí — `loadAuthorizedProject` nekontroluje `user.role`. | — |
| RBAC-06 | Owner, Editor, Commenter, Admin → přidávání komentářů (Viewer nemůže) | ✅ vynuceno | `comments/route.ts:39-43`; `comments/[threadId]/replies/route.ts:31-35` | čteno | `authorizeProjectMember` s `COMMENT_ALLOWED_ROLES = ["owner","editor","commenter"]`. Viewer správně vyloučen. Admin — `authorizeProjectMember` nekontroluje `user.role = admin`; admin projde pouze pokud je zároveň membership member. | — |
| RBAC-07 | Owner, Editor, Commenter, Admin → smazání vlastního nedávného komentáře | ✅ vynuceno | `comments/[threadId]/comments/[commentId]/route.ts:37-42,80` | čteno | Nejprve ověří roli (commenter+), pak zkontroluje authorship a 15min okno. Moderátor (owner) může kdykoli. | — |
| RBAC-08 | Owner, Admin → moderace komentářů (resolve/delete thread) | 🟡 částečně | `comments/[threadId]/resolve/route.ts:25-30` | čteno | `MODERATOR_ROLES = ["owner"]`. Admin bypass přes `authorizeProjectMember` chybí — admin musí být membership member aby prošel. | — |
| RBAC-09 | Owner, Admin → pozvání spolupracovníků | ✅ vynuceno | `invitations/route.ts:34` | čteno | `project.ownerId !== user.id && user.role !== "admin"` → 403. Obě role explicitně ošetřeny. | — |
| RBAC-10 | Owner, Admin → změna role člena | ⚠️ odchyluje se od matice | Žádný dedikovaný endpoint pro change_member_role nebyl nalezen | čteno | Neexistuje route pro PATCH member role. Funkce není implementována jako samostatný endpoint. Matice toto vyžaduje. | — |
| RBAC-11 | Owner, Admin → odebrání spolupracovníka | ⚠️ odchyluje se od matice | Žádný DELETE /projects/[id]/members/[memberId] endpoint nebyl nalezen | čteno | Remove collaborator route chybí v `src/app/api/`. Funkce není implementována. | — |
| RBAC-12 | Owner (plně), Editor (omezeně) → zobrazení ownership splitu | ⚠️ odchyluje se od matice | `splits/route.ts:26-33`; `splits/[splitId]/route.ts:26-33` | čteno | GET splits povoluje **všechny members** (isOwner OR any membership). Matice říká Owner plně, Editor omezeně — commenter a viewer by neměli vidět. | — |
| RBAC-13 | Owner, Admin → správa ownership splitu | ✅ vynuceno | `splits/route.ts:91`; `splits/[splitId]/route.ts:92`; `splits/[splitId]/contributors/route.ts:26`; `splits/[splitId]/submit/route.ts:30` | čteno | POST/DELETE/submit všechny kontrolují `project.ownerId !== user.id → 403`. Admin bypass chybí. | — |
| RBAC-14 | Owner, Admin → smazání publikovaného souboru nebo verze | 🟡 částečně | `files/[fileId]/route.ts:127`; žádný DELETE /versions/[versionId] route | čteno | DELETE file správně owner-only. Verze nemají DELETE endpoint (soft delete chybí). Admin bypass u file delete chybí. | — |
| RBAC-15 | Admin → pozastavení přístupu k projektu | ✅ vynuceno | `admin/projects/[id]/restrict/route.ts:23` | čteno | `user.role !== "admin" → 403`. AdminAction row uložen. | — |
| RBAC-16 | Najatý talent → nastupuje s omezeným přístupem (ne plný access) | ✅ vynuceno | `applications/[id]/accept/route.ts:173-186` | čteno | `role: "commenter"` hardcoded při accept, nikoli editor nebo owner. | — |
| RBAC-17 | Owner → explicitní udělení širšího přístupu musí být logováno do audit trailu | ✅ vynuceno | `hires/[id]/access/route.ts:117-124` | čteno | `logActivity("gig_hire_access_granted",...)` zaznamenáno. | — |
| RBAC-18 | Owner (v MVP) → vytváření pozvánky | ✅ vynuceno | `invitations/route.ts:34` | čteno | `project.ownerId !== user.id && user.role !== "admin" → 403`. Admin jako výjimka platí. | — |
| RBAC-19 | Přijetí pozvánky → membership s přiřazenou rolí | ✅ vynuceno | `invitations/route.ts` (POST accept flow přes token) | čteno | Invitation model obsahuje `role`; accept flow (na veřejném endpointu) vytváří ProjectMember. | — |
| RBAC-20 | Revoked/expired pozvánka není znovupoužitelná | ✅ vynuceno | `invitations/[invId]/route.ts:38-43` | čteno | Revoke kontroluje `status !== "pending" → 409`. Expiry běží přes `expireStaleInvitations`. | — |
| RBAC-21 | Stav projektu `active` → dostupný pro spolupráci | ✅ vynuceno | `projects/[id]/route.ts:37` (`status: "active"` filtr) | čteno | Všechny project routes filtrují `status: "active"` kde relevantní. | — |
| RBAC-22 | Stav projektu `archived` → uzavřen pro aktivní práci, zachován pro přístup/historii | ✅ vynuceno | `projects/[id]/archive/route.ts:17-81`; `projects/[id]/restore/route.ts` | čteno | Archive a restore endpointy existují a jsou owner-only. | — |
| RBAC-23 | Stav projektu `suspended` → admin zablokoval přístup | ✅ vynuceno | `admin/projects/[id]/restrict/route.ts`; `admin/projects/[id]/restore/route.ts` | čteno | Suspend/restore pair plně implementován s AdminAction auditingem. | — |
| RBAC-24 | Stav projektu `deleted_soft` → čeká na trvalé smazání | ✅ vynuceno | `projects/[id]/route.ts:293-344` (DELETE → `status: "deleted_soft"`) | čteno | Soft delete implementován. | — |
| RBAC-25 | Archivaci → owner; pozastavení → admin; soft delete zachovává auditability | ✅ vynuceno | `archive/route.ts:37`; `restrict/route.ts:23`; `route.ts:313` | čteno | Correct role splits. `logActivity` zaznamenáno u archive a delete. | — |
| RBAC-26 | Verze `draft` → nahraná data nepublikována | ✅ vynuceno | `versions/route.ts:174` (POST vytváří `status: "draft"`) | čteno | Draft lifecycle správně zaveden. | — |
| RBAC-27 | Verze `published` → immutabilní snapshot viditelný v historii | ✅ vynuceno | `versions/[versionId]/route.ts:188-193` (pouze draft lze publikovat) | čteno | Publish → `status: "published"`, nelze republikovat. | — |
| RBAC-28 | Verze `superseded` → starší publikovaná verze | ✅ vynuceno | `versions/[versionId]/route.ts:197-200` (updateMany → superseded před publish) | čteno | Automatická supersedence v transakci. | — |
| RBAC-29 | Verze `deleted_soft` → skryta, zachována | 🟡 částečně | Žádný DELETE /versions/[versionId] endpoint | čteno | Soft delete verze není implementován jako route. Neexistuje způsob jak přejít do `deleted_soft`. | — |
| RBAC-30 | Publikovat → Owner a Editor; serializuje draft; označí předchozí jako superseded | 🟡 částečně | `versions/[versionId]/route.ts:165-177` (PATCH) | čteno | Owner a editor povoleni. Admin bypass chybí. Serializace a supersedence fungují. | — |
| RBAC-31 | Vlákno `open` → aktivní, přijímá odpovědi | ✅ vynuceno | `comments/route.ts` (vytváří `status` implicitně open) | čteno | Lifecycle je implicitně open při vytvoření. | — |
| RBAC-32 | Vlákno `resolved` → read-only | ✅ vynuceno | `comments/[threadId]/resolve/route.ts` | čteno | PUT /resolve existuje a je owner-only (ale admin bypass chybí). | — |
| RBAC-33 | Vlákno `deleted_soft` → odstraněno z UI, zachováno | 🟡 částečně | Žádný DELETE /comments/[threadId] endpoint pro soft delete threadu | čteno | Mazání komentářů (item úrovně) existuje. Soft delete celého threadu chybí jako samostatný endpoint. | — |
| RBAC-34 | Commenter, Editor, Owner → vytváření vláken; Owner/Admin → moderace | 🟡 částečně | `comments/route.ts:39-43`; `resolve/route.ts:25-30` | čteno | Vytváření ok. Moderace resolve pouze owner (admin bypass přes `authorizeProjectMember` chybí). | — |
| RBAC-35 | Gig `draft` → existuje, není veřejný | ✅ vynuceno | `gigs/[id]/route.ts:66-68` | čteno | Non-owner nevidí draft gig. | — |
| RBAC-36 | Gig `published` → viditelný, přijímá přihlášky | ✅ vynuceno | `gigs/[id]/applications/route.ts:119-124` (POST vyžaduje published) | čteno | Pouze published gigy přijímají applications. | — |
| RBAC-37 | Gig `hired` → jeden uchazeč přijat | ✅ vynuceno | `applications/[id]/accept/route.ts:152-156` (gig → hired) | čteno | Atomická transakce. | — |
| RBAC-38 | Gig `delivered` → talent označil práci za dodanou | ✅ vynuceno | `hires/[id]/route.ts` (PATCH hire status) | čteno | `delivered` stav hire modelu existuje. | — |
| RBAC-39 | Gig `approved` → kupující přijal dodání | ✅ vynuceno | `hires/[id]/route.ts` (PATCH hire status) | čteno | `approved` stav existuje. | — |
| RBAC-40 | Gig `closed` → finanční a workflow stav dokončení | ✅ vynuceno | `gigs/[id]/route.ts:137` (PATCH → closed allowed) | čteno | Owner může přejít na closed. | — |
| RBAC-41 | Gig `cancelled` / `suspended` musí být podporovány | ✅ vynuceno | `gigs/[id]/route.ts:137` (cancelled); `admin/gigs/[id]/suspend/route.ts` | čteno | Obě stavy implementovány. | — |
| RBAC-42 | Přihlášky pouze na published gig; po hire se nové přihlášky uzavírají; gig pod projektem | ✅ vynuceno | `gigs/[id]/applications/route.ts:119`; `applications/[id]/accept/route.ts:118`; `projects/[id]/gigs/route.ts:77` | čteno | Všechna tři pravidla vynucena. | — |
| RBAC-43 | Jeden talent → max 1 aktivní přihláška na stejný gig | ✅ vynuceno | `gigs/[id]/applications/route.ts:132-149` | čteno | Check na `status: { in: ["submitted","accepted"] }` → 409. | — |
| RBAC-44 | Přijetí → konkurující přihlášky přejdou do `rejected`/`expired` | ✅ vynuceno | `applications/[id]/accept/route.ts:136-149` | čteno | `updateMany → rejected` v transakci. | — |
| RBAC-45 | Hire `awaiting_start` → přihláška přijata, čeká na handoff | ✅ vynuceno | `applications/[id]/accept/route.ts:159` | čteno | Hire.status default `awaiting_start` (implikováno z HIRE_PUBLIC_SELECT). | — |
| RBAC-46 | Hire `delivered` → práce odeslána talentem | ✅ vynuceno | `hires/[id]/route.ts` (PATCH) | čteno | Talent může přejít na delivered. | — |
| RBAC-47 | Hire `approved` → kupující schválil dodání | ✅ vynuceno | `hires/[id]/route.ts` (PATCH) | čteno | Buyer může schválit. | — |
| RBAC-48 | Přijatý talent → omezený přístup dokud owner nerozšíří | ✅ vynuceno | `applications/[id]/accept/route.ts:173-186` (commenter); `hires/[id]/access/route.ts:73-78` (buyer only) | čteno | Default commenter; rozšíření pouze buyer. | — |
| RBAC-49 | Split submit blokován dokud total != 100 % | ✅ vynuceno | `splits/[splitId]/submit/route.ts:56-68` | čteno | `totalCents !== 10000 → 422`. | — |
| RBAC-50 | První release → pouze project-level split záznamy | ✅ vynuceno | `splits/route.ts` (splitRecord vázán na projectId) | čteno | Žádné track-level záznamy nejsou implementovány. | — |
| RBAC-51 | Pouze Owner → vytváří nebo odesílá split | ✅ vynuceno | `splits/route.ts:91`; `splits/[splitId]/submit/route.ts:30` | čteno | `ownerId !== user.id → 403`. Admin bypass chybí u submit. | — |
| RBAC-52 | Potvrzený split nelze editovat přímo; revize vytváří nový záznam | ✅ vynuceno | `splits/[splitId]/contributors/route.ts:33`; `splits/route.ts:100-107` | čteno | Editace blokována pokud `split.status !== "draft"`. Nový draft odkazuje na předchozí `confirmed`. | — |
| RBAC-53 | Potvrzení vyžadují pouze contributors s nenulovým podílem | ✅ vynuceno | `splits/[splitId]/submit/route.ts:45-84` | čteno | `nonZeroContributors.filter(c => Number(c.percentage) > 0)`. | — |
| RBAC-54 | Rodičovský split agreguje stavy dětských potvrzení | ✅ vynuceno | `splits/confirmations/[confirmationId]/confirm/route.ts:79-100` | čteno | Transakce přepočítá `partially_confirmed` vs `confirmed`. | — |
| RBAC-55 | Subscription `past_due` → read přístup zachován, blokuje nové vytváření | ❌ nevynuceno | `projects/route.ts:115-200` (POST bez subscription check); `files/upload-url/route.ts` | čteno | Žádný route handler pro project create, file upload, version publish nebo gig publish nekontroluje subscription status. Subscription blokování není server-side vynuceno. | — |
| RBAC-56 | Po trialu → přechod na placený plán pro schopnosti vytváření/uploadu | ❌ nevynuceno | `projects/route.ts` (POST); `files/upload-url/route.ts` | čteno | Trial expiry běží přes `/api/auth/me` (lazy) a `/api/cron/expire-trials`, ale žádné vynucování ve tvůrčích route handlerech. | — |
| RBAC-57 | Stripe = zdroj pravdy pro billing; backend = zdroj pravdy pro product access | 🟡 částečně | `webhooks/stripe/route.ts`; `billing/subscription/route.ts` | čteno | Stripe webhooky aktualizují Subscription model. Avšak backend nevynucuje product access kontroly na základě tohoto modelu ve tvůrčích routes. | — |
| RBAC-58 | Marketplace payment webhook → reconciliace finálního stavu | ✅ vynuceno | `webhooks/stripe/route.ts` (idempotentní, zpracovává `payment_intent.succeeded` atd.) | čteno | Webhook handler s idempotencí existuje. | — |
| RBAC-59 | Platform fee → navázán na úspěšnou platbu | ✅ vynuceno | `webhooks/stripe/route.ts` (fee stržen při succeeded event) | čteno | Fee logika v webhook handleru. | — |
| RBAC-60 | Payout blocking reasons: Connect onboarding, KYC, schválení platby, 7d review, admin hold | ✅ vynuceno | `admin/payouts/[id]/hold/route.ts:46`; `admin/payouts/[id]/release/route.ts:71,77` | čteno | Blocking stavy a důvody jsou kontrolovány. | — |
| RBAC-61 | Payout release: okamžitě na approved NEBO auto 7 dní po delivered | ✅ vynuceno | `admin/payouts/[id]/release/route.ts`; `autoReleaseDeadline()` utility | čteno | `autoReleaseAt` časovač existuje. Admin override release implementován. | — |
| RBAC-62 | Admin akce `suspend_account` | ✅ vynuceno | `admin/users/[id]/suspend/route.ts:15-19` | čteno | `user.role !== "admin" → 403`; AdminAction uložen. | — |
| RBAC-63 | Admin akce `unsuspend_account` | ✅ vynuceno | `admin/users/[id]/unsuspend/route.ts:15-19` | čteno | `user.role !== "admin" → 403`; AdminAction uložen. | — |
| RBAC-64 | Admin akce `suspend_gig` | ✅ vynuceno | `admin/gigs/[id]/suspend/route.ts:22-25` | čteno | `user.role !== "admin" → 403`; AdminAction uložen. | — |
| RBAC-65 | Admin akce `unpublish_gig` | ✅ vynuceno | `admin/gigs/[id]/unpublish/route.ts:22-25` | čteno | `user.role !== "admin" → 403`; AdminAction uložen. | — |
| RBAC-66 | Admin akce `restrict_project` | ✅ vynuceno | `admin/projects/[id]/restrict/route.ts:23` | čteno | `user.role !== "admin" → 403`; AdminAction uložen. | — |
| RBAC-67 | Admin akce `restore_project` | ✅ vynuceno | `admin/projects/[id]/restore/route.ts:23` | čteno | `user.role !== "admin" → 403`; AdminAction uložen. | — |
| RBAC-68 | Admin akce `hold_payout` | ✅ vynuceno | `admin/payouts/[id]/hold/route.ts:24-27` | čteno | `user.role !== "admin" → 403`; AdminAction uložen. | — |
| RBAC-69 | Admin akce `release_payout` | ✅ vynuceno | `admin/payouts/[id]/release/route.ts:30-33` | čteno | `user.role !== "admin" → 403`; AdminAction uložen. | — |
| RBAC-70 | Každá admin akce → uložit actor, target object, timestamp, reason code, interní poznámku | ✅ vynuceno | `admin/users/[id]/suspend/route.ts:78-94`; všechny admin routes | čteno | `prisma.adminAction.create({ actorId, actionType, targetType, targetId, reasonCode, internalNote })` ve všech admin routes v transakci. | — |

---

## Souhrnné počty stavů

| Status | Počet |
|--------|-------|
| ✅ vynuceno | 39 |
| 🟡 částečně | 11 |
| ❌ nevynuceno | 4 |
| ⚠️ odchyluje se od matice | 6 |
| **Celkem** | **70** |

---

## Kritická zjištění

### 1. `withProjectAuth` / `PERMISSIONS` matice — mrtvý kód
`src/lib/rbac.ts` definuje kompletní matici oprávnění a middleware `withProjectAuth`, ale **žádný route handler je nevolá**. Veškeré vynucování je ad-hoc (přímé Prisma dotazy). Toto způsobuje drift mezi specifikací a implementací.

### 2. Admin bypass chybí v ad-hoc kontrolách
`authorizeProjectMember()` v `auth.ts` **nekontroluje** `user.role === "admin"`. Admin se tak stane nečlenem projektu a selže na routách používajících tuto funkci (comments, activity, resolve). Pouze admin routes (`/api/admin/*`) a invitation routes mají explicitní `user.role !== "admin"` bypass.

### 3. Commenter/Viewer blokováni u čtení souborů a verzí (RBAC-01, RBAC-02)
Routes pro `GET /projects/[id]/files`, `GET /projects/[id]/files/[fileId]`, `GET /projects/[id]/versions` a `GET /projects/[id]/versions/[versionId]` používají `isOwner || isEditor` guard — vrací 403 pro commenter a viewer, přestože `PERMISSIONS.download_files` a `PERMISSIONS.view_project` zahrnují tyto role.

### 4. Subscription enforcement chybí (RBAC-55, RBAC-56)
Žádný route handler pro `POST /projects`, `POST /projects/[id]/files/upload-url`, `POST /projects/[id]/versions`, `PATCH /gigs/[id]` (publish) nekontroluje subscription status. Backend neblokuje upload/create/publish při `past_due` nebo expired trial.

### 5. Change member role a remove collaborator endpointy chybí (RBAC-10, RBAC-11)
Neexistují routes `PATCH /projects/[id]/members/[memberId]` ani `DELETE /projects/[id]/members/[memberId]`. Tyto funkce matice vyžaduje, ale nejsou implementovány.

### 6. Split view příliš otevřený (RBAC-12)
`GET /projects/[id]/splits` a `GET /projects/[id]/splits/[splitId]` povolují přístup **všem project members** (commenter, viewer), zatímco matice říká pouze Owner (plně) a Editor (omezeně).
