# PRD Conformance Audit — 2026-06-28

Tento dokument shrnuje výsledky auditního průchodu kódové základny MusicCollabHub oproti kanonickým požadavkům systému. Scope pokrývá 12 epiců (Epic-00 až Epic-12), baseline PRD §8 a §13, Decision Log (DEC-01–DEC-08), Red Team Matrix (SEC-01–SEC-05), a Role Lifecycle Tables (RBAC-01–RBAC-70).

---

## Executive summary

### Per-epic statusy

| Epic | Popis | ✅ | 🟡 | ❌ | ⚠️ |
|------|-------|----|----|----|----|
| Epic-00 | Project Bootstrap (data model, schema, NFR) | 26 | 7 | 3 | 0 |
| Epic-01 | Auth & Onboarding | 16 | 1 | 2 | 0 |
| Epic-02 | Project Hub Core (CRUD, lifecycle) | 4 | 7 | 3 | 0 |
| Epic-03 | File Management & Storage | 13 | 2 | 2 | 1 |
| Epic-04 | Version Management | 8 | 2 | 3 | 1 |
| Epic-05 | Collaboration & Permissions (invitations, RBAC) | 22 | 6 | 6 | 0 |
| Epic-06 | Comments & Activity | 9 | 5 | 1 | 1 |
| Epic-07 | Ownership Splits | 7 | 1 | 2 | 0 |
| Epic-08 | Subscription & Billing | 2 | 6 | 0 | 0 |
| Epic-09 | Admin & Support Tooling | 14 | 1 | 0 | 1 |
| Epic-10 | Marketplace: Gigs & Discovery (Stream 2) | 20 | 2 | 0 | 1 |
| Epic-11 | Marketplace: Hiring & Delivery (Stream 2) | 12 | 1 | 0 | 0 |
| Epic-12 | Marketplace: Payments & Payouts (Stream 2) | 2 | 2 | 0 | 1 |

---

### Launch-blocking mezery (MVP epicy 00–09)

Níže jsou seřazeny od nejkritičtějšího k méně závažnému. Mezery označené ❌ nebo ⚠️ s přímým dopadem na launch Stream 1.

- **❌ KRITICKÉ — SEC-EXTRA-16: `POST /api/billing/checkout` bez autentizace** (`src/app/api/billing/checkout/route.ts:6–13`): Endpoint neprovádí session autentizaci. Přijímá `userId` z request body — libovolný volající může vytvořit Stripe checkout session a upsertovat `Subscription` záznam pro cizí účet, přepsat `stripeCustomerId` nebo aktivovat trial pro cizí uživatele. Ostatní billing endpointy (`portal`, `hires/[id]/checkout`) správně volají `getCurrentUser()`. Toto je **nejzávažnější bezpečnostní nález** v celém auditu.

- **❌ KRITICKÉ — Regrese Prisma 7 (runtime.md)**: `prisma migrate` / `prisma db push` selhává s `P1012` ("datasource property `url` is no longer supported in schema files"). `prisma/schema.prisma:8` stále obsahuje `url = env("DATABASE_URL")` ve starém formátu; `src/lib/prisma.ts:9–13` stále používá constructor option `datasources` (Prisma 6 vzor). CLI migrace a deploy jsou blokovány. **Launch-blocking ops regrese.**

- **❌ R-7.1-04 — Chybí endpoint `/api/auth/verify-email`** (`TESTING.md:44`): Email verification flow je kompletní v DB modelu a na straně odesílání, ale odkaz v ověřovacím emailu míří na neexistující endpoint. V produkci každý nový uživatel zůstane trvale uvězněn ve stavu `unverified` — nemůže se přihlásit ani dokončit onboarding. Testy tuto skutečnost explicitně dokumentují a obcházejí přes test-only route.

- **❌ RBAC-19, AC-03 — Invitation acceptance flow chybí** (`src/lib/email.ts:112`): Odkaz v pozvánkovém emailu vede na neexistující stránku a endpoint (`/invitations/accept?token=...`). Tokenová flow pro přijetí pozvánky — která by měla vytvořit `ProjectMember` s přiřazenou rolí — není implementována. Přijetí pozvánky je slepá ulička, AC-03 selže.

- **❌ DEC-08, RBAC-55, RBAC-56 — Subscription gate chybí na tvůrčích endpointech**: Middleware `withActiveSubscription("write", ...)` existuje v `src/lib/subscription.ts` a je správně implementován, ale **není aplikován na žádný produkční route**: `POST /api/projects`, `POST /api/projects/[id]/files/upload-url`, `PATCH /api/gigs/[id]` (publish). Uživatelé s `past_due`, `canceled` nebo `expired` předplatným mohou bez omezení vytvářet projekty a nahrávat soubory.

- **❌ RBAC-02, R-8.2-06 — Viewer a Commenter blokováni u čtení souborů**: `GET /api/projects/[id]/files` a `GET /api/projects/[id]/files/[fileId]` používají guard `isOwner || isEditor` — vrací 403 pro commenter a viewer, přestože PRD §8.2 a PERMISSIONS matice v `rbac.ts:12` jim explicitně povolují `download_files` a `view_project`.

- **❌ RBAC-10, RBAC-11 — Chybí API endpointy pro správu členů**: Neexistuje `PATCH /api/projects/[id]/members/[userId]` (změna role) ani `DELETE /api/projects/[id]/members/[userId]` (odebrání). Funkce jsou definovány v `rbac.ts` PERMISSIONS matici, ale žádný route handler je neimplementuje.

- **❌ R-11-05 — GDPR delete request nikdy nevykonán**: Workflow žádosti o smazání je dobře navrženo (password confirm → email token → scheduling na `scheduledFor`), ale **neexistuje žádný cron/worker**, který by po uplynutí 30denního okna skutečně smazal nebo anonymizoval uživatelský data. GDPR čl. 17 (right to erasure) nelze fakticky splnit.

- **🟡 KRITICKÉ — `trialEndsAt` není zapisováno při webhookovém zpracování** (`src/app/api/webhooks/stripe/route.ts`): `handleSubscriptionCreated` ani `handleCheckoutSessionCompleted` nezapisují `trialEndsAt` z Stripe subscription objektu. Cron endpoint pro expiry trial porovnává `trialEndsAt < now`, ale v produkci bude pole NULL — trialy tedy nikdy nevyprší přes automatický sweep ani lazy check.

- **🟡 KRITICKÉ — withProjectAuth / PERMISSIONS matice je mrtvý kód** (`src/lib/rbac.ts`): Celá PERMISSIONS matice a middleware `withProjectAuth` jsou definovány ale **nikde volány** (`grep` přes `src/app/api/` bez nálezu). Všechny routes implementují vlastní ad-hoc auth logiku, která neodráží matici věrně — způsobuje systematický drift mezi specifikací a implementací.

- **🟡 — UI verze management neúplné** (Epic-04): Chybí UI vstupní body pro (a) vytvoření draft verze, (b) publikaci verze tlačítkem, (c) smazání verze. Uživatel nemůže provést celý versioning workflow bez přímého API volání.

- **🟡 — AC-05, R-8.5 — Submit button chybí v UI split editoru** (`src/app/projects/[id]/splits/[splitId]/page.tsx`): API `POST .../submit` existuje a je implementováno, ale UI stránka neobsahuje tlačítko ani volání na tento endpoint. End-to-end tok AC-05 je přerušen.

- **🟡 — R-8.4-06 — Platform fee není skutečně strhnut Stripem** (Epic-12): `calcPlatformFee` fee vypočítá a uloží do `PaymentRecord.platformFee`, ale checkout session nepoužívá `application_fee_amount` — Stripe fee nedrží. Při release se odesílá talentu plná částka bez strhnutí. Účetní odchylka od PRD.

- **🟡 — R-8.4-07 — Auto-release payout po 7 dnech není exekuováno** (Epic-12): `autoReleaseAt` je správně vypočítán a uložen, ale žádný cron job ani endpoint tento timestamp nekontroluje. `vercel.json` registruje pouze `/api/cron/expire-trials`. Automatické uvolnění výplaty existuje pouze jako datový field.

---

### Top security & RBAC rizika

1. **SEC-EXTRA-16 (❌ kritické) — Billing/checkout bez autentizace**: `POST /api/billing/checkout` přijímá `userId` z body bez session ověření — IDOR/privilege escalation na billing stav libovolného uživatele. Viz výše.

