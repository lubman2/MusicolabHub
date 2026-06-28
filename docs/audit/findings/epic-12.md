# Epic 12 — Marketplace: Payments & Payouts [Stream 2]

**Baseline:** PRD_v2_MUSICCOLLABHUB.md §8.3–§8.4  
**Audit date:** 2026-06-28  
**Auditor:** Claude Code (read-only)

## Scope note

Epic 12 covers the marketplace payment and payout requirements only (R-8.4-04 through R-8.4-08). The subscription billing requirements (R-8.4-01 through R-8.4-03) are Stream 1 and are covered by separate epics. This audit focuses exclusively on Stripe Connect onboarding, marketplace checkout, platform fee collection, payout lifecycle, and admin hold/release controls.

## Source files examined

- `src/app/api/connect/account/route.ts`
- `src/app/api/connect/onboarding/route.ts`
- `src/app/api/hires/[id]/checkout/route.ts`
- `src/app/api/hires/[id]/payment/route.ts`
- `src/app/api/hires/[id]/route.ts` (lines 295–450: delivery, approval, payout dispatch)
- `src/app/api/admin/payouts/route.ts`
- `src/app/api/admin/payouts/[id]/release/route.ts`
- `src/app/api/admin/payouts/[id]/hold/route.ts`
- `src/app/api/webhooks/stripe/route.ts` (lines 388–640: marketplace handlers)
- `src/lib/connect.ts`
- `src/lib/payments.ts`
- `src/lib/payouts.ts`
- `prisma/schema.prisma` (lines 785–899: ConnectAccount, PaymentRecord, PayoutRecord models)
- `vercel.json` (cron config)

---

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|---------|-----------------------|--------|-------------------|--------|
| R-8.4-04 | Platby na marketplace jsou vybírány přes Stripe | ✅ | `src/app/api/hires/[id]/checkout/route.ts:117` – `stripe.checkout.sessions.create` v mode `payment`; webhook handler v `src/app/api/webhooks/stripe/route.ts:78,96,99` reconciluje `checkout.session.completed` a `payment_intent.succeeded/failed` | čteno | Plně implementováno: Stripe Checkout session pro najatý hire, PaymentRecord upsert, webhook reconciliace. | — |
| R-8.4-05 | Výplaty (payouts) jsou směrovány přes Stripe Connect | 🟡 | `src/app/api/connect/onboarding/route.ts:36` – Stripe Express account creation; `src/app/api/admin/payouts/[id]/release/route.ts:93` – `stripe.transfers.create` na `connect.stripeAccountId`; `src/lib/connect.ts:49` – `canReleasePayoutTo` | čteno | Routing přes Stripe Connect je implementován (Express účty, `transfer_group`). **Odchylka:** checkout session nepoužívá `application_fee_amount` ani `transfer_data.destination` — Stripe nemá instrukci k automatickému strhávaní platformového poplatku na straně Stripe. Výplata je manuálně řízena přes admin/buyer-approval flow. | — |
| R-8.4-06 | Platformový poplatek (platform fee) je stržen při úspěšné platbě | ⚠️ | `src/lib/payments.ts:7,19` – `DEFAULT_PLATFORM_FEE_BPS = 1000` (10 %), `calcPlatformFee`; `src/app/api/hires/[id]/checkout/route.ts:95` – `platformFee` vypočten a uložen do `PaymentRecord.platformFee`; `prisma/schema.prisma:826` – `platformFee Int @default(0)` v `PaymentRecord`; **CHYBÍ:** `application_fee_amount` v `stripe.checkout.sessions.create` (`src/app/api/hires/[id]/checkout/route.ts:117-156`) | čteno | Platformový poplatek je vypočítán a uložen do DB, ale **není skutečně strhnut Stripem při platbě**. `stripe.transfers.create` (release/approval) odesílá `payout.amount` = `payment.amount` (plná výše platby, nikoli `amount - platformFee`). PRD říká "platform fee deducted on successful payment" — implementace fee eviduje, ale nestrhává na úrovni Stripe. Jde o accounting odchylku: platforma nezískává fee z Stripe peněžního toku. | — |
| R-8.4-07 | Výplata je uvolněna na základě schválení kupujícím nebo automaticky 7 dní po dodání | 🟡 | Buyer approval: `src/app/api/hires/[id]/route.ts:325,340` – `dispatchPayoutOnApproval`; auto-release deadline: `src/lib/payouts.ts:7` – `PAYOUT_AUTO_RELEASE_DAYS = 7`; `src/app/api/hires/[id]/route.ts:314-323` – `autoReleaseAt` nastaveno při dodání; webhook: `src/app/api/webhooks/stripe/route.ts:528-532` – `autoReleaseAt` při `payment_intent.succeeded` | čteno | Buyer-approval path je funkční (okamžitý Stripe transfer nebo fallback na `scheduled`). `autoReleaseAt` je vypočítán a uložen. **Odchylka:** neexistuje žádný cron job ani API endpoint, který by po uplynutí `autoReleaseAt` automaticky uvolnil výplatu. `vercel.json` registruje pouze `/api/cron/expire-trials`; žádný `/api/cron/release-payouts` neexistuje. Automatické uvolnění po 7 dnech je tedy **pouze datový field bez exekuce**. | — |
| R-8.4-08 | Admin/support může pozastavit výplatu (hold) před jejím uvolněním | ✅ | `src/app/api/admin/payouts/[id]/hold/route.ts:1-86` – POST endpoint, admin-only, `blockReason: "admin_hold"`, `heldAt`, `heldByActorId`; `prisma.adminAction.create` s `actionType: "hold_payout"`; `src/app/api/admin/payouts/[id]/release/route.ts:71-76` – release blokován pokud `status !== blocked/scheduled`; `src/app/api/hires/[id]/route.ts:399-402` – `dispatchPayoutOnApproval` respektuje `admin_hold` a nepřepíše ho | čteno | Admin hold plně implementován s audit logem, ochranou před přepsáním buyer approvalem, a samostatným release endpointem. | — |

