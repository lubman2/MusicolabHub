# Audit Findings – Epic 08: Subscription & Billing

**Datum auditu:** 2026-06-28  
**Auditor:** Claude Code (read-only, bez úprav kódu)  
**Základní dokument:** PRD v2.1 §8.4 (Subscription billing), Requirement Index (`docs/audit/requirement-index.md`)  
**Pokryté ID:** R-8.4-01–03, AC-06, RBAC-55–57, DEC-08  
**Zkoumané soubory:**
- `src/app/api/billing/checkout/route.ts`
- `src/app/api/billing/portal/route.ts`
- `src/app/api/billing/subscription/route.ts`
- `src/app/api/webhooks/stripe/route.ts`
- `src/lib/stripe.ts`
- `src/lib/subscription.ts`
- `src/lib/trial-expiry.ts`
- `src/app/api/cron/expire-trials/route.ts`
- `src/app/pricing/page.tsx`
- `src/app/settings/billing/page.tsx`
- `src/app/settings/billing/billing-actions.tsx`
- `prisma/schema.prisma` (modely `Subscription`, `PaymentEvent`)

---

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.4-01 | Předplatné funguje modelem trial → placené plány (bez trvalého free tieru po skončení trialu) | ✅ | `src/lib/stripe.ts:32` (`TRIAL_PERIOD_DAYS=14`); `src/app/api/billing/checkout/route.ts:69` (`trial_period_days`); `src/lib/trial-expiry.ts:80–88` (expireDueTrials); `prisma/schema.prisma:565–570` (enum nemá `free` status) | čteno | Trial → paid model implementován; checkout vždy předává `trial_period_days`; expiry pipeline (cron + lazy) správně přechází do `expired`. | — |
| R-8.4-02 | Neúspěšná platba přesune uživatele do stavu `past_due` | ✅ | `src/app/api/webhooks/stripe/route.ts:302–344` (`handleInvoicePaymentFailed`); `src/app/api/webhooks/stripe/route.ts:194–239` (`handleSubscriptionUpdated` při `past_due`); `prisma/schema.prisma:568` (enum `past_due`) | čteno | Oba relevantní webhook event typy (`invoice.payment_failed`, `customer.subscription.updated`) přechází subscription do `past_due`. | — |
| R-8.4-03 | Po uplynutí grace period může být blokován upload nových souborů, projektů a publikace gigů | 🟡 | `src/lib/subscription.ts:89–112` (`withActiveSubscription`); `src/app/api/webhooks/stripe/route.ts:18` (`GRACE_PERIOD_DAYS=7`) | čteno | Middleware `withActiveSubscription("write", ...)` existuje a správně blokuje write přístup po vypršení grace period. Avšak žádný API route pro upload (`/api/projects`, `/api/files`, `/api/gigs/publish`) middleware nepoužívá — `grep` přes `src/app/api` nevrátil žádný callsite mimo `src/lib/subscription.ts`. Enforcement existuje jako knihovna, ale není aplikováno na routy. | — |
| AC-06 | Reconciliace stavu předplatného musí fungovat end-to-end | 🟡 | `src/app/api/webhooks/stripe/route.ts:37–43` (idempotence via `PaymentEvent.stripeEventId` unique); `src/app/api/webhooks/stripe/route.ts:31` (signature verification); handlery pro `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed` | čteno | Webhook pipeline je robustní: signature check, idempotence, transakční zápisy. Gap: `trialEndsAt` není nikde nastaveno při webhookovém zpracování ani při checkout (pouze `prisma/seed.ts:272`). Cron endpoint pro expiry trial (`expireTrialIfDue`) tedy porovnává `trialEndsAt` s `now`, ale v produkci bude `trialEndsAt` NULL → trials nikdy nevyprší přes automatický sweep. | — |
| RBAC-55 | `past_due` může zachovat read přístup, ale blokuje nové vytváření | 🟡 | `src/lib/subscription.ts:89–111` | čteno | Logika v `withActiveSubscription` je správná. Gap: middleware není aplikován na žádný produkční API route (viz R-8.4-03). | — |
| RBAC-56 | Po trialu musí uživatel přejít na placený plán pro zachování schopností vytváření/uploadu | 🟡 | `src/lib/subscription.ts:85–87` (trialing → full access); `src/lib/trial-expiry.ts:58–74` (lazy expiry); `src/app/api/cron/expire-trials/route.ts:18` (batch sweep) | čteno | Expiry logika správná. Gap: `trialEndsAt` není zapsáno při vytvoření subscription via webhook → v produkci bude pole NULL a batch expiry (`trialEndsAt: { lt: now }`) nikdy nic nenajde. | — |
| RBAC-57 | Stripe je zdrojem pravdy pro billing události; backend je zdrojem pravdy pro vynucování product access | 🟡 | `src/app/api/webhooks/stripe/route.ts:77–116` (handleEvent switch); `src/lib/subscription.ts:45–124` (withActiveSubscription) | čteno | Architektura odpovídá požadavku: Stripe events → DB stav → middleware enforcement. Gap: enforcement middleware není napojen na žádný route. | — |
| DEC-08 | Model předplatného je trial → placený pouze; read přístup může zůstat, ale vytváření/upload/publish vyžadují placený status | 🟡 | `src/lib/subscription.ts:113–123` (canceled/expired → 403 all); `src/lib/subscription.ts:89–111` (past_due grace); `prisma/schema.prisma:559–570` (enums neobsahují permanent free tier) | čteno | Datový model a middleware semantika odpovídají DEC-08. Gap: middleware není použit v žádném route (viz R-8.4-03). | — |

---

## Doplňkové poznatky (mimo scope subscription epicu)

| Oblast | Poznámka |
|--------|----------|
| `trialEndsAt` není plněno | Webhook handler `handleSubscriptionCreated` (řádek 159–190) a `handleCheckoutSessionCompleted` (řádek 121–155) nezapisují `trialEndsAt` z Stripe objektu (`stripeSub.trial_end`). Stripe vrací `trial_end` na subscription objektu. Bez tohoto pole nefunguje ani lazy expiry ani batch cron sweep. Toto je kritický gap pro funkci trialu v produkci. |
| Checkout hardcoded `plan: "pro"` | `handleCheckoutSessionCompleted` (řádek 143) hardkóduje `plan: "pro"` bez ohledu na zakoupený plán; `handleSubscriptionCreated`/`Updated` používá `mapStripePlan` (řádek 377), který čte `price.metadata.plan`. Pokud `checkout.session.completed` dorazí dříve než `customer.subscription.created`, plán bude nesprávně nastaven na `pro`. |
| Pricing page — hardcoded `userId: "placeholder"` | `src/app/pricing/page.tsx:44` odesílá `{ userId: "placeholder", plan }` na checkout API. Toto je stub bez napojení na session. |

---

## Shrnutí statusů

| Status | Počet |
|--------|-------|
| ✅ Splněno | 2 |
| 🟡 Částečně / gap | 6 |
| ❌ Chybí | 0 |
| ⚠️ Varování | 0 |
| **Celkem** | **8** |
