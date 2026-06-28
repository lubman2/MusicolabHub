# Runtime verification of critical flows (Task 4)

**Datum:** 2026-06-28
**Prostředí:** efemérní Docker Postgres 16 (port 5433), schéma aplikováno přímo z `prisma/migrations/*/migration.sql` (28 tabulek), `E2E_TEST_MODE=1`, `.env.local` s dummy AWS/SMTP. S3/SMTP mockované dle `TESTING.md`.

## Výsledky

| ID / Flow | Sub-flow | Výsledek | Důkaz | Poznámka |
|-----------|----------|----------|-------|----------|
| AUTH | signup → login → session | **spuštěno · PASS** | `npm run test:e2e` proběhl přes signup+login (22 s, padl až na file kroku) | runtime ověřeno |
| AUTH | email verify | neověřeno-runtime | — | reálný `/api/auth/verify-email` endpoint chybí (viz epic-01 ❌); e2e používá test-only onboard route |
| AUTH | password reset | neověřeno-runtime | statika: `src/app/api/auth/reset-password` | nevyzkoušeno runtime |
| PROJECT | create project | **spuštěno · PASS** | e2e vytvořil projekt `cmqxth2c…` přes UI proti reálné DB | runtime DB klient funguje |
| FILES | upload → confirm → ready | **spuštěno · FAIL** | e2e: „No ready file for project … 404" (`e2e/helpers/db.ts:60`) | soubor nedosáhl stavu `ready`. Pravděpodobně artefakt test-harness (mock presigned PUT `X-Amz-Signature` nezachytí s dummy creds), NE jednoznačně produkční bug — nutno izolovat. Koreluje s file-flow nálezy epic-03/04. |
| STRIPE | checkout / webhook / trial | neověřeno-runtime | statika: epic-08 | vyžaduje Stripe test klíče; navíc `withActiveSubscription` je mrtvý kód (epic-08), `trialEndsAt` se v produkci nezapisuje |
| SPLITS | draft→submit→confirm/reject | neověřeno-runtime | statika: epic-07 | nevyzkoušeno runtime; UI „Submit" tlačítko chybí (epic-07 ❌) |
| RBAC | negativní vynucení (role bez práva) | neověřeno-runtime | statika potvrzena | `withProjectAuth` je mrtvý kód (epic-05, ověřeno: žádný route caller); files GET blokuje viewer/commenter (epic-03/05). Statická evidence silná. |
| FILES | access control (cross-project) | neověřeno-runtime | statika: epic-03 | presigned generování ano; reálný cross-project GET nevyzkoušen |

## Zásadní runtime nález — Prisma 7 migrate breakage (REGRESE)

**`prisma migrate` / `prisma db push` jsou pod Prisma 7 ROZBITÉ** (`P1012`):

```
error: The datasource property `url` is no longer supported in schema files.
  --> prisma/schema.prisma:8 :  url = env("DATABASE_URL")
```

Příčina: upgrade na Prisma 7 (merge PR #133/#129 v této session). Prisma 7 odstranila `datasource.url` ze schématu (musí být jen v `prisma.config.ts`) a constructor option `datasources` z klienta. Stav repa:
- `prisma.config.ts` — již Prisma-7 styl (url z env) ✅
- `prisma/schema.prisma:8` — stále `url = env("DATABASE_URL")` ⚠️ (CLI to odmítne)
- `src/lib/prisma.ts:9-13` — stále `new PrismaClient({ datasources: { db: { url }}})` ⚠️ (Prisma-6 vzor)

**Důsledek:** migrace nelze spustit přes Prisma CLI → blokuje deploy/ops. **Runtime dotazy ale fungují** (e2e prošel auth+project proti reálné DB), takže constructor `datasources` je za běhu zatím tolerován; CLI ne.

**Dopad:** launch-blocking ops regrese. Oprava (Fáze 2): odstranit `url` z `schema.prisma` datasource a přepsat `src/lib/prisma.ts` na Prisma-7 vzor (adapter / config). Build i lint přitom zůstanou zelené (generate funguje).

## Souhrn úrovní
- **spuštěno (PASS):** auth signup/login/session, project create.
- **spuštěno (FAIL):** file upload→ready (pravděpodobně harness artefakt).
- **neověřeno-runtime:** email verify, password reset, Stripe, splits, RBAC negativ, file access — statická evidence z Task 3 stojí.
- **Prisma migrate:** rozbité (P1012) — regrese z Prisma 7.