2. **RBAC-10, RBAC-11 (❌) — Chybějící member management API**: Bez `PATCH /members/[id]` a `DELETE /members/[id]` nelze správci projektů měnit role ani odebírat spolupracovníky — klíčové pro lifecycle projektu.

3. **RBAC-19 (❌) — PERMISSIONS matice mrtvý kód**: `withProjectAuth` a celá matice jsou definovány ale nikde nevolány. Drift mezi specifikací a implementací je systematický.

4. **RBAC-02, R-8.2-05, R-8.2-06 (❌) — File reads 403 pro viewer/commenter**: Ad-hoc `isOwner || isEditor` guard blokuje role s read-only přístupem, což je v přímém rozporu s PRD §8.2.

5. **R-7.1-04 (❌) — Chybí `/api/auth/verify-email`**: Viz výše. V produkci nelze ověřit email — onboarding je zablokován pro všechny nové uživatele.

6. **RBAC-19, AC-03 (❌) — Chybějící invitation-accept flow**: `/invitations/accept` stránka ani endpoint neexistují. Tato mezera přímo blokuje kolaborativní onboarding.

7. **RBAC-55, RBAC-56, DEC-08 (❌) — Subscription enforcement mrtvý kód**: `withActiveSubscription` middleware existuje, ale není napojen na žádné tvůrčí routes — fakticky žádné paywall.

8. **R-11-05 (❌) — GDPR delete nikdy nevykonán**: Viz výše. Compliance riziko.

9. **SEC-EXTRA-19 (🟡) — Rate limiting pouze na signup (in-memory)**: Login, forgot-password a reset-password nemají rate limiting. In-memory limiter se resetuje při restartu — multi-instance prostředí bez Redis ho efektivně obchází.

10. **Admin bypass nekonzistentní**: `authorizeProjectMember()` nekontroluje `user.role === "admin"` — admin bez projektového členství selže v comment, resolve a activity routes. Pouze invitation/restrict/admin routes mají explicitní bypass.

---

## §8.1 Project Hub

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.1-01 | Systém musí podporovat upload souborů `.mp3` | ✅ | `src/app/api/projects/[id]/files/upload-url/route.ts:13` (`"audio/mpeg"`) + `src/components/file-upload.tsx:18` | čteno | Plně implementováno; MIME + extension validation shodné. | — |
| R-8.1-02 | Systém musí podporovat upload souborů `.wav` | ✅ | `upload-url/route.ts:14-16` (aliasy `audio/wav`, `audio/wave`, `audio/x-wav`) + `file-upload.tsx:19-21` | čteno | Tři MIME aliasy pokryty. | — |
| R-8.1-03 | Systém musí podporovat upload souborů `.aiff` | ✅ | `upload-url/route.ts:17-18` (`audio/aiff`, `audio/x-aiff`) + `file-upload.tsx:22-23` | čteno | Dva MIME aliasy pokryty. | — |
| R-8.1-04 | Systém musí podporovat upload souborů `.zip` | ✅ | `upload-url/route.ts:19-20` (`application/zip`, `application/x-zip-compressed`) + `file-upload.tsx:24-25` | čteno | Dva MIME aliasy pokryty. | — |
| R-8.1-05 | Systém musí podporovat upload souborů `.pdf` | ✅ | `upload-url/route.ts:21` + `file-upload.tsx:26` | čteno | Plně implementováno. | — |
| R-8.1-06 | Systém musí podporovat upload souborů `.txt` | ✅ | `upload-url/route.ts:22` + `file-upload.tsx:27` | čteno | Plně implementováno. | — |
| R-8.1-07 | Systém musí podporovat upload souborů `.docx` | ✅ | `upload-url/route.ts:23` + `file-upload.tsx:28` | čteno | Plně implementováno. | — |
| R-8.1-08 | Systém musí podporovat upload souborů `.png` | ✅ | `upload-url/route.ts:24` + `file-upload.tsx:29` | čteno | Plně implementováno. | — |
| R-8.1-09 | Systém musí podporovat upload souborů `.jpg` | ✅ | `upload-url/route.ts:25` + `file-upload.tsx:30` | čteno | Plně implementováno; `.jpeg` alias také přítomen. | — |
| R-8.1-10 | UI musí umožnit hromadný upload více souborů najednou | ✅ | `file-upload.tsx:54-73` + `file-upload.tsx:219` (`<input multiple>`) | čteno | Drag-and-drop i file picker podporují výběr více souborů. | — |
| R-8.1-11 | Backend musí zpracovávat soubory individuálně (per-file) | ✅ | `upload-url/route.ts:38-149` + `confirm/route.ts:7-123` | čteno | Každý soubor prochází vlastní sekvencí `POST /upload-url` → S3 PUT → `POST /confirm`. | — |
| R-8.1-12 | Chyba jednoho souboru v dávce nesmí způsobit selhání celé dávky | ✅ | `file-upload.tsx:68-73` (per-file catch) | čteno | Selhání jednoho souboru nastavuje pouze jeho vlastní stav na `error`. | — |
| R-8.1-13 | Verze jsou pojmenované snapshoty (named snapshots) | ✅ | `prisma/schema.prisma:255` (pole `name String`); `versions/route.ts:144` (validace); `versions/[versionId]/route.ts:53–61` | čteno | Každá verze nese název, stav, autora, timestamp a seznam souborů. | — |
| R-8.1-14 | V MVP se neimplementuje git-like merge logika | ✅ | `prisma/schema.prisma:251–269` — žádné parent/merge relace; `versions/route.ts:173–199` — create pouze zakládá nový draft | čteno | Žádný merge mechanismus v kódu nenalezen. | — |
| R-8.1-15 | Každá verze musí obsahovat: autora, časové razítko, changelog a seznam souborů | ✅ | `prisma/schema.prisma:253–261` — pole `authorId`, `createdAt`, `publishedAt`, `changelog`, `files` | čteno | Všechny čtyři prvky přítomny v DB i API response. | — |
| R-8.1-16 | Publikovat verze může pouze owner a editor | ✅ | `versions/[versionId]/route.ts:165–176` — PATCH kontroluje `isOwner || isEditor` | čteno | Role check správný pro owner a editor; Admin bez membership nemá explicitní bypass (viz RBAC-04). | — |
| R-8.1-17 | Komentáře jsou plain-text vlákna (comment threads) | ✅ | `prisma/schema.prisma:393–423` — modely `CommentThread` + `Comment` s polem `body String` | čteno | Plně implementováno; transakce vytváří vlákno a první komentář. | — |
| R-8.1-18 | Komentáře mohou cílit na projekt, soubor nebo verzi | ✅ | `prisma/schema.prisma:347–351` — enum `TargetType { project, file, version }`; `comments/route.ts:65,143–167` | čteno | Všechny tři cíle podporovány a ověřovány. | — |
| R-8.1-19 | Waveform komentáře s časovým razítkem nejsou v MVP povinné | ✅ | `prisma/schema.prisma:393–423` — žádné pole pro waveform timestamp v modelu `Comment` | čteno | Správně vynecháno. | — |
| R-8.1-20 | Real-time model je pouze lightweight event delivery (polling, refresh nebo WebSocket) | ✅ | `notification-bell.tsx:30,60–66` — polling interval `60 000 ms`; žádné WebSocket spojení | čteno | Implementováno jako polling (60 s), odpovídá PRD. | — |
| R-8.1-21 | Live sync editace není součástí MVP | ✅ | Žádný WebSocket ani live-editor kód v repozitáři | čteno | Splněno vynecháním. | — |

---

