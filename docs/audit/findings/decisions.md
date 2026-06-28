# Audit – Decision Log Conformance

**Zdroj:** `Decision_Log_MUSICCOLLABHUB.md`  
**ID extrakce:** `docs/audit/requirement-index.md` sekce DEC  
**Datum auditu:** 2026-06-28  
**Auditor:** Claude Code (read-only pass — žádný kód nebyl upraven)

---

## Výsledky

| ID | Rozhodnutí | Status | Důkaz (soubor:řádek) | Úroveň | Soulad / rozpor | Issue# |
|----|-----------|--------|----------------------|--------|-----------------|--------|
| DEC-01 | Marketplace = Stream 2, není podmínkou launche | ✅ dodrženo | `prisma/schema.prisma:654` — komentář `// 10-01: Gig (Stream 2 — Marketplace)`; `src/app/api/projects/[id]/gigs/route.ts:58` — komentář `// POST … (Stream 2 scope)`; marketplace routes existují ale nejsou označeny jako launch-critical | čteno | Schéma i kód explicitně označují gig/marketplace jako Stream 2. Subscription a project-hub routes jsou primárním streamem. | — |
| DEC-02 | Každý gig musí patřit pod existující projekt (no standalone gig lifecycle) | ✅ dodrženo | `prisma/schema.prisma:684` — `Gig.projectId String` (NOT NULL, FK na `Project`); `src/app/api/projects/[id]/gigs/route.ts:68-80` — POST verifikuje `project.findUnique({ where: { id: projectId, status: "active", deletedAt: null } })` a vrátí 404 pokud projekt neexistuje; žádný endpoint `/api/gigs` (POST) neexistuje | čteno | Gig nelze vytvořit bez existujícího aktivního projektu. DB constraint + routovací logika jsou konzistentní. | — |
| DEC-03 | Politika uvolnění výplaty: schválení kupujícím NEBO automatické uvolnění 7 dní po dodání | ✅ dodrženo | `src/lib/payouts.ts:7` — `export const PAYOUT_AUTO_RELEASE_DAYS = 7`; `src/app/api/hires/[id]/route.ts:314-323` — při přechodu `delivered` se nastaví `autoReleaseAt: autoReleaseDeadline(now)` (7 dní); `src/app/api/hires/[id]/route.ts:340` — při `approved` volá `dispatchPayoutOnApproval(hireId)` (okamžité uvolnění) | čteno | Obě větve (kupující schválí, nebo auto po 7 dnech od `delivered`) jsou implementovány. | — |
| DEC-04 | Payout lifecycle musí podporovat review window a hold stavy; support/admin může blokovat výplatu před uvolněním | ✅ dodrženo | `prisma/schema.prisma:863-867` — `PayoutBlockReason` enum: `connect_onboarding_incomplete`, `kyc_pending`, `awaiting_buyer_approval`, `admin_hold`; `prisma/schema.prisma:877` — `blockReason PayoutBlockReason?`; `src/app/api/admin/payouts/[id]/hold/route.ts:46-83` — admin hold endpoint nastaví `status: "blocked"`, `blockReason: "admin_hold"`, `heldAt`, `heldByActorId`, zruší `autoReleaseAt`; `src/app/api/hires/[id]/route.ts:399-401` — admin_hold blokuje payout i při buyer approval | čteno | Review window (7 dní) i admin hold stav jsou plně implementovány. Admin hold přepisuje i buyer approval. | — |
| DEC-05 | Najatý talent má ve výchozím stavu omezený přístup; širší přístup k assetům vyžaduje explicitní udělení ownerem | ✅ dodrženo | `prisma/schema.prisma:758` — `Hire.memberRole MemberRole @default(commenter)`; `src/app/api/applications/[id]/accept/route.ts:172-185` — při přijetí přihlášky se vytvoří `ProjectMember` s rolí `commenter` (nikoli `editor` ani `owner`); `src/lib/hires.ts:10` — `HIRE_GRANTABLE_ROLES = ["viewer", "commenter", "editor"]` (owner záměrně vyloučen) | čteno | Talent nastoupí jako Commenter. Wider access nelze získat automaticky. | — |
| DEC-06 | Přijetí hire automaticky neznamená plný přístup k projektu; udělení přístupu musí být explicitní a auditně zaznamenané | ✅ dodrženo | `src/app/api/applications/[id]/accept/route.ts:172-185` — upsert vytvoří member jako `commenter`, `update: {}` nezvedne roli existujícímu členovi; `src/app/api/hires/[id]/access/route.ts:117-123` — explicitní PATCH `/access` loguje `gig_hire_access_granted` do `ActivityLog` s `gigId`, `role`, `talentId`; přístup je gated na buyer (`hire.buyerId !== user.id` → 403) | čteno | Explicitní grant je oddělený endpoint s povinným audit logem. Konzistentní s rozhodnutím. | — |
| DEC-07 | Split záznamy jsou pouze na úrovni projektu v prvním customer-ready release; track-level granularita je pozdější rozšíření | ✅ dodrženo | `prisma/schema.prisma:511-527` — `SplitRecord` má `projectId String` (FK na `Project`), žádné pole `trackId`, `versionId` ani `fileId`; `SplitContributor` nemá track-level vazbu; grep na `trackId\|track_level` v celém schématu — žádný výsledek | čteno | Schema obsahuje pouze project-level split záznamy. Track-level pole neexistují. | — |
| DEC-08 | Model předplatného je trial → placený pouze (no permanent free tier after trial); read přístup může zůstat, ale vytváření/upload/publish vyžadují placený status | ✅ dodrženo | `prisma/schema.prisma:559-570` — `SubscriptionPlan` enum: `trial`, `pro`, `team` — žádný `free` plán; `SubscriptionStatus` enum: `trialing`, `active`, `past_due`, `canceled`, `expired` — žádný `free` stav; `src/lib/subscription.ts:84-87` — `trialing\|active` → plný přístup; `src/lib/subscription.ts:89-112` — `past_due` → read allowed, write blocked po grace period; `src/lib/subscription.ts:114-122` — `canceled\|expired` → vše blokováno (403) | čteno | Žádný permanent free tier. Po expiraci trialu je write i read blokováno (403). Decision říká "read access may remain" — kód blokuje i read pro expired (přísnější než decision, ale nikoli v rozporu — decision je minimální požadavek). | — |

---

## Shrnutí počtů

| Status | Počet |
|--------|-------|
| ✅ dodrženo | 8 |
| 🟡 částečně | 0 |
| ❌ neimplementováno | 0 |
| ⚠️ rozpor | 0 |

**Celkem DEC-* rozhodnutí:** 8

---

## Poznámky k auditu

**DEC-08 – drobná divergence (nikoli rozpor):** Decision Log říká *"read access may remain"* po expiraci trialu. Kód v `src/lib/subscription.ts:114-122` blokuje i read přístup pro `canceled`/`expired` uživatele. Toto je přísnější implementace, která neporušuje rozhodnutí (decision popisuje minimum), ale pokud je záměrem zachovat read-only přístup pro expired uživatele, je potřeba update v `subscription.ts`.

**DEC-06 – audit log scope:** Logování probíhá do `ActivityLog` (projektová tabulka), nikoli do globálního admin audit trailu. Access grant je tak viditelný v project activity, ale ne v admin audit (`/api/admin/audit`). Toto může být mezera pro compliance, ale není přímý rozpor s rozhodnutím.

**Žádné ⚠️ rozpory nebyly nalezeny.** Všech 8 rozhodnutí je v kódu implementováno.
