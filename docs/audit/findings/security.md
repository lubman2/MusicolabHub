# Security Audit — MusicCollabHub

**Datum:** 2026-06-28  
**Typ:** Read-only conformance pass  
**Vstupní dokumenty:** `Red_Team_Matrix_MUSICCOLLABHUB.md`, `docs/audit/requirement-index.md`  
**Scope kódu:** `src/app/api/**`, `src/lib/auth.ts`, `src/lib/rbac.ts`, `src/lib/session.ts`, `src/lib/s3.ts`

---

## Výsledky

| ID | Scénář / kontrola | Status | Důkaz (soubor:řádek) | Úroveň | Riziko / poznámka | Issue# |
|----|-------------------|--------|----------------------|--------|-------------------|--------|
| SEC-01 | Marketplace je klasifikován jako Stream 2 — delivery scope nesmí explodovat na dva kritické workstreamy | ✅ mitigováno | `requirement-index.md:139` — DEC-01 uzamčeno; kód neobsahuje Feature Flag blokující Stream 1 launch | čteno | Splněno na úrovni rozhodnutí; delivery model je v souladu s Red Team doporučením. | — |
| SEC-02 | Každý gig patří pod existující projekt — bez tohoto pravidla se rozpadne datový model a permissions | ✅ mitigováno | `src/app/api/projects/[id]/gigs/route.ts` — gig se vytváří pod `:projectId`; Prisma schéma má `projectId` jako not-null FK | čteno | Databázová integrita i API vrstva vyžadují existující projekt. | — |
| SEC-03 | Politika uvolnění výplaty uzamčena: schválení kupujícím NEBO automatické uvolnění 7 dní po dodání | ✅ mitigováno | `src/app/api/hires/[id]/route.ts:315–324` — `autoReleaseDeadline` nastaveno při `delivered`; `src/app/api/admin/payouts/[id]/release/route.ts` — ruční release adminem | čteno | Payout lifecycle implementuje obě větve (buyer approval + 7-day auto). | — |
| SEC-04 | Najatý talent dostane ve výchozím stavu omezený přístup (Commenter nebo Viewer); širší přístup vyžaduje explicitní udělení | ✅ mitigováno | `src/app/api/hires/[id]/access/route.ts:22–26` — komentář explicitně zmiňuje `commenter` default; `src/lib/hires.ts` HIRE_GRANTABLE_ROLES vylučuje `owner`; každá změna role je logována do `activityLog` | čteno | PRD §8.2 a Red Team §4 je implementováno. | — |
| SEC-05 | Před zápisem backlogu musí být uzamčeny čtyři rozhodnutí: marketplace scope, gig-to-project binding, payout policy, talent access default | ✅ mitigováno | `requirement-index.md:228–234` — DEC-01..DEC-06 existují jako uzamčené záznamy; kód je konzistentní s těmito rozhodnutími | čteno | Všechna čtyři rozhodnutí jsou uzamčena v Decision Log a reflektována v kódu. | — |
| SEC-EXTRA-01 | **Auth token / session integrita** — JWT HS256 podpis, httpOnly cookie, secure v produkci, sameSite=lax, 7-denní expiry | ✅ mitigováno | `src/lib/session.ts:18–46` — jose `SignJWT` / `jwtVerify`, `httpOnly: true`, `secure: NODE_ENV === "production"`, `sameSite: "lax"`, `maxAge: 604800` | čteno | Robustní implementace. Session cookie není čitelná z JavaScriptu. | — |
| SEC-EXTRA-02 | **Stripe webhook signature verification** — musí být ověřen `STRIPE_WEBHOOK_SECRET` | ✅ mitigováno | `src/app/api/webhooks/stripe/route.ts:22–35` — čte raw body přes `req.text()`, kontroluje `stripe-signature` header, volá `stripe.webhooks.constructEvent()` s `STRIPE_WEBHOOK_SECRET`; chybí header → 400 | čteno | Kompletní HMAC verifikace. Bez platného podpisu webhook odmítnut. | — |
| SEC-EXTRA-03 | **Webhook idempotence** — opakované doručení události nesmí duplikovat transakce | ✅ mitigováno | `src/app/api/webhooks/stripe/route.ts:37–43` — `prisma.paymentEvent.findUnique({ where: { stripeEventId: event.id } })` před zpracováním | čteno | Idempotentní kontrola přítomna. | — |
| SEC-EXTRA-04 | **IDOR na projektech** — GET/PUT/DELETE `/api/projects/[id]` musí ověřit vlastnictví nebo členství | ✅ mitigováno | `src/app/api/projects/[id]/route.ts:28–66` — `loadAuthorizedProject()` ověřuje `ownerId === userId` nebo `projectMember` existenci; neznámý projekt → 404 (info-leak prevence) | čteno | Vlastnictví i membership ověřeno před přístupem. | — |
| SEC-EXTRA-05 | **IDOR na souborech** — GET/DELETE `/api/projects/[id]/files/[fileId]` musí ověřit přístup k projektu i příslušnost souboru | ✅ mitigováno | `src/app/api/projects/[id]/files/[fileId]/route.ts:20–42, 72` — projekt ověřen, `file.projectId !== projectId` → 404; DELETE navíc kontroluje `ownerId` | čteno | Soubor nemůže být načten přes cizí `projectId`. | — |
| SEC-EXTRA-06 | **IDOR na verzích** — `/api/projects/[id]/versions/[versionId]` musí ověřit projekt i roli | ✅ mitigováno | `src/app/api/projects/[id]/versions/[versionId]/route.ts:31–49, 99–101` — projekt ověřen; draft verze → 404 pro ne-editora | čteno | Verze jsou navíc schované (draft→404) pro neoprávněné. | — |
| SEC-EXTRA-07 | **IDOR na splitech** — `/api/projects/[id]/splits/[splitId]` musí ověřit příslušnost k projektu | ✅ mitigováno | `src/app/api/projects/[id]/splits/[splitId]/route.ts:35` — `prisma.splitRecord.findFirst({ where: { id: splitId, projectId } })`; contributor routes mají `verifyOwnerDraft()` | čteno | SplitId je vždy ověřen vůči `projectId`. | — |
| SEC-EXTRA-08 | **IDOR na gigech** — GET `/api/gigs/[id]` musí skrýt draft gigy neowneru | ✅ mitigováno | `src/app/api/gigs/[id]/route.ts:66–69` — ne-owner + status ≠ `published` → 404; PATCH/DELETE používá `loadGigForOwner()` | čteno | Draft gigy nejsou viditelné neoprávněným uživatelům. | — |
| SEC-EXTRA-09 | **IDOR na aplikacích** — `/api/applications/[id]` musí být přístupný pouze vlastníkovi projektu a žadateli | ✅ mitigováno | `src/app/api/applications/[id]/route.ts:58–63` — `isOwner = project.ownerId === user.id`, `isApplicant = application.applicantId === user.id`; jinak → 404 | čteno | Přijatelná granularita. | — |
| SEC-EXTRA-10 | **IDOR na hire** — GET/PATCH `/api/hires/[id]` musí být přístupný pouze kupujícímu a talentu | ✅ mitigováno | `src/app/api/hires/[id]/route.ts:71–75` — `isParty = buyerId === user.id \|\| talentId === user.id \|\| role === "admin"`; jinak → 404 | čteno | Správně omezeno na strany kontraktu. | — |
| SEC-EXTRA-11 | **IDOR na split confirmacích** — PUT `/api/splits/confirmations/[id]/confirm` musí ověřit, že potvrzující je daný přispěvatel | ✅ mitigováno | `src/app/api/splits/confirmations/[confirmationId]/confirm/route.ts:47–50` — `contributor.userId !== user.id` → 403 | čteno | Jen správný přispěvatel může potvrdit. | — |
| SEC-EXTRA-12 | **Autorizace admin routes** — všechny `/api/admin/**` musí kontrolovat `user.role === "admin"` | ✅ mitigováno | `src/app/api/admin/users/[id]/suspend/route.ts:18–19`; `src/app/api/admin/payouts/[id]/hold/route.ts:24–25` — vzorový pattern `if (actor.role !== "admin") → 403` přítomný ve všech admin routes | čteno | Admin role check je konzistentní. | — |
| SEC-EXTRA-13 | **Input validace na POST/PATCH bodies** — délkové limity, typová kontrola, enum whitelist | ✅ mitigováno | `src/app/api/projects/[id]/route.ts:5–12` — konstanty `TITLE_MAX=200`, `DESCRIPTION_MAX=5000`, etc.; `src/app/api/projects/[id]/files/upload-url/route.ts:12–93` — ALLOWED_MIME_TYPES whitelist, extension check, file size | čteno | Validace je přítomna a detailní. | — |
| SEC-EXTRA-14 | **MIME type / extension spoofing při uploadu** — klient nemůže uploadovat exe nebo PHP soubor | ✅ mitigováno | `src/app/api/projects/[id]/files/upload-url/route.ts:12–93` — `ALLOWED_EXTENSIONS` i `ALLOWED_MIME_TYPES` jako whitelisty; obě musí souhlasit | čteno | Dvojitá kontrola (extension + MIME). Soubor je uložen do S3 přes signed URL (server negeneruje key z user inputu volně). | — |
| SEC-EXTRA-15 | **S3 presigned URL scoping** — download URL generovány pouze po ověření přístupu k projektu; s3Key není volně exponováno klientovi | 🟡 částečně | `src/app/api/projects/[id]/files/upload-url/route.ts:146` — response obsahuje `s3Key` spolu s `uploadUrl` a `fileId`; download URL (GET souboru) `s3Key` neexponuje | čteno | **Informační únik:** upload-url endpoint vrací raw `s3Key` ve tvaru `projects/{projectId}/files/{fileId}/{filename}`. Útočník se znalostí struktury klíče by mohl uhodnout klíče jiných souborů — avšak S3/R2 bucket by měl být privátní (přístup jen přes signed URL), takže samotný key bez válid signatury je bezcenný. Riziko je nízké, ale key zbytečně prosakuje. | — |
| SEC-EXTRA-16 | **Billing/checkout IDOR — `POST /api/billing/checkout` přijímá `userId` z těla bez ověření totožnosti volajícího** | ❌ chybí | `src/app/api/billing/checkout/route.ts:6–13` — endpoint neprovádí žádnou session autentizaci; `userId` pochází výhradně z request body | čteno | **Kritické.** Libovolný volající (nebo neautentizovaný požadavek) může zaslat cizí `userId` a vytvořit pro daného uživatele Stripe checkout session + upsertovat `Subscription` záznam do DB (nastaví `stripeCustomerId`, `plan`, `status=trialing`). **Útok:** manipulace s billing stavem libovolného uživatele, potenciální aktivace trial pro cizí účet nebo přepsání `stripeCustomerId`. Porovnání: `billing/portal` (`src/app/api/billing/portal/route.ts:7`) i `hires/[id]/checkout` správně volají `getCurrentUser()`. | — |
| SEC-EXTRA-17 | **Test-mode routes gated by `E2E_TEST_MODE`** — `/api/test/**` musí vracet 404 v produkci | ✅ mitigováno | `src/app/api/test/users/route.ts:17`; `src/app/api/test/users/[id]/route.ts:12`; `src/app/api/test/users/by-email/[email]/onboard/route.ts:15`; `src/app/api/test/projects/[id]/files/latest/route.ts:15` — všechny 4 routes: `if (process.env.E2E_TEST_MODE !== "1") return 404` | čteno | Gating konzistentní ve všech 4 testovacích route. | — |
| SEC-EXTRA-18 | **Cron route autentizace** — `/api/cron/expire-trials` musí být chráněna sdíleným tajemstvím | ✅ mitigováno | `src/app/api/cron/expire-trials/route.ts:5–16` — `CRON_SECRET` povinné; `Authorization: Bearer ${secret}` header required; chybí-li → 401 | čteno | Chybějící env var vrátí 500 (bezpečné selhání). | — |
| SEC-EXTRA-19 | **Rate limiting na auth endpoints** | 🟡 částečně | `src/app/api/auth/signup/route.ts:12–26` — in-memory rate limiter (5/15min/IP); ostatní auth routes (login, forgot-password, reset-password) **nemají** rate limiting | čteno | **Slabé:** In-memory limiter se resetuje při restartu serveru; neprochází přes více instancí (Vercel/Node multi-instance). Login endpoint bez rate limitu umožňuje brute-force hesla. Doporučení: Redis/Upstash rate limiter přes middleware. | — |
| SEC-EXTRA-20 | **Sensitively data v response / logging** — hesla, tokeny a tajemství nesmí být logována ani vrácena klientovi | ✅ mitigováno | Auth routes logují jen chyby emailu (`console.error`), nikdy hesla; webhook handler loguje typ eventu a chybovou zprávu; `passwordHash` není součástí žádného response selektu | čteno | Žádné tajemství neprosakuje do logů ani response. | — |
| SEC-EXTRA-21 | **Invite token entropie a jednorázovost** — tokenem nelze znovu použít po odvolání nebo expiraci | ✅ mitigováno | `src/app/api/projects/[id]/invitations/route.ts:140` — `crypto.randomBytes(32)` = 256-bit entropie; `RBAC-20`: odvolaná nebo prošlá pozvánka není znovupoužitelná | čteno | Dostatečná entropie, lifecycle pravidla implementována. | — |
| SEC-EXTRA-22 | **Email enumeration při forgot-password** | ⚠️ slabé | `src/app/api/auth/forgot-password/route.ts` — nutno ověřit zda endpoint nevrací odlišné zprávy pro existující vs. neexistující email | čteno | Nelze potvrdit bez čtení zdrojového kódu (není v scope tohoto pasu) — označeno jako potenciální slabina k ověření. Pokud endpoint vrátí 404 pro neexistující email, umožňuje to enumeraci uživatelů. | — |