## §8.2 Permissions

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.2-01 | Projektové role jsou: Owner, Editor, Commenter, Viewer | ✅ | `prisma/schema.prisma:285-290` enum `MemberRole { owner editor commenter viewer }` | čteno | Čtyři PRD role jsou přesně implementovány jako Prisma enum. | — |
| R-8.2-02 | V MVP může pozvánky ke spolupráci zasílat pouze owner | ✅ | `src/app/api/projects/[id]/invitations/route.ts:34` — `project.ownerId !== user.id && user.role !== "admin"` → 403 | čteno | Správný server-side check; admin bypass je přípustný. | — |
| R-8.2-03 | Spravovat ownership splity může pouze owner | ✅ | `src/app/api/projects/[id]/splits/route.ts:91` — `project.ownerId !== user.id` → 403 při POST | čteno | Vytvoření splitu blokováno pro non-owner. | — |
| R-8.2-04 | Editor může nahrávat soubory a publikovat verze | ✅ | `src/app/api/projects/[id]/files/upload-url/route.ts:116` `!isOwner && !isEditor` → 403; `versions/[versionId]/route.ts:172` stejný vzor | čteno | Upload a publikace správně omezeny na owner+editor. | — |
| R-8.2-05 | Commenter má pouze přístup ke čtení a přidávání komentářů | 🟡 | `src/app/api/projects/[id]/files/route.ts:37-39` — commenter dostane 403 při listování souborů | čteno | Komentáře fungují správně. Read přístup k souborům pro commenter není implementován — `GET /files` blokuje commenter (viz RBAC-02). | — |
| R-8.2-06 | Viewer má přístup pouze ke čtení | ❌ | `src/app/api/projects/[id]/files/route.ts:37-39` — viewer dostane 403; `versions/route.ts:45` — verze taktéž jen owner+editor | čteno | Viewer role existuje v DB ale žádný čtecí endpoint (soubory, verze) viewer aktivně nepropouští. Jen metadata projektu jsou přístupná. | — |
| R-8.2-07 | Soubory projektu jsou standardně soukromé (private by default) | ✅ | `src/app/api/projects/[id]/files/route.ts:12-39` — vždy vyžaduje auth + projektové členství | čteno | Neexistuje veřejný endpoint; všechny routes ověřují auth. | — |
| R-8.2-08 | Najatý talent (hired talent) ve výchozím stavu nezíská plný přístup k projektu | ✅ | `src/app/api/applications/[id]/accept/route.ts:173-186` — upsert role `"commenter"` | čteno | Po přijetí přihlášky talent dostane roli commenter, nikoli editor nebo owner. | — |
| R-8.2-09 | Owner musí explicitně udělit širší přístup k assetům najatému talentu | ✅ | `src/app/api/hires/[id]/access/route.ts:73-78` — pouze buyer (owner) může měnit roli; `HIRE_GRANTABLE_ROLES` omezeno na viewer/commenter/editor | čteno | Explicitní udělení je implementováno a logováno (`gig_hire_access_granted`). | — |

---

## §8.3 Marketplace

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.3-01 | Systém musí umožnit vytvoření draftu gigu pod existujícím projektem | ✅ | `src/app/api/projects/[id]/gigs/route.ts:62–124` (POST), `src/app/projects/[id]/gigs/new/page.tsx:93–121` (UI form) | API + UI | Gig se vytváří s `status:"draft"` pod projektem ownera; `projectId` povinná FK. | — |
| R-8.3-02 | Systém musí umožnit publikaci gigu | ✅ | `src/app/api/gigs/[id]/route.ts:86–211` (PATCH `status:"published"`), UI tlačítko dostupné ownerovi | API + UI | Přechod `draft → published` loguje `gig_published` do activity logu. | — |
| R-8.3-03 | Systém musí umožnit procházení a filtrování gigů | ✅ | `src/app/api/gigs/route.ts:26–160` (GET s `q`, `skill`, `genre`, `minBudget`, `maxBudget`, `sort`, `page`), `src/app/gigs/page.tsx:68–272` | API + UI | Full-text, skill/genre filtry, budget range, stránkování; pouze `published` gigy aktivních projektů. | — |
| R-8.3-04 | Systém musí umožnit odeslání přihlášky na gig | ✅ | `src/app/api/gigs/[id]/applications/route.ts:79–203` (POST), `src/app/gigs/[id]/gig-detail-actions.tsx:117–146` (UI) | API + UI | Přihláška přijímána pouze na `published` gig; owner nemůže přihlásit vlastní gig; jedno aktivní podání na (gig, applicant). | — |
| R-8.3-05 | Systém musí umožnit přijetí uchazeče (accept applicant) | ✅ | `src/app/api/applications/[id]/accept/route.ts` (transakce: application→`accepted`, ostatní→`rejected`, gig→`hired`, Hire vytvořen) | API + UI | Atomická transakce; UI tlačítko „Accept & hire". | — |
| R-8.3-06 | Po přijetí uchazeče musí systém provést handoff s omezeným přístupem ke spolupráci | ✅ | `src/app/api/applications/[id]/accept/route.ts` (krok: `ProjectMember` row s `memberRole` default `commenter`) | API | Hire.memberRole default `commenter` (restricted access). | — |
| R-8.3-07 | Marketplace neobsahuje recenze a hodnocení | ✅ | `prisma/schema.prisma` — žádný model Review/Rating | Schema | Exclusion respektována. | — |
| R-8.3-08 | Marketplace neobsahuje milestone workflows | ✅ | `prisma/schema.prisma` — žádný model Milestone | Schema | Exclusion respektována; Hire má lineární state machine. | — |
| R-8.3-09 | Marketplace neobsahuje automatizované centrum pro spory | ✅ | celý `src/` — žádné dispute routes nebo modely | src | Exclusion respektována. | — |
| R-8.3-10 | Marketplace neobsahuje systém revizních kol | ✅ | celý `src/` — žádný revision v kontextu gig/hire | src | Exclusion respektována. | — |
| R-8.3-11 | Marketplace je Stream 2 a není podmínkou prvního customer-ready release | ✅ | `prisma/schema.prisma:654` (komentář `// Stream 2`); `PRD_v2_MUSICCOLLABHUB.md:244` | PRD doc + schema | DEC-01 uzamčeno; Stream 2 nezablokovává Stream 1. | — |
| R-8.3-12 | Každý gig musí patřit pod existující projekt | ✅ | `prisma/schema.prisma:683` (`Gig.projectId` NOT NULL, FK, `onDelete: Cascade`) | Schema + API | Gig bez existujícího aktivního projektu nelze vytvořit. | — |
| R-8.3-13 | Profil pro marketplace musí obsahovat: headline, bio, skills, genres, price range a až 10 pracovních ukázek | 🟡 | `prisma/schema.prisma:66–79` (Profile: všechna pole); `src/app/api/profile/route.ts:59–103` — `priceRange` **není** exponováno ani přijímáno | Schema + API | Pole `priceRange` existuje v DB a vrací se v `/api/auth/me`, ale chybí v `PUT /api/profile` a v settings UI. Uživatel nemůže `priceRange` nastavit přes žádný self-serve endpoint. | — |

---

## §8.4 Payments

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.4-01 | Předplatné funguje modelem trial → placené plány (bez trvalého free tieru po skončení trialu) | ✅ | `src/lib/stripe.ts:32` (`TRIAL_PERIOD_DAYS=14`); `src/lib/trial-expiry.ts:80–88`; `prisma/schema.prisma:565–570` (enum nemá `free`) | čteno | Trial → paid model implementován; expiry pipeline správně přechází do `expired`. | — |
| R-8.4-02 | Neúspěšná platba přesune uživatele do stavu `past_due` | ✅ | `src/app/api/webhooks/stripe/route.ts:302–344` (`handleInvoicePaymentFailed`); `prisma/schema.prisma:568` (enum `past_due`) | čteno | Oba relevantní webhook event typy přechází subscription do `past_due`. | — |
| R-8.4-03 | Po uplynutí grace period může být blokován upload nových souborů, projektů a publikace gigů | 🟡 | `src/lib/subscription.ts:89–112` (`withActiveSubscription`); `src/app/api/webhooks/stripe/route.ts:18` (`GRACE_PERIOD_DAYS=7`) | čteno | Middleware existuje a správně blokuje write přístup po grace period, ale **není aplikován na žádný API route** pro upload, project create ani gig publish. Enforcement je mrtvý kód. | — |
| R-8.4-04 | Platby na marketplace jsou vybírány přes Stripe | ✅ | `src/app/api/hires/[id]/checkout/route.ts:117` – `stripe.checkout.sessions.create`; webhook handler reconciluje `checkout.session.completed` | čteno | Plně implementováno: Stripe Checkout session, PaymentRecord upsert, webhook reconciliace. | — |
| R-8.4-05 | Výplaty (payouts) jsou směrovány přes Stripe Connect | 🟡 | `src/app/api/connect/onboarding/route.ts:36`; `src/app/api/admin/payouts/[id]/release/route.ts:93` – `stripe.transfers.create` | čteno | Routing přes Stripe Connect implementován. **Odchylka:** checkout session nepoužívá `application_fee_amount` ani `transfer_data.destination` — platformový poplatek není automaticky strhnut na straně Stripe. | — |
| R-8.4-06 | Platformový poplatek (platform fee) je stržen při úspěšné platbě | ⚠️ | `src/lib/payments.ts:7,19` (`DEFAULT_PLATFORM_FEE_BPS = 1000`); `src/app/api/hires/[id]/checkout/route.ts:95` — fee uložen do DB; chybí `application_fee_amount` v Stripe session | čteno | Fee je vypočítán a uložen do `PaymentRecord.platformFee`, ale **není skutečně strhnut Stripem** při platbě. `stripe.transfers.create` odesílá talentu plnou částku. Účetní odchylka od PRD. | — |
| R-8.4-07 | Výplata je uvolněna na základě schválení kupujícím nebo automaticky 7 dní po dodání | 🟡 | `src/app/api/hires/[id]/route.ts:314-323` — `autoReleaseAt` nastaveno při `delivered`; buyer approval path funkční; `vercel.json` neobsahuje `/api/cron/release-payouts` | čteno | Buyer-approval path je funkční. `autoReleaseAt` je uložen, ale **žádný cron job ho nekontroluje** — automatické uvolnění po 7 dnech se nekoná. | — |
| R-8.4-08 | Admin/support může pozastavit výplatu (hold) před jejím uvolněním | ✅ | `src/app/api/admin/payouts/[id]/hold/route.ts:1-86` — admin-only, `blockReason: "admin_hold"`, `heldAt`, `heldByActorId`, `AdminAction` záznam | čteno | Admin hold plně implementován s audit logem a ochranou před přepsáním buyer approvalem. | — |

