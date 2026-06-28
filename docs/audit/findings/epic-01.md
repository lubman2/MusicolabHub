# Epic-01 — Auth & Onboarding: PRD Conformance Audit

**Datum auditu:** 2026-06-28  
**Auditor:** Claude Code (read-only, žádné změny kódu)  
**Rozsah:** PRD §4 (In scope: account creation and onboarding, creator profiles and portfolio), §7.1 (Signup and onboarding flow), §8.1 (account/onboarding/profile — sdílená sekce, domain Epic-01 = auth, onboarding, profile, portfolio), §10 (security: email verification), §11 (Legal/GDPR — delete/export requests)  
**Poznámka k ID:** PRD §7.1 a §11 nebyly v `requirement-index.md` extrahovány jako R-IDs; použity jsou lokální identifikátory `R-7.1-*` a `R-11-*` odvozené od schématu ID. Požadavek R-8.3-13 (portfolio) byl přiřazen Epicu 11 a auditován tam; níže je uveden pro úplnost s odkazem na ten nález.

---

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|:------:|----------------------|--------|-------------------|--------|
| R-7.1-01 | Uživatel se musí moci zaregistrovat (signup) s emailem a heslem | ✅ | `src/app/api/auth/signup/route.ts:46-113` | čteno | POST `/api/auth/signup` — validace emailu (regex, délka ≤ 254), hesla (min 8 znaků, small+large+číslice), duplicate check, bcrypt-ekvivalent (scrypt), rate-limit 5/15 min per IP. Vrací 201 s `userId`. | — |
| R-7.1-02 | Po registraci musí být odeslán ověřovací email a token uložen s expirací 24 h | ✅ | `src/app/api/auth/signup/route.ts:84-111`, `prisma/schema.prisma:100-111` | čteno | `EmailVerification` model s `token`, `expiresAt`, `usedAt`; token = 32 random bytes; expiry = now + 24 h; `sendVerificationEmail` fire-and-forget. Model existuje v DB schématu. | — |
| R-7.1-03 | Email musí být ověřen před přihlášením a onboardingem | ✅ | `src/app/api/auth/login/route.ts:26-34`, `src/app/api/onboarding/route.ts:63-68` | čteno | Login vrací 403 `UNVERIFIED` pro uživatele se stavem `unverified`; onboarding endpoint (`PUT /api/onboarding`) taktéž blokuje s `403 UNVERIFIED`. | — |
| R-7.1-04 | Musí existovat endpoint pro ověření emailu (kliknutí na odkaz z emailu) | ❌ | `TESTING.md:44` | čteno | Endpoint `/api/auth/verify-email` **neexistuje**. `sendVerificationEmail` (lib/email.ts) konstruuje odkaz na tento neexistující endpoint. TESTING.md explicitně uvádí: „there is no `/api/auth/verify-email` endpoint yet" — e2e testy obcházejí přes test-only route `/api/test/users/by-email/:email/onboard`. V produkci nelze email ověřit. | — |
| R-7.1-05 | Uživatel se musí moci přihlásit emailem a heslem a získat session cookie | ✅ | `src/app/api/auth/login/route.ts:1-53`, `src/lib/session.ts:24-32` | čteno | POST `/api/auth/login` — ověřuje heslo (scrypt timingSafeEqual), kontroluje stavy `unverified`/`suspended`, volá `createSessionCookie` → HttpOnly, Secure (prod), SameSite=lax, maxAge 7 dní, podepsáno `NEXTAUTH_SECRET` (HS256 JWT via `jose`). | — |
| R-7.1-06 | Uživatel se musí moci odhlásit (logout) | ✅ | `src/app/api/auth/logout/route.ts:1-6`, `src/lib/session.ts:40-43` | čteno | POST `/api/auth/logout` maže session cookie. Implementace je správná. | — |
| R-7.1-07 | Musí existovat endpoint pro reset hesla (forgot-password) | ✅ | `src/app/api/auth/forgot-password/route.ts:1-57` | čteno | POST `/api/auth/forgot-password` — generuje `PasswordReset` token (32 bytes, 60 min expiry), uložen v DB; odpověď je vždy `{ ok: true }` bez ohledu na existenci emailu (žádný user-enumeration leak); per-IP + per-email rate limit 5/15 min. | — |
| R-7.1-08 | Musí existovat endpoint pro potvrzení resetu hesla | ✅ | `src/app/api/auth/reset-password/route.ts:1-49` | čteno | POST `/api/auth/reset-password` — validuje token (existence, `usedAt == null`, expiry), hashuje nové heslo (scrypt), atomická transakce: update user password + mark token used + invalidate ostatní tokeny. Vrací `{ ok: true }`. | — |
| R-7.1-09 | Po přihlášení musí být dostupný endpoint pro zjištění aktuálního uživatele a jeho profilu | ✅ | `src/app/api/auth/me/route.ts:1-57` | čteno | GET `/api/auth/me` — ověřuje session, vrací user + profil (displayName, headline, bio, avatarUrl, skills, genres, priceRange) + subscription stav + trial info. Lazy trial expiry sweep. | — |
| R-7.1-10 | Uživatel musí moci projít onboardingem (nastavit displayName, headline, bio, skills, genres) a změnit status na `onboarded` | ✅ | `src/app/api/onboarding/route.ts:57-172`, `src/app/onboarding/wizard.tsx` (existence) | čteno | PUT `/api/onboarding` — validuje displayName (required, ≤ 80), headline (optional, ≤ 120), bio (optional, ≤ 2000), skills/genres (arrays, dedup, ≤ 20 položek, ≤ 40 znaků každá); nastavuje `user.status = "onboarded"`; idempotence blokována (409 pokud už `onboarded`). UI wizard existuje v `src/app/onboarding/wizard.tsx`. | — |
| R-7.1-11 | Po onboardingu musí být profil uložitelný a aktualizovatelný (profile settings) | ✅ | `src/app/api/profile/route.ts:58-233`, `src/app/settings/profile/profile-form.tsx` (existence) | čteno | GET `/api/profile` (vrací aktuální profil) + PUT `/api/profile` (upsert displayName, headline, bio, skills, genres, avatarKey); avatarKey validován jako `avatars/{userId}/...`; settings UI existuje. | — |
| R-7.1-12 | Profil musí podporovat avatar upload přes presigned S3 URL | ✅ | `src/app/api/profile/avatar/route.ts:1-72`, `src/lib/profile.ts` (implicitní) | čteno | POST `/api/profile/avatar` — validuje extension (.jpg/.jpeg/.png), MIME type (JPEG/PNG), fileSize (1 byte – MAX_AVATAR_SIZE); generuje S3 presigned PUT URL a vrací `{ uploadUrl, avatarKey }`. | — |
| R-7.1-13 | Profil musí podporovat veřejné portfolio (work samples / links) — max 10 položek | ✅ | `src/app/api/profile/samples/route.ts:1-108`, `src/lib/portfolio-samples.ts:1` | čteno | GET `/api/profile/samples` + POST `/api/profile/samples`; `MAX_PORTFOLIO_SAMPLES = 10` enforced server-side (409 LIMIT_REACHED); validace title (≤ 120), url (http/https, ≤ 2048), mimeType (optional). `PortfolioSample` model v DB schématu. | — |
| R-7.1-14 | Heslo musí být uloženo bezpečně (hash, ne plaintext) | ✅ | `src/lib/password.ts:1-36` | čteno | scrypt s N=16384, r=8, p=1, salt=32 bytes, keyLen=64 bytes; `timingSafeEqual` pro timing-safe ověření. Žádné plaintext heslo není nikde ukládáno. | — |
| R-7.1-15 | Session musí být JWT s bezpečnými cookie atributy | ✅ | `src/lib/session.ts:1-43` | čteno | HS256 JWT podepsáno `NEXTAUTH_SECRET`; cookie: `httpOnly: true`, `secure: NODE_ENV === "production"`, `sameSite: "lax"`, `maxAge: 604800` (7 dní). | — |
| R-7.1-16 | Systém musí mít stránky pro login, signup, forgot-password, reset-password a onboarding | ✅ | `src/app/login/`, `src/app/signup/`, `src/app/forgot-password/`, `src/app/reset-password/`, `src/app/onboarding/` | čteno | Všechny adresáře/stránky existují. | — |
| R-7.1-17 | Pozastavený účet (`suspended`) musí být blokován při přihlášení | ✅ | `src/app/api/auth/login/route.ts:36-41` | čteno | Login vrací 403 s kódem `SUSPENDED` pro `user.status === "suspended"`. | — |
| R-8.3-13 | Profil pro marketplace musí obsahovat: headline, bio, skills, genres, price range a až 10 pracovních ukázek nebo odkazů | 🟡 | `prisma/schema.prisma:68-78`, `src/app/api/profile/samples/route.ts:97`, viz Epic-11 | čteno | Auditováno v Epic-11. Schema má všechna pole (`headline`, `bio`, `skills[]`, `genres[]`, `priceRange`); limit 10 samples enforced. **Mezera:** `priceRange` je v DB schématu a vrací se v `/api/auth/me`, ale **chybí v `PUT /api/profile` endpointu** (`src/app/api/profile/route.ts:192-210` — `priceRange` není v upsert datech) a chybí v settings UI (`src/app/settings/profile/profile-form.tsx` — žádný input pro price). Uživatel `priceRange` nemůže nastavit přes žádný self-serve endpoint. | — |
| R-11-01 | MVP musí podporovat minimální GDPR workflow pro žádost o smazání účtu | ✅ | `src/app/api/account/delete-request/route.ts:1-57`, `src/app/api/account/delete-request/verify/route.ts:1-57` | čteno | POST `/api/account/delete-request` — vyžaduje potvrzení heslem, vytváří `AccountRequest{type:delete, status:pending_verification}` + emailový ověřovací token (60 min); GET `/api/account/delete-request/verify?token=...` — ověří token, nastaví `status:pending`, `scheduledFor = now + 30 dní`. Retention window 30 dní (`DELETE_RETENTION_DAYS = 30`). Blokace duplicitní žádosti. | — |
| R-11-02 | MVP musí podporovat minimální GDPR workflow pro export dat (data portability) | ✅ | `src/app/api/account/export-request/route.ts:1-41`, `src/app/api/account/export-request/[id]/download/route.ts:1-49`, `src/lib/account-request.ts:15-138` | čteno | POST `/api/account/export-request` — synchronně builduje export payload + ukládá do DB; GET `/api/account/export-request/:id/download` — vrací JSON jako přílohu (`Content-Disposition: attachment`). Export zahrnuje: user record (bez passwordHash), profil, projekty, membership, soubory, verze, komentáře, notifikace, pozvánky, split contributions, subscription, account requests. | — |
| R-11-03 | Uživatel musí moci žádost o smazání zrušit (před uplynutím retention okna) | ✅ | `src/app/api/account/cancel-request/route.ts:1-35` | čteno | POST `/api/account/cancel-request` — ověřuje vlastnictví žádosti (`userId` check → 403), zrušitelné stavy jsou `pending` a `pending_verification`; maže verify token; nastavuje `status:cancelled`. | — |
| R-11-04 | Uživatel musí moci vidět stav svých GDPR žádostí | ✅ | `src/app/api/account/requests/route.ts:1-17`, `src/app/settings/account/page.tsx` (existence) | čteno | GET `/api/account/requests` vrací ostatní `AccountRequest` záznamy (type, status, scheduledFor, completedAt, cancelledAt, createdAt) — max 50, seřazeno desc. Settings/account UI stránka existuje. | — |
| R-11-05 | Skutečné smazání dat musí proběhnout po uplynutí retention okna (30 dní) | ❌ | — | čteno | **Chybí cron/worker** pro vykonání smazání účtů ve stavu `status:pending` + `scheduledFor ≤ now`. Existující cron endpoint je pouze `/api/cron/expire-trials/route.ts` — žádný cron pro `AccountRequest{type:delete, status:pending}`. Žádost je naplánována (`scheduledFor`), ale nikdo ji nikdy nevykoná. | — |
| R-11-06 | Export hesla nesmí být součástí GDPR exportu | ✅ | `src/lib/account-request.ts:17-130` | čteno | `buildExportPayload` vybírá uživatelský záznam explicitním `select` — `passwordHash` **není** zahrnuto. | — |

