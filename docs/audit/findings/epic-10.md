# Epic 10 — Marketplace: Gigs & Discovery [Stream 2] — PRD Conformance Audit

**Baseline:** PRD_v2_MUSICCOLLABHUB.md §8.3 (gig side only)
**Audit date:** 2026-06-28
**Auditor:** Claude (read-only, no code changes)

---

## Výsledky (Results)

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.3-01 | Systém musí umožnit vytvoření draftu gigu pod existujícím projektem | ✅ | `src/app/api/projects/[id]/gigs/route.ts:62–124` (POST), `src/app/projects/[id]/gigs/new/page.tsx:93–121` (UI form) | API + UI | Gig se vytváří s `status:"draft"` pod projektem ownera; `projectId` je povinná FK – projekt musí existovat a být aktivní. | — |
| R-8.3-02 | Systém musí umožnit publikaci gigu | ✅ | `src/app/api/gigs/[id]/route.ts:86–211` (PATCH `status:"published"`), `src/app/gigs/[id]/gig-detail-actions.tsx:263–272` (owner UI) | API + UI | Přechod `draft → published` nastamfuje `publishedAt`, loguje `gig_published` do activity logu; UI tlačítko dostupné ownerovi. | — |
| R-8.3-03 | Systém musí umožnit procházení a filtrování gigů | ✅ | `src/app/api/gigs/route.ts:26–160` (GET s `q`, `skill`, `genre`, `minBudget`, `maxBudget`, `currency`, `sort`, `order`, `page`), `src/app/gigs/page.tsx:68–272` (browse UI) | API + UI | Full-text, skill/genre filtry, budget range, stránkování. Endpont vrací pouze `published` gigy aktivních projektů. | — |
| R-8.3-04 | Systém musí umožnit odeslání přihlášky na gig (submit application) | ✅ | `src/app/api/gigs/[id]/applications/route.ts:79–203` (POST), `src/app/gigs/[id]/gig-detail-actions.tsx:117–146` (UI) | API + UI | Přihláška přijímána pouze na `published` gig; owner nemůže přihlásit vlastní gig; jedno aktivní podání na (gig, applicant). | — |
| R-8.3-05 | Systém musí umožnit přijetí uchazeče (accept applicant) | ✅ | `src/app/api/applications/[id]/accept/route.ts` (POST; transakce: application→`accepted`, ostatní→`rejected`, gig→`hired`, Hire row vytvořen), `src/app/gigs/[id]/gig-detail-actions.tsx:163–180` (UI) | API + UI | Owner klikne „Accept & hire" → POST /api/applications/[id]/accept → Hire vytvořen, redirect na /hires/[id]. | — |
| R-8.3-06 | Po přijetí uchazeče musí systém provést handoff s omezeným přístupem ke spolupráci | ✅ | `src/app/api/applications/[id]/accept/route.ts` (krok 5: `ProjectMember` row s `memberRole` default `commenter`), `src/app/api/hires/[id]/access/route.ts` (správa role talentu) | API | Hire.memberRole default `commenter` (PRD: restricted access); komentátor nemůže nahrávat soubory ani měnit splity. | — |
| R-8.3-07 | Marketplace neobsahuje recenze a hodnocení | ✅ | `prisma/schema.prisma` (žádný model Review/Rating), celý `src/` (grep bez nálezu) | Schema + src | Žádné entity ani routes pro recenze/hodnocení nejsou přítomny. Exclusion respektována. | — |
| R-8.3-08 | Marketplace neobsahuje milestone workflows | ✅ | `prisma/schema.prisma` (žádný model Milestone), celý `src/` | Schema + src | Exclusion respektována; Hire má HireStatus (`awaiting_start`, `in_progress`, `delivered`, `approved`, `cancelled`) bez milestone dělení. | — |
| R-8.3-09 | Marketplace neobsahuje automatizované centrum pro spory | ✅ | celý `src/` (grep bez nálezu) | src | Žádné dispute routes, modely ani UI. Exclusion respektována. | — |
| R-8.3-10 | Marketplace neobsahuje systém revizních kol | ✅ | celý `src/` (grep bez nálezu pro revision v kontextu gig/hire) | src | Revize existují pouze v kontextu ownership splits (R-8.5), nikoli jako gig revizní kola. Exclusion respektována. | — |
| R-8.3-11 | Marketplace je Stream 2 a není podmínkou prvního customer-ready release | ✅ | `PRD_v2_MUSICCOLLABHUB.md:244` + `docs/audit/requirement-index.md:67` | PRD doc | Architektonické rozhodnutí — Stream 2 je implementován, ale nezablokovává Stream 1 release. | — |
| R-8.3-12 | Každý gig musí patřit pod existující projekt | ✅ | `prisma/schema.prisma:703–706` (`projectId` FK + `onDelete: Cascade`), `src/app/api/projects/[id]/gigs/route.ts:70–76` (project existence check) | Schema + API | Gig bez existujícího aktivního projektu nelze vytvořit; žádná standalone gig route POST neexistuje. | — |
| R-8.3-13 | Profil pro marketplace musí obsahovat: headline, bio, skills, genres, price range a až 10 pracovních ukázek nebo odkazů | 🟡 | `prisma/schema.prisma:66–79` (Profile: `headline`, `bio`, `skills`, `genres`, `priceRange`, rel. `portfolioSamples`); `src/lib/portfolio-samples.ts:1` (`MAX_PORTFOLIO_SAMPLES = 10`); `src/app/api/profile/samples/route.ts:94–105` (limit enforced); `src/app/api/profile/route.ts:59–103` (GET/PUT — `priceRange` **není** exponován ani přijímán) | Schema + API | **Mezera:** Pole `priceRange` existuje v Prisma modelu a je čteno v `/api/auth/me` (řádek 28), ale **chybí** v GET/PUT `/api/profile` (route nečte ani nezapisuje `priceRange`). Uživatel nemůže nastavit price range přes profile API ani přes UI settings/profile. Ostatní pola (headline, bio, skills, genres, až 10 samples) jsou implementovány správně. ⚠️ PRD §8.3 – Portfolio vs. `src/app/api/profile/route.ts:59–103` | — |