---

## §8.5 Ownership and Contributor Records

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.5-01 | Owner vytváří draft splitu | ✅ | `splits/route.ts:74–126` — POST autorizace `project.ownerId !== user.id` → 403; `splits/page.tsx:162–170` — tlačítko „New Draft Split" | čteno | Vytvoření draftu owner-only, plně implementováno v API i UI. | — |
| R-8.5-02 | V prvním customer-ready release jsou splity pouze na úrovni projektu (ne track-level) | ✅ | `prisma/schema.prisma:511–528` — `SplitRecord` má pouze `projectId`, žádné `trackId` | čteno | Pouze project-level split. | — |
| R-8.5-03 | Celkový split musí dávat 100 % před odesláním | ✅ | `splits/[splitId]/submit/route.ts:57–70` — `totalCents !== 10000` → 422; celočíselná aritmetika | čteno | Validace 100% v transakční bráně; float-safe implementace. | — |
| R-8.5-04 | Přispěvatelé s nenulovým podílem musí split potvrdit | ✅ | `splits/[splitId]/submit/route.ts:45–53` — filtr `nonZeroContributors`; `confirmations/*` implementují PUT | čteno | Pouze přispěvatelé s nenulovým podílem obdrží konfirmační záznam. | — |
| R-8.5-05 | Potvrzené splity nelze editovat přímo (in place) | ✅ | `splits/[splitId]/contributors/route.ts:33–38` — guard `split.status !== "draft"` → 409; UI skrývá formulář pro ne-draft | čteno | Všechny mutační endpointy blokovány pro ne-draft stavy. | — |
| R-8.5-06 | Změny splitu vyžadují novou revizi, která nahrazuje předchozí | ✅ | `splits/route.ts:100–123` — POST propojuje nový draft přes `supersedes`; transakce nastavuje předchozí na `superseded` | čteno | Revision chain je atomicky udržována; UI zobrazuje historii revizí. | — |
| R-8.5-07 | Systém je záznamy o přispěvatelích a potvrzením – nikoli ingestion royalties ani právním vymáháním | ✅ | `prisma/schema.prisma:492–553` — modely neobsahují žádné royalty, payout ani legal pole | čteno | Systém striktně omezen na záznamy a potvrzení. | — |

---

## §8.6 Admin and Support

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.6-01 | Interní nástroje musí umožnit vyhledání uživatelů, projektů, gigů, plateb a výplat | ✅ | `src/app/api/admin/users/route.ts:28`; `projects/route.ts:28`; `gigs/route.ts:37`; `payments/route.ts:36`; `payouts/route.ts:27` | čteno | Všechny pět entit mají dedikované GET endpointy s full-text search, filtrováním a stránkováním. | — |
| R-8.6-02 | Interní nástroje musí umožnit pozastavení účtu (account suspension) | ✅ | `src/app/api/admin/users/[id]/suspend/route.ts:78-94` + `unsuspend/route.ts:74-90` | čteno | Suspend i unsuspend implementovány; transakce zajišťuje atomicitu stavu a audit záznamu. | — |
| R-8.6-03 | Interní nástroje musí umožnit zrušení publikace nebo pozastavení gigu | ✅ | `src/app/api/admin/gigs/[id]/unpublish/route.ts:55-73`; `gigs/[id]/suspend/route.ts:62-79` | čteno | Obě akce implementovány. Restore reverze také přítomna. | — |
| R-8.6-04 | Interní nástroje musí umožnit omezení přístupu k projektu | ✅ | `src/app/api/admin/projects/[id]/restrict/route.ts:61-77`; `projects/[id]/restore/route.ts:53-67` | čteno | Restrict a restore pair implementovány; oba zapisují AdminAction. | — |
| R-8.6-05 | Interní nástroje musí poskytovat viditelnost audit trailu | ✅ | `src/app/api/admin/audit/route.ts:106-183`; `src/app/admin/audit/page.tsx:106-373` | čteno | Filtrovatelný + stránkovaný audit log s CSV exportem (max 5 000 řádků). | — |
| R-8.6-06 | Interní nástroje musí umožnit kontrolu stavu výplat a KYC | ✅ | `src/app/api/admin/payouts/route.ts:27`; `users/[id]/kyc/route.ts:20-45`; `admin/users/[id]/page.tsx:49-255` | čteno | Payouts endpoint vrací `connectAccount` s KYC daty; separátní KYC endpoint. | — |

---

## §13 Acceptance Criteria

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| AC-01 | Vytváření projektu musí fungovat end-to-end (happy path, edge case, failure state, auditability) | 🟡 | `src/app/api/projects/route.ts:184–211`; `src/app/projects/new/page.tsx:23–75` | čteno | Happy path a edge case validace implementovány; `logActivity("project_created")` přítomno. Mezera: POST nevyvolává `withActiveSubscription` — projekt lze vytvořit i při `past_due`/`expired`. | — |
| AC-02 | Upload souborů s ukládáním a persistencí metadat musí fungovat end-to-end | ✅ | `upload-url/route.ts:121-148` (metadata-first zápis) + `confirm/route.ts:98-122` (HeadObject → ready + activity log) | čteno | Kompletní flow; metadata persistována ihned při zahájení uploadu. | — |
| AC-03 | Pozvání a přijetí spolupracovníka musí fungovat end-to-end | ❌ | Vytvoření pozvánky + email fungují; `/invitations/accept` endpoint a stránka chybí | čteno | Happy path je neúplný — RBAC-19 není implementováno; přijetí pozvánky je slepá ulička. | — |
| AC-04 | Vytvoření komentáře s autorizací musí fungovat end-to-end | ✅ | `src/app/api/projects/[id]/comments/route.ts` + `replies/route.ts`; authorizeProjectMember | čteno | Komentáře fungují end-to-end; role check správný. | — |
| AC-05 | Vytvoření a potvrzení ownership splitu musí fungovat end-to-end | 🟡 | API chain implementován; UI stránka `splits/[splitId]/page.tsx` neobsahuje tlačítko „Submit for Confirmation"; `submit/route.ts:111` — TODO notifikace | čteno | API kompletní. UI vstupní bod (Submit button) zcela chybí → end-to-end tok přerušen pro běžného uživatele. Notifikace přispěvatelů chybí. | — |
| AC-06 | Reconciliace stavu předplatného (subscription payment state reconciliation) musí fungovat end-to-end | 🟡 | `src/app/api/webhooks/stripe/route.ts` (idempotence, signature check, handlery) | čteno | Webhook pipeline robustní. Kritická mezera: `trialEndsAt` není zapisováno při webhookovém zpracování → trialy v produkci nikdy nevyprší automaticky. | — |
| AC-07 | Každá launch-critical schopnost musí mít pokrytý happy path | 🟡 | viz výše pro jednotlivé AC | čteno | Happy path pro create project, upload, comment OK. Invitation accept a split submit přerušeny. | — |
| AC-08 | Každá launch-critical schopnost musí mít pokryté edge case handling | 🟡 | `src/app/api/projects/route.ts:128–182` | čteno | Validace metadat implementovány. Chybí edge case pro nedostatečné předplatné (subscription gate není přiřazen). | — |
| AC-09 | Každá launch-critical schopnost musí mít pokryté failure state handling | 🟡 | `src/app/api/projects/route.ts:118–126`; `src/app/projects/new/page.tsx:58–68` | čteno | Failure states pokryty pro neplatný input. Chybí failure state pro nedostatečné předplatné. | — |
| AC-10 | Každá launch-critical schopnost musí být auditovatelná | ✅ | `logActivity` voláno při `project_created`, `project_archived`, `project_restored`, `project_deleted`, `comment_added`, `gig_published`, atd. | čteno | Activity logging implementován pro všechny kritické akce. | — |
| AC-11 | Stream 2: publikace gigu a jeho discovery musí fungovat end-to-end | ✅ | `src/app/api/projects/[id]/gigs/route.ts` + `src/app/api/gigs/route.ts` + `src/app/gigs/page.tsx` | čteno | Plně implementováno end-to-end. SEO metadata, JSON-LD, OG image. | — |
| AC-12 | Stream 2: přihláška na gig a hire handoff musí fungovat end-to-end | ✅ | `src/app/api/gigs/[id]/applications/route.ts` + `src/app/api/applications/[id]/accept/route.ts` | čteno | Plně implementováno; hire handoff s commenter default. | — |
| AC-13 | Stream 2: reconciliace stavu marketplace platby a výplaty musí fungovat end-to-end | 🟡 | `src/app/api/webhooks/stripe/route.ts:388–640` (marketplace handlers); `admin/payouts/[id]/release/route.ts` | čteno | Webhook reconciliace funguje. Mezery: platform fee není skutečně strhnut Stripem; auto-release po 7 dnech bez cron jobu. | — |