---

## Doplňující kontext — Stripe Connect onboarding

| Aspekt | Status | Důkaz | Poznámka |
|--------|--------|-------|----------|
| Stripe Express account creation | ✅ | `connect/onboarding/route.ts:36` | Idempotentní, re-použití existujícího account ID |
| KYC / onboarding link | ✅ | `connect/onboarding/route.ts:83` – `stripe.accountLinks.create` | Vrací `onboardingUrl` + `expiresAt` |
| ConnectAccount model v DB | ✅ | `prisma/schema.prisma:785` | Pole: `status`, `payoutsEnabled`, `chargesEnabled`, `detailsSubmitted`, `requirementsDue`, `disabledReason` |
| KYC blocking payouts | ✅ | `src/lib/connect.ts:49` – `canReleasePayoutTo`; webhook `blockReason: "kyc_pending"` / `"connect_onboarding_incomplete"` | Blokuje transfer dokud `status !== "verified"` |
| Admin KYC review | ✅ | `admin/payouts/route.ts:87-99` – select `connectAccount.requirementsDue`, `disabledReason` v admin payout queue | Supports R-8.6-06 |

---

## Souhrn nálezů

| Status | Počet |
|--------|-------|
| ✅ Plně implementováno | 2 |
| 🟡 Částečně implementováno | 2 |
| ❌ Neimplementováno | 0 |
| ⚠️ Implementováno, ale odchylka od PRD | 1 |

### Kritické mezery

1. **R-8.4-06 (⚠️) — Platform fee není skutečně strhnut Stripem.** `calcPlatformFee` počítá správnou hodnotu (10 % z `agreedFee`, konfigurovatelné přes `PLATFORM_FEE_BPS`) a ukládá ji do `PaymentRecord.platformFee`. Ale checkout session (`checkout/route.ts:117`) nepoužívá `application_fee_amount` ani `transfer_data`, takže Stripe nedrží fee automaticky. Při release (buyer approval nebo admin release) se volá `stripe.transfers.create` s `amount: payout.amount` kde `payout.amount = payment.amount` (plná částka). Platforma tedy odesílá talentu plnou částku bez strhnutí fee. Peněžní tok nesouhlasí s PRD.

2. **R-8.4-07 (🟡) — Automatické uvolnění po 7 dnech není exekuováno.** `autoReleaseAt` je správně vypočítán a uložen (7 dní po `delivered`), ale žádný scheduler ho nekontroluje. Automatické uvolnění existuje pouze jako timestamp v DB, nikoliv jako spouštěcí mechanismus. Bez cron jobu nebo jiného triggeru (např. `/api/cron/release-payouts`) musí admin manuálně uvolnit každou výplatu po uplynutí window.
