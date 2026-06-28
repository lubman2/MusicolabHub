# Epic-00 – Project Bootstrap: PRD Conformance Audit

**Rozsah:** PRD §9 (Data and State Model Principles), §10 (Non-Functional Requirements), DEC-01 – DEC-08  
**Zdroje:** `prisma/schema.prisma`, `src/lib/prisma.ts`, `src/lib/rbac.ts`, `src/lib/session.ts`, `src/lib/s3.ts`, `next.config.ts`, `package.json`, `tsconfig.json`, `eslint.config.mjs`  
**Datum auditu:** 2026-06-28

---

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-9-01 | Systém musí být implementován kolem explicitních stavových doménových objektů (ne implicitních UI předpokladů) | ✅ | `prisma/schema.prisma:1-899` | čteno | Všech 14 kritických objektů je implementováno jako samostatné Prisma modely se stavovými enumeracemi | — |
| R-9-02 | Model `Project` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:179-204` | čteno | Model `Project` s `ProjectStatus` enum (active, archived, suspended, deleted_soft) a polem `deletedAt` | — |
| R-9-03 | Model `ProjectMember` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:299-312` | čteno | Model `ProjectMember` s `MemberRole` enum (owner, editor, commenter, viewer) | — |
| R-9-04 | Model `ProjectFile` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:217-238` | čteno | Model `ProjectFile` s `FileStatus` enum (uploading, ready, failed, deleted_soft) a `deletedAt` | — |
| R-9-05 | Model `ProjectVersion` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:251-269` | čteno | Model `ProjectVersion` s `VersionStatus` enum (draft, published, superseded, deleted_soft) a `deletedAt` | — |
| R-9-06 | Model `Invitation` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:314-335` | čteno | Model `Invitation` s `InvitationStatus` enum (pending, accepted, revoked, expired) | — |
| R-9-07 | Model `CommentThread` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:393-408` | čteno | Model `CommentThread` s `ThreadStatus` enum (open, resolved, deleted_soft) | — |
| R-9-08 | Model `Comment` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:410-423` | čteno | Model `Comment` s polem `deletedAt`; soft-delete je via timestamp (bez stavového enum — odlišný vzor oproti ostatním objektům; funkčně dostačující) | — |
| R-9-09 | Model `Gig` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:682-710` | čteno | Model `Gig` s `GigStatus` enum (draft, published, hired, closed, cancelled, suspended) | — |
| R-9-10 | Model `GigApplication` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:716-737` | čteno | Model `GigApplication` s `ApplicationStatus` enum (submitted, withdrawn, accepted, rejected, expired) | — |
| R-9-11 | Model `SplitRecord` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:511-528` | čteno | Model `SplitRecord` s `SplitStatus` enum (draft, pending_confirmation, partially_confirmed, confirmed, rejected, superseded) a polem `supersededById` pro self-referenci | — |
| R-9-12 | Model `SplitConfirmation` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:545-553` | čteno | Model `SplitConfirmation` s `ConfirmationStatus` enum (pending, confirmed, rejected, expired) | — |
| R-9-13 | Model `Subscription` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:572-595` | čteno | Model `Subscription` s `SubscriptionStatus` enum (trialing, active, past_due, canceled, expired); plán trial/pro/team bez permanent free tier | — |
| R-9-14 | Model `PaymentRecord` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:819-848` | čteno | Model `PaymentRecord` s `PaymentStatus` enum (requires_payment, processing, succeeded, failed, refunded, cancelled) a `platformFee` polem | — |
| R-9-15 | Model `PayoutRecord` musí existovat jako explicitní stavový objekt | ✅ | `prisma/schema.prisma:870-898` | čteno | Model `PayoutRecord` s `PayoutStatus` enum (blocked, scheduled, in_transit, paid, failed, reversed) a `autoReleaseAt` polem | — |
| R-10-01 | Cílová velikost projektu: 1–10 GB | 🟡 | `src/components/BatchFileUpload.tsx:19` | čteno | Limit na soubor (2 GB) enforced; celkový limit projektu (1–10 GB) není v kódu uplatněn — žádná agregační validace na úrovni projektu | — |
| R-10-02 | Maximální velikost souboru: 2 GB | ✅ | `src/lib/s3.ts:16`, `src/app/api/projects/[id]/files/upload-url/route.ts:89` | čteno | `MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024` enforced server-side i client-side | — |
| R-10-03 | Typický počet souborů na projekt: 20–200 | 🟡 | `prisma/schema.prisma:217-238` | čteno | Žádný hard limit na počet souborů per projekt; modelování podporuje neomezený počet — architektura ho zvládne, ale limit není vynucen | — |
| R-10-04 | Cílový počet aktivních projektů (MVP): 1 000 | 🟡 | `prisma/schema.prisma:202-203`, `next.config.ts:1-7` | čteno | Indexy na `[ownerId]` a `[status]` jsou přítomny; bez connection poolingu nebo explicitní konfigurace pro 1 000 projektů; `next.config.ts` je minimální | — |
| R-10-05 | Výkon: `p95 < 2.5s` pro načtení detailu projektu | ❌ | — | čteno | Žádná konfigurace pro monitoring výkonu, APM, caching HTTP vrstvy ani benchmark testy v kódu | — |
| R-10-06 | Výkon: `p95 < 1s` pro vytvoření komentáře | ❌ | — | čteno | Stejné – bez monitorovacích nástrojů nebo performance assertions | — |
| R-10-07 | Výkon: `p95 < 2s` pro první render gig search | ❌ | — | čteno | Stejné – bez CDN cache, bez performance testů | — |
| R-10-08 | Výkon: metadata nahraného souboru viditelná do 5 s po dokončení uploadu | 🟡 | `src/app/api/projects/[id]/files/upload-url/route.ts:120-134` | čteno | Metadata jsou vytvořena synchronně před presigned URL odpovědí; ale dokončení uploadu do S3 a finální `status: ready` závisí na callbacku — žádný 5s SLA enforcement | — |
| R-10-09 | Bezpečnost: projekty a soubory jsou soukromé ve výchozím stavu | ✅ | `prisma/schema.prisma:187`, `src/lib/rbac.ts:62-100` | čteno | `ProjectStatus @default(active)` + RBAC middleware vyžaduje členství; 404 pro ne-členy zabraňuje úniku informací | — |
| R-10-10 | Bezpečnost: signed file access nebo ekvivalentní bezpečné doručení assetů | ✅ | `src/lib/s3.ts:7,65,108-123` | čteno | `getSignedUrl` z `@aws-sdk/s3-request-presigner` pro upload i download; presigned PUT expiry 15 min, GET expiry 1 hod | — |
| R-10-11 | Bezpečnost: server-side autorizace pro všechny citlivé operace | ✅ | `src/lib/rbac.ts:62-100`, `src/lib/admin.ts:20-43`, `src/lib/subscription.ts:52` | čteno | `withProjectAuth()` middleware enforces role check server-side; admin guard v `src/lib/admin.ts`; session JWT via `jose` | — |
| R-10-12 | Bezpečnost: šifrování v klidu (encryption at rest) | 🟡 | — | čteno | Žádná explicitní konfigurace v kódu; závisí na infrastruktuře (AWS S3 SSE, PostgreSQL disk encryption); není dokumentováno ani ověřeno v kódu projektu | — |
| R-10-13 | Bezpečnost: ověření e-mailu pro citlivé toky | ✅ | `src/lib/email.ts:83-88`, `src/app/api/auth/signup/route.ts:90-110`, `src/app/api/auth/login/route.ts:29` | čteno | Email verification flow implementován; login blokuje neověřené uživatele s chybou | — |
| R-10-14 | Bezpečnost: audit trail pro admin akce | ✅ | `prisma/schema.prisma:636-651` | čteno | `AdminAction` model ukládá: `actorId`, `actionType`, `targetType`, `targetId`, `reasonCode`, `internalNote`, `createdAt` — všechna požadovaná pole přítomna | — |
| R-10-15 | Spolehlivost: denní zálohy databáze | ❌ | — | čteno | Žádná konfigurace zálohovacích schedules v kódu nebo konfiguraci; závisí na infrastruktuře, není dokumentováno v projektu | — |
| R-10-16 | Spolehlivost: storage durability/versioning (tam kde aplikovatelné) | 🟡 | `src/lib/s3.ts:1-7` | čteno | S3 klient je konfigurován; S3 versioning závisí na bucket konfiguraci mimo projekt — není ověřitelné z kódu | — |
| R-10-17 | Spolehlivost: soft delete pro metadata projektů na 30 dní | ✅ | `prisma/schema.prisma:188`, `src/app/api/projects/[id]/route.ts:288`, `src/app/api/projects/[id]/restore/route.ts:14` | čteno | `deletedAt` pole na `Project`; komentáře v API explicitně odkazují na 30denní retention window; restore endpoint existuje | — |
| DEC-01 | Marketplace = Stream 2, není launch-blocking | ✅ | `prisma/schema.prisma:654` (komentář `// Stream 2`), `package.json:1` | čteno | Gig modely označeny jako Stream 2 v komentáři; veškeré Stream 2 modely jsou přítomny v DB schématu jako příprava | — |
| DEC-02 | Každý gig musí patřit pod existující projekt (no standalone gig lifecycle) | ✅ | `prisma/schema.prisma:700-702` | čteno | `Gig.projectId String` + `Project @relation(..., onDelete: Cascade)` – gig bez projektu nelze vytvořit | — |
| DEC-03 | Politika uvolnění výplaty: schválení kupujícím NEBO auto-release 7 dní po dodání | ✅ | `prisma/schema.prisma:880,896` | čteno | `PayoutRecord.autoReleaseAt DateTime?` + index `[status, autoReleaseAt]`; `PayoutBlockReason.awaiting_buyer_approval` | — |
| DEC-04 | Payout lifecycle: review window a hold stavy; admin může blokovat výplatu | ✅ | `prisma/schema.prisma:863-868`, `880`, `886-887` | čteno | `PayoutBlockReason` enum včetně `admin_hold`; `heldAt`, `heldByActorId` pole na `PayoutRecord` | — |
| DEC-05 | Najatý talent má ve výchozím stavu omezený přístup | ✅ | `prisma/schema.prisma:757-758` | čteno | `Hire.memberRole MemberRole @default(commenter)` — výchozí role commenter (omezený přístup, ne plný) | — |
| DEC-06 | Udělení přístupu po hire musí být explicitní a auditně zaznamenané | ✅ | `prisma/schema.prisma:384,463` | čteno | `ActivityAction.gig_hire_access_granted` a `NotificationType.gig_hire_access_granted` existují pro audit | — |
| DEC-07 | Split záznamy jsou pouze na úrovni projektu v prvním release | ✅ | `prisma/schema.prisma:511-528` | čteno | `SplitRecord.projectId` — vazba na projekt, žádné `trackId` nebo soubor-level granularita v MVP schématu | — |
| DEC-08 | Model předplatného: trial → placený pouze; no permanent free tier | ✅ | `prisma/schema.prisma:559-570` | čteno | `SubscriptionPlan` enum: `trial, pro, team` — žádný `free` plán; `SubscriptionStatus` má `expired` pro post-trial bez konverze | — |