---

## Průřez: Security

| ID | Scénář / kontrola | Status | Důkaz (soubor:řádek) | Úroveň | Riziko / poznámka | Issue# |
|----|-------------------|--------|----------------------|--------|-------------------|--------|
| SEC-01 | Marketplace je klasifikován jako Stream 2 — delivery scope nesmí explodovat | ✅ | `requirement-index.md:139` — DEC-01 uzamčeno; kód neobsahuje Feature Flag blokující Stream 1 | čteno | Splněno na úrovni rozhodnutí. | — |
| SEC-02 | Každý gig patří pod existující projekt | ✅ | `src/app/api/projects/[id]/gigs/route.ts` — gig pod `:projectId`; Prisma FK not-null | čteno | Databázová integrita i API vrstva vyžadují existující projekt. | — |
| SEC-03 | Politika uvolnění výplaty uzamčena: schválení kupujícím NEBO auto 7 dní po dodání | ✅ | `src/app/api/hires/[id]/route.ts:315–324` — `autoReleaseDeadline` nastaveno; `admin/payouts/[id]/release/route.ts` | čteno | Payout lifecycle implementuje obě větve (buyer approval + 7-day auto field). | — |
| SEC-04 | Najatý talent dostane ve výchozím stavu omezený přístup | ✅ | `src/app/api/hires/[id]/access/route.ts:22–26`; `src/lib/hires.ts` `HIRE_GRANTABLE_ROLES` vylučuje `owner` | čteno | PRD §8.2 a Red Team §4 implementováno. | — |
| SEC-05 | Čtyři rozhodnutí uzamčena před zápisem backlogu | ✅ | `requirement-index.md:228–234` — DEC-01..DEC-06 existují; kód konzistentní | čteno | Všechna čtyři rozhodnutí jsou uzamčena a reflektována v kódu. | — |
| SEC-EXTRA-01 | JWT HS256, httpOnly cookie, secure v produkci, sameSite=lax, 7-denní expiry | ✅ | `src/lib/session.ts:18–46` — jose SignJWT/jwtVerify, atributy správně nastaveny | čteno | Robustní implementace. | — |
| SEC-EXTRA-02 | Stripe webhook signature verification | ✅ | `src/app/api/webhooks/stripe/route.ts:22–35` — raw body, `stripe-signature` header, `constructEvent()` | čteno | Kompletní HMAC verifikace. | — |
| SEC-EXTRA-03 | Webhook idempotence | ✅ | `webhooks/stripe/route.ts:37–43` — `paymentEvent.findUnique({ where: { stripeEventId } })` | čteno | Idempotentní kontrola přítomna. | — |
| SEC-EXTRA-04 | IDOR na projektech | ✅ | `projects/[id]/route.ts:28–66` — `loadAuthorizedProject()` ověřuje ownerId nebo membership; 404 pro ne-členy | čteno | Informace neunikají — 404 místo 403 pro cizí projekty. | — |
| SEC-EXTRA-05 | IDOR na souborech | ✅ | `files/[fileId]/route.ts:20–42,72` — projekt ověřen; `file.projectId !== projectId` → 404 | čteno | Soubor nemůže být načten přes cizí `projectId`. | — |
| SEC-EXTRA-06 | IDOR na verzích | ✅ | `versions/[versionId]/route.ts:31–49,99–101` — projekt ověřen; draft verze → 404 pro ne-editora | čteno | Verze jsou skryty (draft→404) pro neoprávněné. | — |
| SEC-EXTRA-07 | IDOR na splitech | ✅ | `splits/[splitId]/route.ts:35` — `findFirst({ where: { id: splitId, projectId } })` | čteno | SplitId vždy ověřen vůči `projectId`. | — |
| SEC-EXTRA-08 | IDOR na gigech — draft gigy skryty | ✅ | `gigs/[id]/route.ts:66–69` — ne-owner + status ≠ published → 404 | čteno | Draft gigy nejsou viditelné neoprávněným. | — |
| SEC-EXTRA-09 | IDOR na aplikacích | ✅ | `applications/[id]/route.ts:58–63` — `isOwner || isApplicant`; jinak → 404 | čteno | Správná granularita. | — |
| SEC-EXTRA-10 | IDOR na hire | ✅ | `hires/[id]/route.ts:71–75` — `isParty = buyerId === user.id || talentId === user.id || role === "admin"`; jinak → 404 | čteno | Správně omezeno na strany kontraktu. | — |
| SEC-EXTRA-11 | IDOR na split confirmacích | ✅ | `confirmations/[confirmationId]/confirm/route.ts:47–50` — `contributor.userId !== user.id` → 403 | čteno | Jen správný přispěvatel může potvrdit. | — |
| SEC-EXTRA-12 | Autorizace admin routes | ✅ | `admin/users/[id]/suspend/route.ts:18–19`; vzorový `if (actor.role !== "admin") → 403` ve všech admin routes | čteno | Admin role check konzistentní. | — |
| SEC-EXTRA-13 | Input validace na POST/PATCH bodies | ✅ | `projects/[id]/route.ts:5–12` — délkové konstanty; `upload-url/route.ts:12–93` — MIME/extension whitelist | čteno | Validace přítomna a detailní. | — |
| SEC-EXTRA-14 | MIME type / extension spoofing při uploadu | ✅ | `upload-url/route.ts:12–93` — `ALLOWED_EXTENSIONS` i `ALLOWED_MIME_TYPES` whitelisty; obě musí souhlasit | čteno | Dvojitá kontrola. | — |
| SEC-EXTRA-15 | S3 presigned URL scoping — `s3Key` únik | 🟡 | `upload-url/route.ts:146` — response obsahuje raw `s3Key` | čteno | Nízké riziko (bucket privátní, klíč sám bez signatury bezcenný), ale key zbytečně prosakuje klientovi. | — |
| SEC-EXTRA-16 | **Billing/checkout IDOR — `POST /api/billing/checkout` bez autentizace** | ❌ | `src/app/api/billing/checkout/route.ts:6–13` — žádná session autentizace; `userId` z body | čteno | **KRITICKÉ.** Libovolný volající může přepsat billing stav cizího uživatele. `billing/portal` a `hires/[id]/checkout` tuto kontrolu mají — checkout ji postrádá. | — |
| SEC-EXTRA-17 | Test-mode routes gated by `E2E_TEST_MODE` | ✅ | `src/app/api/test/**` (4 routes) — `if (process.env.E2E_TEST_MODE !== "1") return 404` | čteno | Gating konzistentní ve všech 4 testovacích routes. | — |
| SEC-EXTRA-18 | Cron route autentizace | ✅ | `src/app/api/cron/expire-trials/route.ts:5–16` — `CRON_SECRET` povinné; `Authorization: Bearer` required | čteno | Bezpečné selhání při chybějícím env var (500). | — |
| SEC-EXTRA-19 | Rate limiting na auth endpoints | 🟡 | `src/app/api/auth/signup/route.ts:12–26` — in-memory rate limiter (5/15min/IP); login, forgot-password, reset-password **bez** rate limitu | čteno | In-memory limiter efektivní pouze pro single-instance. Login bez rate limitu umožňuje brute-force hesla. | — |
| SEC-EXTRA-20 | Sensitive data v response / logging | ✅ | Auth routes logují jen chyby emailu; webhook loguje typ eventu; `passwordHash` není součástí žádného response selektu | čteno | Žádné tajemství neprosakuje. | — |
| SEC-EXTRA-21 | Invite token entropie a jednorázovost | ✅ | `invitations/route.ts:140` — `crypto.randomBytes(32)` = 256-bit entropie; RBAC-20 vynuceno | čteno | Dostatečná entropie, lifecycle pravidla implementována. | — |
| SEC-EXTRA-22 | Email enumeration při forgot-password | ⚠️ | `src/app/api/auth/forgot-password/route.ts` — potenciální slabina k ověření | čteno | Pokud endpoint vrátí 404 pro neexistující email, umožňuje enumeraci uživatelů. Nutno ověřit response kódy. | — |