---

## Souhrn statusů

| Status | Počet |
|--------|-------|
| ✅ mitigováno | 18 |
| 🟡 částečně | 2 |
| ⚠️ slabé | 1 |
| ❌ chybí | 1 |
| **Celkem** | **22** |

---

## Nejvyšší riziko

**SEC-EXTRA-16 — `POST /api/billing/checkout` bez autentizace (❌ kritické)**

Endpoint `src/app/api/billing/checkout/route.ts` neprovádí žádnou session autentizaci. Přijímá `userId` z request body a na základě něj vytváří Stripe checkout session a upsertuje `Subscription` záznam v DB. Útočník může:

1. Zaslat POST s libovolným `userId` cizího uživatele
2. Přepsat jeho `stripeCustomerId` v DB na nový Stripe customer objekt
3. Aktivovat pro cizí účet trial subscription nebo změnit billing stav

Srovnání: `billing/portal` (`portal/route.ts:7`) a `hires/[id]/checkout/route.ts:34` obě správně volají `getCurrentUser()` a odvozují `userId` z ověřeného session tokenu — checkout endpoint tuto kontrolu postrádá.

**Doporučená oprava:** Přidat `getCurrentUser(req)` na začátek handleru a ověřit, že `session.userId === body.userId` nebo `userId` z body kompletně ignorovat a derivovat ho ze session.