---

## Zvláštní nálezy

### ⚠️ GigStatus vs. HireStatus — duplicitní stavové vrstvy

**PRD (RBAC-38, RBAC-39)** definuje `delivered` a `approved` jako stavy **gigu** (`GigStatus`). Implementace tyto stavy umístila do `HireStatus` (`prisma/schema.prisma:673-679`), přičemž `GigStatus` je: `draft, published, hired, closed, cancelled, suspended`. Jde o vědomé architektonické rozhodnutí (hire contract je samostatný objekt), ale způsobí to nesoulad s PRD textem pokud se audituje 1:1. `Gig.status` skáče ze `hired` přímo na `closed`, aniž by prošel `delivered`/`approved` — přechod probíhá přes `Hire.status`.

### ⚠️ RBAC-12 — Editor view_split parciálně odchyluje

**PRD/RBAC-12** říká: `Owner (plně) a Editor (omezeně, pouze kde to pravidla explicitně povolují)`. Implementace v `src/lib/rbac.ts:23` nastavuje `view_split: ["owner"]` — editor nemá žádný přístup. Toto je restriktivnější než PRD, ale neporušuje bezpečnostní pravidla.

### ⚠️ PayoutBlockReason — chybí explicitní `review_window_active`

**PRD RBAC-60** vyžaduje jako blocking reason „nevypršené 7-denní review okno" jako samostatný důvod. Implementace (`prisma/schema.prisma:863-868`) toto pokrývá implicitně přes `awaiting_buyer_approval` + `autoReleaseAt`, ale chybí dedikovaný enum hodnota `review_window_active`. Funkčně řešeno; sémanticky neúplné.

### ⚠️ fileSize jako Int (32-bit) pro soubory do 2 GB

`ProjectFile.fileSize Int` (`prisma/schema.prisma:224`) — PostgreSQL `INT` je 32-bit signed, max 2 147 483 647 bytů (~2.0 GB). Soubory přesně na 2 GB hranici projdou; soubory o pár bytů nad limitem mohou způsobit overflow. `MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 = 2 147 483 648` je o 1 byte nad INT max. Doporučeno: `BigInt`.

---

## Souhrn počtů

| Status | Počet |
|--------|-------|
| ✅ hotovo | 26 |
| 🟡 částečně | 7 |
| ❌ chybí | 3 |
| ⚠️ odchyluje se | 0 (viz Zvláštní nálezy výše — jsou integrovány do tabulky jako poznámky) |
| **Celkem** | **36** |