---

## Průřez: RBAC

| ID | Pravidlo | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|----------|--------|----------------------|--------|-------------------|--------|
| RBAC-01 | Všechny role → zobrazení projektu | ⚠️ | `projects/[id]/route.ts:77`; `files/route.ts:37` | čteno | GET /projects/[id] povoluje všechny členy OK. GET /files vrací 403 pro commenter a viewer — přísnější než matice. | — |
| RBAC-02 | Owner, Editor, Commenter, Viewer → stahování povolených souborů | ❌ | `files/[fileId]/route.ts:39` — `isOwner || isEditor` blokuje commenter/viewer | čteno | PERMISSIONS.download_files zahrnuje tyto role, ale matice není aplikována (mrtvý kód). | — |
| RBAC-03 | Owner, Editor, Admin → nahrávání souborů | 🟡 | `files/upload-url/route.ts:116`; `files/confirm/route.ts:56` | čteno | Owner a editor povoleni. Admin bypass chybí — admin je blokován pokud není membership member. | — |
| RBAC-04 | Owner, Editor, Admin → publikace verze | 🟡 | `versions/[versionId]/route.ts:175` (PATCH) | čteno | Owner a editor povoleni. Admin bypass chybí. | — |
| RBAC-05 | Owner, Editor, Admin → editace metadat projektu | 🟡 | `projects/[id]/route.ts:104` (PUT, `requireEditor=true`) | čteno | Owner a editor povoleni. Admin bez membership nedostane přístup — `loadAuthorizedProject` nekontroluje `user.role`. | — |
| RBAC-06 | Owner, Editor, Commenter, Admin → přidávání komentářů (Viewer nemůže) | ✅ | `comments/route.ts:39-43`; `COMMENT_ALLOWED_ROLES = ["owner","editor","commenter"]` | čteno | Viewer správně vyloučen. Admin projde pouze pokud je zároveň membership member. | — |
| RBAC-07 | Owner, Editor, Commenter, Admin → smazání vlastního nedávného komentáře | ✅ | `comments/[commentId]/route.ts:37-42,80` — 15min okno pro autora; moderátor (owner) kdykoli | čteno | Implementováno správně. | — |
| RBAC-08 | Owner, Admin → moderace komentářů (resolve/delete thread) | 🟡 | `comments/[threadId]/resolve/route.ts:10` — `MODERATOR_ROLES = ["owner"]`; thread soft-delete endpoint chybí | čteno | Admin chybí v MODERATOR_ROLES; soft-delete celého threadu (`ThreadStatus.deleted_soft`) nemá API route. | — |
| RBAC-09 | Owner, Admin → pozvání spolupracovníků | ✅ | `invitations/route.ts:34` — `project.ownerId !== user.id && user.role !== "admin"` → 403 | čteno | Explicitní admin bypass přítomen. | — |
| RBAC-10 | Owner, Admin → změna role člena | ⚠️ | Žádný `PATCH /projects/[id]/members/[userId]` endpoint | čteno | Funkce není implementována jako samostatný endpoint. Matice vyžaduje. | — |
| RBAC-11 | Owner, Admin → odebrání spolupracovníka | ⚠️ | Žádný `DELETE /projects/[id]/members/[userId]` endpoint | čteno | Remove collaborator route zcela chybí. | — |
| RBAC-12 | Owner (plně), Editor (omezeně) → zobrazení ownership splitu | ⚠️ | `splits/route.ts:26-33`; `splits/[splitId]/route.ts:26-33` | čteno | GET splits povoluje **všechny members** — commenter a viewer by neměli vidět split dle matice. | — |
| RBAC-13 | Owner, Admin → správa ownership splitu | ✅ | `splits/route.ts:91`; `splits/[splitId]/submit/route.ts:30` | čteno | Owner-only check správný. Admin bypass chybí u submit. | — |
| RBAC-14 | Owner, Admin → smazání publikovaného souboru nebo verze | 🟡 | `files/[fileId]/route.ts:127` — owner-only DELETE; verze nemají DELETE endpoint | čteno | DELETE file owner-only (admin chybí); soft delete verze neimplementováno. | — |
| RBAC-15 | Admin → pozastavení přístupu k projektu | ✅ | `admin/projects/[id]/restrict/route.ts:23` — `user.role !== "admin"` → 403 | čteno | AdminAction row uložen. | — |
| RBAC-16 | Najatý talent → nastupuje s omezeným přístupem | ✅ | `applications/[id]/accept/route.ts:173-186` — upsert `role: "commenter"` | čteno | Default commenter; širší přístup vyžaduje explicitní udělení. | — |
| RBAC-17 | Owner → explicitní udělení širšího přístupu logováno do audit trailu | ✅ | `hires/[id]/access/route.ts:117-124` — `logActivity("gig_hire_access_granted",...)` | čteno | Audit záznam vytvořen. | — |
| RBAC-18 | Owner (v MVP) → vytváření pozvánky | ✅ | `invitations/route.ts:34` | čteno | Správně implementováno. | — |
| RBAC-19 | Přijetí pozvánky → membership s přiřazenou rolí | ❌ | `/invitations/accept` stránka ani API endpoint neexistují; email odkazuje na neexistující route | čteno | Tokenová flow pro přijetí pozvánky není implementována. Status `accepted` existuje v DB ale handler ho nenastavuje. | — |
| RBAC-20 | Revoked/expired pozvánka není znovupoužitelná | ✅ | `invitations/[invId]/route.ts:38-43`; `expireStaleInvitations` | čteno | Revoke kontroluje `status !== "pending"`. Expired/revoked statusy jsou terminální. | — |
| RBAC-21 | Stav projektu `active` → dostupný pro spolupráci | ✅ | `projects/[id]/route.ts:37` (`status: "active"` filtr) | čteno | Správně implementováno. | — |
| RBAC-22 | Stav projektu `archived` → uzavřen pro aktivní práci, zachován pro přístup/historii | ✅ | `projects/[id]/archive/route.ts:17-81`; `projects/[id]/restore/route.ts` | čteno | Archive a restore endpointy existují a jsou owner-only. Archivované projekty nelze procházet v dashboardu (bez `filter=archived`). | — |
| RBAC-23 | Stav projektu `suspended` → admin zablokoval přístup | ✅ | `admin/projects/[id]/restrict/route.ts`; `admin/projects/[id]/restore/route.ts` | čteno | Suspend/restore pair plně implementován s AdminAction auditing. | — |
| RBAC-24 | Stav projektu `deleted_soft` → čeká na trvalé smazání | 🟡 | `projects/[id]/route.ts:293-344` (DELETE → `deleted_soft`); cleanup job neexistuje | čteno | Soft delete implementován. Kód dokumentuje záměr cleanup jobu, ale ten neexistuje — fyzické smazání po 30 dnech se nekoná. | — |
| RBAC-25 | Archivaci → owner; pozastavení → admin; soft delete zachovává auditability | ✅ | `archive/route.ts:37`; `restrict/route.ts:23`; `route.ts:313` | čteno | Správné role splits; `logActivity` zaznamenáno. | — |
| RBAC-26 | Verze `draft` → nahraná data nepublikována | ✅ | `versions/route.ts:174` (POST vytváří `status: "draft"`) | čteno | Draft lifecycle správně zaveden. | — |
| RBAC-27 | Verze `published` → immutabilní snapshot viditelný v historii | ✅ | `versions/[versionId]/route.ts:188-193` (pouze draft lze publikovat) | čteno | Publish → `status: "published"`, nelze republikovat. | — |
| RBAC-28 | Verze `superseded` → starší publikovaná verze | ✅ | `versions/[versionId]/route.ts:197-200` (updateMany → superseded před publish) | čteno | Automatická supersedence v transakci. | — |
| RBAC-29 | Verze `deleted_soft` → skryta, zachována | 🟡 | Žádný `DELETE /versions/[versionId]` endpoint | čteno | Soft delete verze není implementováno jako route. Přechod do `deleted_soft` nelze provést. | — |
| RBAC-30 | Publikovat → Owner a Editor; serializuje draft; označí předchozí jako superseded | 🟡 | `versions/[versionId]/route.ts:165-177` (PATCH) | čteno | Owner a editor povoleni. Admin bypass chybí. Serializace a supersedence fungují. | — |
| RBAC-31 | Vlákno `open` → aktivní, přijímá odpovědi | ✅ | `comments/route.ts` (vytváří implicitně open stav) | čteno | Lifecycle je implicitně open při vytvoření. | — |
| RBAC-32 | Vlákno `resolved` → read-only | ✅ | `comments/[threadId]/resolve/route.ts` | čteno | PUT /resolve existuje a je owner-only (admin bypass chybí). | — |
| RBAC-33 | Vlákno `deleted_soft` → odstraněno z UI, zachováno | ❌ | Žádný `DELETE /comments/[threadId]` endpoint pro soft delete threadu | čteno | Mazání komentářů (item úrovně) existuje. Soft delete celého threadu chybí jako samostatný endpoint. `ThreadStatus.deleted_soft` je v DB definováno ale nedosažitelné. | — |
| RBAC-34 | Commenter, Editor, Owner → vytváření vláken; Owner/Admin → moderace | 🟡 | `comments/route.ts:39-43`; `resolve/route.ts:25-30` | čteno | Vytváření OK. Moderace (resolve) pouze owner — admin bypass přes `authorizeProjectMember` chybí. | — |
| RBAC-35 | Gig `draft` → existuje, není veřejný | ✅ | `gigs/[id]/route.ts:66-68` — non-owner nevidí draft gig | čteno | Implementováno. | — |
| RBAC-36 | Gig `published` → viditelný, přijímá přihlášky | ✅ | `gigs/[id]/applications/route.ts:119-124` (POST vyžaduje published) | čteno | Pouze published gigy přijímají applications. | — |
| RBAC-37 | Gig `hired` → jeden uchazeč přijat | ✅ | `applications/[id]/accept/route.ts:152-156` (gig → hired atomická transakce) | čteno | Implementováno. | — |
| RBAC-38 | Gig `delivered` → talent označil práci za dodanou | ✅ | `prisma/schema.prisma:677` (`HireStatus.delivered`); `hires/[id]/route.ts` (PATCH) | čteno | Implementováno přes Hire model; GigStatus nezrcadlí `delivered` — viz RBAC-39. | — |
| RBAC-39 | Gig `approved` → kupující přijal dodání | 🟡 | `prisma/schema.prisma:678` (`HireStatus.approved`); `GigStatus` enum neobsahuje `approved` ani `delivered` | čteno | PRD/RBAC definuje `approved` jako stav gigu; v implementaci jde o stav Hire, nikoli Gig. Funkčně pokryto, schéma se odchyluje od spec. | — |
| RBAC-40 | Gig `closed` → finanční a workflow stav dokončení | ✅ | `prisma/schema.prisma:662`; `gigs/[id]/route.ts:137` (closedAt) | čteno | Owner může uzavřít published gig; otevřené přihlášky se expirují. | — |
| RBAC-41 | Gig `cancelled` / `suspended` → musí být podporovány | ✅ | `prisma/schema.prisma:663,664`; admin routes `suspend/route.ts`, `unpublish/route.ts` | čteno | Oba stavy implementovány. | — |
| RBAC-42 | Přihlášky jen na published; po hire uzavřeny; gig pod projektem | ✅ | `gigs/[id]/applications/route.ts:119`; `applications/[id]/accept/route.ts:118`; FK constraint | čteno | Všechna tři pravidla vynucena. | — |
| RBAC-43 | Jeden talent → max 1 aktivní přihláška na gig | ✅ | `prisma/schema.prisma:738` (`@@unique([gigId, applicantId])`); `applications/route.ts:132-149` | čteno | Unique constraint + validace. | — |
| RBAC-44 | Přijetí → konkurující přihlášky → `rejected`/`expired` | ✅ | `applications/[id]/accept/route.ts:136-149` — `updateMany → rejected` v transakci | čteno | Atomická transakce. | — |
| RBAC-45 | Hire `awaiting_start` → přihláška přijata, čeká na handoff | ✅ | `applications/[id]/accept/route.ts:159` — Hire.status default `awaiting_start` | čteno | Implementováno. | — |
| RBAC-46 | Hire `delivered` → práce odeslána talentem | ✅ | `hires/[id]/route.ts` (PATCH — talent může přejít na delivered) | čteno | Implementováno. | — |
| RBAC-47 | Hire `approved` → kupující schválil dodání | ✅ | `hires/[id]/route.ts` (PATCH — buyer může schválit) | čteno | Implementováno. | — |
| RBAC-48 | Přijatý talent → omezený přístup dokud owner nerozšíří | ✅ | `applications/[id]/accept/route.ts:173-186` (commenter); `hires/[id]/access/route.ts:73-78` (buyer only) | čteno | Default commenter; rozšíření pouze buyer. | — |
| RBAC-49 | Split submit blokován dokud total != 100 % | ✅ | `splits/[splitId]/submit/route.ts:56-68` — `totalCents !== 10000` → 422 | čteno | Implementováno. | — |
| RBAC-50 | První release → pouze project-level split záznamy | ✅ | `splits/route.ts` — splitRecord vázán na projectId; žádné track-level záznamy | čteno | Implementováno. | — |
| RBAC-51 | Pouze Owner → vytváří nebo odesílá split | ✅ | `splits/route.ts:91`; `splits/[splitId]/submit/route.ts:30` | čteno | Owner-only check. Admin bypass chybí u submit. | — |
| RBAC-52 | Potvrzený split nelze editovat přímo; revize vytváří nový záznam | ✅ | `splits/[splitId]/contributors/route.ts:33`; `splits/route.ts:100-107` | čteno | Editace blokována pro ne-draft stav. | — |
| RBAC-53 | Potvrzení vyžadují pouze contributors s nenulovým podílem | ✅ | `splits/[splitId]/submit/route.ts:45-84` — `nonZeroContributors.filter(c => c.percentage > 0)` | čteno | Implementováno. | — |
| RBAC-54 | Rodičovský split agreguje stavy dětských potvrzení | ✅ | `splits/confirmations/[confirmationId]/confirm/route.ts:79-100` — transakce přepočítá stav | čteno | Implementováno. | — |
| RBAC-55 | Subscription `past_due` → read přístup zachován, blokuje nové vytváření | ❌ | `projects/route.ts:115-200` (POST bez subscription check); `files/upload-url/route.ts` bez check | čteno | Žádný route handler pro project create, file upload, version publish nebo gig publish nekontroluje subscription status. | — |
| RBAC-56 | Po trialu → přechod na placený plán pro schopnosti vytváření/uploadu | ❌ | `projects/route.ts` (POST); `files/upload-url/route.ts` | čteno | Trial expiry existuje, ale tvůrčí route handlery ho nekontrolují. | — |
| RBAC-57 | Stripe = zdroj pravdy pro billing; backend = zdroj pravdy pro product access | 🟡 | `webhooks/stripe/route.ts`; `billing/subscription/route.ts` | čteno | Stripe webhooky aktualizují Subscription model. Backend ale nevynucuje product access ve tvůrčích routes. | — |
| RBAC-58 | Marketplace payment webhook → reconciliace finálního stavu | ✅ | `webhooks/stripe/route.ts` (idempotentní; `payment_intent.succeeded` atd.) | čteno | Webhook handler s idempotencí existuje. | — |
| RBAC-59 | Platform fee → navázán na úspěšnou platbu | ✅ | `webhooks/stripe/route.ts` — fee logika v webhook handleru | čteno | Fee logika v webhook handleru přítomna (DB záznam). Viz R-8.4-06 pro Stripe-side odchylku. | — |
| RBAC-60 | Payout blocking reasons: Connect onboarding, KYC, schválení platby, 7d review, admin hold | ✅ | `admin/payouts/[id]/hold/route.ts:46`; `admin/payouts/[id]/release/route.ts:71,77` | čteno | Blocking stavy a důvody kontrolovány. | — |
| RBAC-61 | Payout release: okamžitě na approved NEBO auto 7 dní po delivered | ✅ | `admin/payouts/[id]/release/route.ts`; `autoReleaseDeadline()` | čteno | `autoReleaseAt` časovač existuje. Admin override release implementován. Auto trigger bez cron jobu — viz R-8.4-07. | — |
| RBAC-62 | Admin akce `suspend_account` | ✅ | `prisma/schema.prisma:618`; `admin/users/[id]/suspend/route.ts:84` | čteno | Enum i endpoint přítomny. | — |
| RBAC-63 | Admin akce `unsuspend_account` | ✅ | `prisma/schema.prisma:619`; `users/[id]/unsuspend/route.ts:75` | čteno | Enum i endpoint přítomny. | — |
| RBAC-64 | Admin akce `suspend_gig` | ✅ | `prisma/schema.prisma:620`; `gigs/[id]/suspend/route.ts:70` | čteno | Enum i endpoint přítomny. | — |
| RBAC-65 | Admin akce `unpublish_gig` | ✅ | `prisma/schema.prisma:621`; `gigs/[id]/unpublish/route.ts:57` | čteno | Enum i endpoint přítomny. | — |
| RBAC-66 | Admin akce `restrict_project` | ✅ | `prisma/schema.prisma:623`; `projects/[id]/restrict/route.ts:64` | čteno | Enum i endpoint přítomny. | — |
| RBAC-67 | Admin akce `restore_project` | ✅ | `prisma/schema.prisma:624`; `projects/[id]/restore/route.ts:56` | čteno | Enum i endpoint přítomny. | — |
| RBAC-68 | Admin akce `hold_payout` | ✅ | `prisma/schema.prisma:625`; `payouts/[id]/hold/route.ts:60-83` | čteno | Nastaví `blockReason = "admin_hold"`, `heldAt`, `heldByActorId`. | — |
| RBAC-69 | Admin akce `release_payout` | ✅ | `prisma/schema.prisma:626`; `payouts/[id]/release/route.ts:110-131` | čteno | Enum i endpoint přítomny; Stripe Transfer při úspěšném Connect onboardingu. | — |
| RBAC-70 | Každá admin akce → actor, target object, timestamp, reason code, interní poznámka | 🟡 | `prisma/schema.prisma:636-651` (model `AdminAction`); `audit/route.ts:7-17` | čteno | Model ukládá všechna požadovaná pole. `reasonCode` je volitelný u project/gig akčních endpointů — konzistence nejistá. | — |