---

## Dodatečné RBAC/lifecycle požadavky (ze scope epic 10)

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| RBAC-35 | Stav `draft`: gig existuje, ale není veřejný | ✅ | `src/app/api/gigs/[id]/route.ts:66–69` (non-owner vidí draft jako 404) | API | Draft gig je viditelný pouze ownerovi. | — |
| RBAC-36 | Stav `published`: viditelný, přijímá přihlášky | ✅ | `src/app/api/gigs/route.ts:61` (filter `status:"published"`), `src/app/api/gigs/[id]/applications/route.ts:119–123` | API | — | — |
| RBAC-37 | Stav `hired`: jeden uchazeč byl přijat | ✅ | `src/app/api/applications/[id]/accept/route.ts` (gig→`hired` v transakci) | API | — | — |
| RBAC-38 | Stav `delivered`: talent označil práci za dodanou | ✅ | `prisma/schema.prisma:677` (`HireStatus.delivered`); `src/app/api/hires/[id]/route.ts` | Schema + API | Implementováno přes Hire model; GigStatus nezrcadlí `delivered` (jen HireStatus) — viz RBAC-39. | — |
| RBAC-39 | Stav `approved`: kupující přijal dodání | 🟡 | `prisma/schema.prisma:678` (`HireStatus.approved`), ale `GigStatus` enum (řádek 657–664) **neobsahuje** `approved` ani `delivered` | Schema | **Mezera:** PRD/RBAC index definuje `approved` jako stav gigu; v implementaci jde o stav Hire, nikoli Gig. GigStatus po hire přechází: `published → hired → closed` (nebo zůstane `hired`). Divergence od role-lifecycle spec, i když funkčně pokryta přes Hire. ⚠️ RBAC §6 vs. `prisma/schema.prisma:657–664` | — |
| RBAC-40 | Stav `closed`: finanční a workflow stav dokončení | ✅ | `prisma/schema.prisma:662`, `src/app/api/gigs/[id]/route.ts:138` (`closedAt = new Date()`) | Schema + API | Owner může uzavřít published gig; otevřené přihlášky se expirují. | — |
| RBAC-41 | Stav `cancelled` nebo `suspended` | ✅ | `prisma/schema.prisma:663,664`; admin routes `suspend/route.ts`, `unpublish/route.ts`; creator PATCH | Schema + API + Admin | Oba stavy implementovány; `suspendedAt` timestampován; admin audit trail zaznamenán. | — |
| RBAC-42 | Přihlášky jen na published; po hire uzavřeny; gig pod projektem | ✅ | `src/app/api/gigs/[id]/applications/route.ts:119–123` (published check); `src/app/api/applications/[id]/accept/route.ts` (ostatní submitted→rejected); `prisma/schema.prisma:703` (FK) | API + Schema | — | — |
| RBAC-43 | Jeden talent nesmí mít více aktivních přihlášek na stejný gig | ✅ | `prisma/schema.prisma:738` (`@@unique([gigId, applicantId])`); `src/app/api/gigs/[id]/applications/route.ts:132–149` (existingActive check) | Schema + API | Unique constraint + aplikační validace. | — |
| RBAC-64 | Admin akce `suspend_gig` | ✅ | `prisma/schema.prisma:620`; `src/app/api/admin/gigs/[id]/suspend/route.ts` | Schema + Admin API | Zaznamenává AdminAction s `actionType:"suspend_gig"`. | — |
| RBAC-65 | Admin akce `unpublish_gig` | ✅ | `prisma/schema.prisma:621`; `src/app/api/admin/gigs/[id]/unpublish/route.ts` | Schema + Admin API | Přechod `published → draft`; zaznamenává AdminAction. | — |

