# Epic 11 — Marketplace: Hiring & Delivery [Stream 2]

**Audit datum:** 2026-06-28
**Scope:** PRD §8.3 — hiring/delivery side (applications, accept/reject, hire creation, handoff, delivery state machine, access control)
**Zahrnuto:** `R-8.3-04` až `R-8.3-13` (R-8.3-01–03 jsou mimo scope epicu 11 — patří do epicu gig CRUD/browse; auditovány pro úplnost kontextu)
**Vyloučeno:** platební mechanika (epic 12 — R-8.4-*)

---

## Výsledky

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.3-01 | Systém musí umožnit vytvoření draftu gigu pod existujícím projektem | ✅ | `prisma/schema.prisma:683` (`Gig.projectId` NOT NULL, FK na Project); gig vytváří se `status=draft` | schema | — | — |
| R-8.3-02 | Systém musí umožnit publikaci gigu | ✅ | `src/app/api/gigs/[id]/route.ts` (PATCH → `status=published`); `prisma/schema.prisma:700` (`GigStatus` enum obsahuje `published`) | čteno | — | — |
| R-8.3-03 | Systém musí umožnit procházení a filtrování gigů | ✅ | `src/app/api/gigs/route.ts` (GET s query params pro filtrování); schema index `[status, publishedAt]` na řádku 710 | čteno | — | — |
| R-8.3-04 | Systém musí umožnit odeslání přihlášky na gig (submit application) | ✅ | `src/app/api/gigs/[id]/applications/route.ts:79` (POST, validace `status=published`, zákaz owner self-apply, idempotent re-apply, notifikace) | čteno | Plně implementováno vč. `coverNote` + `proposedFee` validace a notification owner | — |
| R-8.3-05 | Systém musí umožnit přijetí uchazeče (accept applicant) | ✅ | `src/app/api/applications/[id]/accept/route.ts:23` (POST, pouze owner projektu, gig musí být `published`, atomická transakce: accept+reject ostatních+hire+ProjectMember) | čteno | Rejection ostatních žadatelů v téže transakci; `PATCH /api/applications/[id]` podporuje i ruční `rejected` stav pro individuální odmítnutí | — |
| R-8.3-06 | Po přijetí uchazeče musí systém provést handoff s omezeným přístupem ke spolupráci | ✅ | `src/app/api/applications/[id]/accept/route.ts:173` (`ProjectMember.upsert` role=`commenter` v téže transakci); `src/app/api/hires/[id]/access/route.ts:23` (PATCH — buyer může role změnit na viewer/commenter/editor, nikdy owner); `prisma/schema.prisma:758` (`Hire.memberRole @default(commenter)`) | čteno | PRD §8.3 l.222–223 vynuceno: default commenter, explicitní rozšíření přes `/access`. Talent nemůže cancel hire (pouze buyer) — omezení zdokumentováno v komentáři řádek 93 hire route. | — |
| R-8.3-07 | Marketplace neobsahuje recenze a hodnocení | ✅ | `prisma/schema.prisma` — žádný model `Review`, `Rating` ani podobný; žádný API route pro reviews/ratings | schema | Vyloučení správně implementováno — žádné stopy v schema ani API | — |
| R-8.3-08 | Marketplace neobsahuje milestone workflows | ✅ | `prisma/schema.prisma` — žádný model `Milestone`; Hire state machine: `awaiting_start→in_progress→delivered→approved` bez mezistupňů (milestones) | schema | Hire workflow je jednoduchý lineární — bez milestone logikou | — |
| R-8.3-09 | Marketplace neobsahuje automatizované centrum pro spory | ✅ | Žádný `Dispute` model v schema; žádný `/api/disputes` route nalezen | schema | Vyloučení dodrženo | — |
| R-8.3-10 | Marketplace neobsahuje systém revizních kol | ✅ | Žádný `RevisionRound` model; `HireStatus` enum (`prisma/schema.prisma:674`) neobsahuje revision stavy | schema | Vyloučení dodrženo | — |
| R-8.3-11 | Marketplace je Stream 2 a není podmínkou prvního customer-ready release | ✅ | `AGENTS.md` / `PRD_v2_MUSICCOLLABHUB.md:14` — deklarováno jako Stream 2; kód existuje ale není blokující pro launch | čteno | — | — |
| R-8.3-12 | Každý gig musí patřit pod existující projekt | ✅ | `prisma/schema.prisma:684` (`Gig.projectId String`, FK `Project` s `onDelete: Cascade`); `src/app/api/gigs/[id]/applications/route.ts:102` — gig lookup vždy ověřuje existenci projektu a `deletedAt IS NULL` | schema + čteno | — | — |
| R-8.3-13 | Profil pro marketplace musí obsahovat: headline, bio, skills, genres, price range a až 10 pracovních ukázek nebo odkazů | 🟡 | `prisma/schema.prisma:68–78` (`Profile`: `headline`, `bio`, `skills[]`, `genres[]`, `priceRange`); `src/app/api/profile/samples/route.ts:97` (`MAX_PORTFOLIO_SAMPLES = 10`); `src/lib/portfolio-samples.ts:1` | schema + čteno | Všechna povinná pole existují v schema a limit 10 je vynucen na API. **Mezera:** pole `headline`, `bio`, `skills`, `genres`, `priceRange` jsou volitelné (bez NOT NULL) — PRD nespecifikuje povinnost při publikaci gigu, ale profil pro marketplace není validován jako kompletní před tím, než talent podá přihlášku. Pokud PRD zamýšlí profil jako prerekvizitu pro aplikaci, chybí gate. Nízké riziko — PRD formulaci lze číst oběma způsoby. | — |

---

## Souhrnný počet

| Status | Počet |
|--------|-------|
| ✅ Splněno | 12 |
| 🟡 Částečně / nejasnost | 1 |
| ❌ Chybí | 0 |
| ⚠️ Porušení PRD | 0 |
| **Celkem** | **13** |

---

## Poznámky

- **Delivery state machine** (`awaiting_start → in_progress → delivered → approved / cancelled`) je plně implementován v `src/app/api/hires/[id]/route.ts` se správným rozdělením actor-rolí (talent dodává, buyer schvaluje, buyer ruší).
- **Payout auto-release trigger** je správně navázán na `delivered` event: `payoutRecord.autoReleaseAt` je nastaven při přechodu do `delivered` (`src/app/api/hires/[id]/route.ts:316–324`). Detailní payout mechanika je scope epicu 12.
- **Zrušení hire** nereaktivuje gig do `published` — gig přejde do `cancelled` (l.262–268 hire route). Komentář v kódu uvádí, že owner musí vytvořit nový gig. Toto chování není v PRD §8.3 explicitně specifikováno; není to gap, ale může být předmětem diskuse.
- **R-8.3-01–03** jsou zahrnuty do tabulky pro úplnost, ale primárním scope epiku 11 jsou řádky R-8.3-04–13.