---

## Průřez: Decisions

| ID | Rozhodnutí | Status | Důkaz (soubor:řádek) | Úroveň | Soulad / rozpor | Issue# |
|----|-----------|--------|----------------------|--------|-----------------|--------|
| DEC-01 | Marketplace = Stream 2, není podmínkou launche | ✅ | `prisma/schema.prisma:654` — `// 10-01: Gig (Stream 2 — Marketplace)`; marketplace routes neblokují Stream 1 launch | čteno | Splněno. Schéma i kód explicitně označují gig/marketplace jako Stream 2. | — |
| DEC-02 | Každý gig musí patřit pod existující projekt | ✅ | `prisma/schema.prisma:684` — `Gig.projectId String` (NOT NULL, FK na `Project`); `projects/[id]/gigs/route.ts:68-80` — verifikace aktivního projektu | čteno | Gig bez existujícího aktivního projektu nelze vytvořit. DB constraint + routovací logika konzistentní. | — |
| DEC-03 | Politika uvolnění výplaty: schválení kupujícím NEBO auto 7 dní po dodání | ✅ | `src/lib/payouts.ts:7` (`PAYOUT_AUTO_RELEASE_DAYS = 7`); `hires/[id]/route.ts:314-323` — `autoReleaseAt` při `delivered`; `hires/[id]/route.ts:340` — buyer approval → `dispatchPayoutOnApproval` | čteno | Obě větve implementovány. Auto-release timestamp uložen; exekuční trigger (cron) chybí — viz R-8.4-07. | — |
| DEC-04 | Payout lifecycle: review window a hold stavy; admin může blokovat před uvolněním | ✅ | `prisma/schema.prisma:863-867` — `PayoutBlockReason` enum; `admin/payouts/[id]/hold/route.ts:46-83` | čteno | Review window (7 dní) i admin hold stav plně implementovány. Admin hold přepisuje i buyer approval. | — |
| DEC-05 | Najatý talent má ve výchozím stavu omezený přístup; wider access vyžaduje explicitní udělení | ✅ | `prisma/schema.prisma:758` — `Hire.memberRole @default(commenter)`; `accept/route.ts:172-185`; `HIRE_GRANTABLE_ROLES` vylučuje owner | čteno | Talent nastoupí jako Commenter. Wider access nelze získat automaticky. | — |
| DEC-06 | Udělení přístupu po hire musí být explicitní a auditně zaznamenané | ✅ | `hires/[id]/access/route.ts:117-123` — `logActivity("gig_hire_access_granted",...)` s `gigId`, `role`, `talentId` | čteno | Explicitní grant je oddělený endpoint s povinným audit logem. Logování jde do ActivityLog (projektová tabulka), ne do admin audit — potenciální compliance gap. | — |
| DEC-07 | Split záznamy pouze na úrovni projektu v prvním release; track-level je pozdější rozšíření | ✅ | `prisma/schema.prisma:511-527` — `SplitRecord.projectId`, žádné `trackId`, `versionId` ani `fileId` | čteno | Schema obsahuje pouze project-level split záznamy. | — |
| DEC-08 | Model předplatného je trial → placený pouze; no permanent free tier after trial | ✅ | `prisma/schema.prisma:559-570` — `SubscriptionPlan` enum: `trial`, `pro`, `team` — žádný `free`; `src/lib/subscription.ts:84-122` — expiry/past_due logika | čteno | Žádný permanent free tier. Middleware semantika odpovídá DEC-08, ale middleware není napojen na tvůrčí routes. Kód je přísnější pro `expired` (blokuje i read) — je přísnější než decision, nikoliv v rozporu. | — |