---

## Gig SEO / Public Preview

| Aspekt | Status | Důkaz (soubor:řádek) | Mezera / poznámka |
|--------|--------|----------------------|-------------------|
| `generateMetadata` s title, description, canonical URL | ✅ | `src/app/gigs/[id]/page.tsx:102–152` | OG + Twitter card + canonical. |
| `robots: index/follow` pouze pro published | ✅ | `src/app/gigs/[id]/page.tsx:127–129` | Non-published gig → noindex/nofollow. |
| OG image (opengraph-image.tsx) | ✅ | `src/app/gigs/[id]/opengraph-image.tsx:1–150` | Dynamický 1200×630 obraz s title, budget, skills. |
| JSON-LD (JobPosting schema) | ✅ | `src/app/gigs/[id]/page.tsx:154–195` | `@type: JobPosting` se salary, skills, employer. |

---

## Gig Activity Log (lifecycle events)

| Akce | Status | Důkaz (soubor:řádek) |
|------|--------|----------------------|
| `gig_created` | ✅ | `src/app/api/projects/[id]/gigs/route.ts:116–122` |
| `gig_published` | ✅ | `src/app/api/gigs/[id]/route.ts:194–208` |
| `gig_closed` | ✅ | `src/app/api/gigs/[id]/route.ts:194–208` |
| `gig_cancelled` | ✅ | `src/app/api/gigs/[id]/route.ts:194–208` |
| `gig_application_submitted` | ✅ | `src/app/api/gigs/[id]/applications/route.ts:183–189` |
| `gig_application_withdrawn` | ✅ | `prisma/schema.prisma:374` (enum), route `/api/applications/[id]` |
| `gig_application_accepted` | ✅ | `prisma/schema.prisma:375` + accept route |
| `gig_application_rejected` | ✅ | `prisma/schema.prisma:376` + accept route (cascade) |
| `gig_suspended` (admin) | ⚠️ | Admin suspend route zaznamenává `AdminAction` (ne `ActivityLog`); `ActivityAction` enum v schema nemá `gig_suspended`. Admin akce jsou odděleny od project activity logu — záměrné, ale activity log není kompletní pro admin events. |

---

## Shrnutí (Summary)

| Status | Počet |
|--------|-------|
| ✅ Splněno | 20 |
| 🟡 Částečně splněno | 2 |
| ❌ Chybí | 0 |
| ⚠️ Upozornění | 1 |
| **Celkem** | **23** |

### Kritické mezery

1. **R-8.3-13 / `priceRange` (🟡):** Pole existuje v Prisma schématu (`prisma/schema.prisma:73`) a je čteno v `/api/auth/me`, ale `/api/profile` (GET/PUT) `priceRange` neexponuje ani nepřijímá. Uživatel nemůže nastavit svůj price range přes API ani UI. Chybí propojení v `src/app/api/profile/route.ts` a `src/app/settings/profile/profile-form.tsx`.

2. **RBAC-39 / `approved` stav gigu (🟡):** Role-lifecycle spec definuje `GigStatus.approved`, ale enum v implementaci (`prisma/schema.prisma:657–664`) tento stav neobsahuje — `approved` je pouze v `HireStatus`. Funkčně je stav pokryt přes Hire, ale schéma neodpovídá specifikaci.
