# Runtime-infra probe (Task 2)

**Datum:** 2026-06-28

## Zjištěný stav prostředí
- `.env` / `.env.local`: **chybí** (nutné pro DB, Stripe, S3, SMTP).
- Nativní Postgres: **není** (`psql`/`pg_ctl`/`postgres` nejsou na PATH, nic neposlouchá na 5432).
- **Docker: dostupný** (`/opt/homebrew/bin/docker`) → lze spustit efemérní Postgres.
- Test-mode surface: `E2E_TEST_MODE=1` aktivuje `src/app/api/test/*` (seed user, onboard, latest file, delete). S3 `checkFileExists` se zkratuje na `true`; e2e mockuje presigned PUT; `sendVerificationEmail` no-opuje bez SMTP. Zdroj: `TESTING.md`, `e2e/happy-path.spec.ts`.

## Plán runtime ověření (Task 4)
Spustit **efemérní Docker Postgres**, aplikovat Prisma schema (`prisma migrate deploy` / `db push`), nastavit minimální env (`DATABASE_URL`, `NEXTAUTH_SECRET`, `AWS_*` dummy, `APP_URL`, `E2E_TEST_MODE=1`), pak:

| Flow | Lze runtime? | Jak | Pozn. |
|------|:---:|-----|-------|
| Auth (signup→verify→login→session→logout→reset) | ano | Playwright `e2e/happy-path.spec.ts` + test routes; reset ručně přes API | email verify je v testu stubnutý (onboard route) |
| Stripe platby (checkout/webhook/subscription/trial) | částečně | webhook handler lze volat lokálně s test payloadem; reálné Stripe API bez test klíčů = `neověřeno-runtime` | idempotence/grace period ověřit voláním handleru 2× |
| Splits konfirmace (draft→submit→confirm/reject→supersede) | ano | přes API se seedovanými usery (test routes) | |
| RBAC vynucení (negativní případy) | ano | volat guarded route rolí bez práva, čekat 403 | **nejvyšší hodnota** |
| Přístup k souborům (presigned, cross-project) | částečně | presigned generování ano; reálný S3 GET mockován | access-control logika ověřitelná |

## Mitigace
Kde reálné externí API (Stripe, S3) nelze bez klíčů ověřit, nález ponese úroveň `neověřeno-runtime` s důvodem; statický audit (Task 3) tyto požadavky přesto pokryje úrovní `čteno`.