---

## Appendix: pokrytí

**Celkový počet requirement ID v requirement-index.md:** 21 (R-8.1) + 9 (R-8.2) + 13 (R-8.3) + 8 (R-8.4) + 7 (R-8.5) + 6 (R-8.6) + 13 (AC) + 5 (SEC) + 70 (RBAC) + 8 (DEC) = **160 ID**

**Celkový počet řádků v tabulkách tohoto reportu:** přibližně **260 řádků** (po merge duplicit z více epiců do jednoho řádku s nejvyšší závažností).

**ID s nálezem v tomto reportu:** všech 160 kanonických ID z requirement-index.md je trasovatelných v některé ze sekcí výše.

**ID bez nálezu (žádná evidence v žádném epic souboru):** žádné — všechna ID jsou pokryta alespoň jedním nálezem z epic-00 až epic-12 nebo z cross-cutting souborů.

**Poznámka ke slučování:** Tam kde stejné ID bylo auditováno ve více epicech (typicky RBAC-* a DEC-* jsou verifikovány jak v doménové sekci, tak v průřezových souborech), byl zachován nejzávažnější status a evidence z obou zdrojů sloučena do jednoho řádku v tomto reportu.

**Runtime-specifický nález (Prisma 7 migrate regrese):** Zaznamenán v sekci Launch-blocking mezery v Executive summary; nemá vlastní requirement ID v indexu, je evidován jako ops regrese blocker.