---

## Zvláštní nálezy

### ⚠️ R-7.1-04 — Chybí `/api/auth/verify-email` endpoint (blocker pro produkci)

Email verification flow je kompletní na straně databázového modelu (`EmailVerification`, token, expiry, `usedAt`) a na straně odesílání emailu (`sendVerificationEmail`). Ale **endpoint, na který odkaz v emailu míří, neexistuje**. V reálném prostředí by každý nový uživatel byl trvale uvězněn ve stavu `unverified` — nemohl by se přihlásit ani dokončit onboarding. TESTING.md tuto skutečnost explicitně dokumentuje a testy ji obcházejí přes test-only API route. Jde o **launch-blocking gap** pro Epic-01.

### ⚠️ R-8.3-13 — `priceRange` nelze nastavit přes žádný self-serve endpoint

Pole `priceRange` je v `Profile` schématu (volitelný `String`), vrací se v `/api/auth/me` i v GDPR exportu, ale **chybí v `PUT /api/profile`** (není v upsert datech) a **chybí v settings/profile UI**. Uživatel nemůže svůj price range nastavit ani aktualizovat bez přímého DB přístupu. Podmínka PRD §8.3 (marketplace profil musí obsahovat price range) je tedy modelem splněna, ale funkčně nesplněna pro end-user.

### ⚠️ R-11-05 — GDPR delete request není nikdy vykonán

Workflow žádosti o smazání je dobře navrženo (password confirmation → email token → scheduling), ale **exekuční krok chybí**. Neexistuje žádný cron job ani worker, který by po uplynutí 30denního okna skutečně smazal/anonymizoval uživatelský záznam. Z pohledu GDPR to znamená, že právo na výmaz (`right to erasure`, GDPR čl. 17) nelze fakticky splnit — žádost je přijata, ale nikdy nevykonána.

---

## Souhrn počtů

| Status | Počet |
|--------|-------|
| ✅ hotovo | 16 |
| 🟡 částečně | 1 |
| ❌ chybí | 2 |
| ⚠️ — | 0 (⚠️ poznámky jsou rozvedeny v sekci Zvláštní nálezy výše) |
| **Celkem** | **19** |
