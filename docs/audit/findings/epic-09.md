# Audit: Epic 09 — Admin & Support Tooling

**Zdroj PRD:** §8.6 Admin and Support  
**Datum auditu:** 2026-06-28  
**Auditor:** Claude Sonnet 4.6 (read-only)  
**Soubory prověřeny:**
- `src/lib/admin.ts`
- `src/app/admin/layout.tsx`, `page.tsx`, `forbidden.tsx`
- `src/app/admin/audit/page.tsx`
- `src/app/admin/users/page.tsx`, `users/[id]/page.tsx`
- `src/app/admin/gigs/page.tsx`, `gigs/[id]/page.tsx`
- `src/app/admin/projects/page.tsx`, `projects/[id]/page.tsx`
- `src/app/admin/payments/page.tsx`
- `src/app/admin/payouts/page.tsx`, `payouts/[id]/page.tsx`, `payouts/[id]/admin-payout-actions.tsx`
- `src/app/api/admin/audit/route.ts`
- `src/app/api/admin/users/route.ts`, `users/[id]/suspend/route.ts`, `users/[id]/unsuspend/route.ts`, `users/[id]/kyc/route.ts`
- `src/app/api/admin/gigs/route.ts`, `gigs/[id]/suspend/route.ts`, `gigs/[id]/unpublish/route.ts`, `gigs/[id]/restore/route.ts`
- `src/app/api/admin/projects/route.ts`, `projects/[id]/restrict/route.ts`, `projects/[id]/restore/route.ts`
- `src/app/api/admin/payments/route.ts`
- `src/app/api/admin/payouts/route.ts`, `payouts/[id]/hold/route.ts`, `payouts/[id]/release/route.ts`
- `prisma/schema.prisma` (model `AdminAction`, enums `AdminActionType`, `AdminTargetType`)

---

## Výsledky auditu

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.6-01 | Interní nástroje musí umožnit vyhledání uživatelů, projektů, gigů, plateb a výplat | ✅ | `src/app/api/admin/users/route.ts:28` (search by email/displayName), `projects/route.ts:28`, `gigs/route.ts:37`, `payments/route.ts:36`, `payouts/route.ts:27` | čteno | Všechny pět entit mají dedikované GET endpointy s full-text search a filtrováním podle statusu/plánu. Stránkování implementováno na všech. | — |
| R-8.6-02 | Interní nástroje musí umožnit pozastavení účtu (account suspension) | ✅ | `src/app/api/admin/users/[id]/suspend/route.ts:78-94` (transakční update + AdminAction), `unsuspend/route.ts:74-90` | čteno | Suspend i unsuspend implementovány; transakce zajišťuje atomicitu stavu a audit záznamu. UI dialog na `admin/users/[id]/page.tsx:109`. | — |
| R-8.6-03 | Interní nástroje musí umožnit zrušení publikace nebo pozastavení gigu | ✅ | `src/app/api/admin/gigs/[id]/unpublish/route.ts:55-73`, `gigs/[id]/suspend/route.ts:62-79` | čteno | Obě akce implementovány. Unpublish vrací gig do `draft`; suspend nastaví `suspended` + `suspendedAt`. Restore reverze také přítomna (`gigs/[id]/restore/route.ts`). | — |
| R-8.6-04 | Interní nástroje musí umožnit omezení přístupu k projektu | ✅ | `src/app/api/admin/projects/[id]/restrict/route.ts:61-77` (status → `suspended`), `projects/[id]/restore/route.ts:53-67` | čteno | Restrict přepíná projekt do `suspended`; restore vrací do `active`. Oba zapisují AdminAction v transakci. | — |
| R-8.6-05 | Interní nástroje musí poskytovat viditelnost audit trailu | ✅ | `src/app/api/admin/audit/route.ts:106-183`, `src/app/admin/audit/page.tsx:106-373` | čteno | Filtrovatelný + stránkovaný audit log s CSV exportem (max 5 000 řádků). Zobrazuje actor, actionType, targetType, targetId, reasonCode, internalNote, createdAt. Všechny admin akce zapisují do `AdminAction` v transakci. | — |
| R-8.6-06 | Interní nástroje musí umožnit kontrolu stavu výplat a KYC | ✅ | `src/app/api/admin/payouts/route.ts:27` (status, Connect KYC data), `users/[id]/kyc/route.ts:20-45`, `admin/users/[id]/page.tsx:49-255` (KYC sekce) | čteno | Payouts endpoint vrací `connectAccount` s `status`, `payoutsEnabled`, `requirementsDue`, `disabledReason`. Separátní KYC GET endpoint. Uživatelský detail zobrazuje celou KYC sekci včetně Stripe Connect stavu. | — |
| RBAC-62 | Admin akce `suspend_account` musí být podporována | ✅ | `prisma/schema.prisma:618` (enum `AdminActionType { suspend_account }`), `users/[id]/suspend/route.ts:84` | čteno | Enum hodnota i API endpoint přítomny. | — |
| RBAC-63 | Admin akce `unsuspend_account` musí být podporována | ✅ | `prisma/schema.prisma:619`, `users/[id]/unsuspend/route.ts:75` | čteno | Enum hodnota i API endpoint přítomny. | — |
| RBAC-64 | Admin akce `suspend_gig` musí být podporována | ✅ | `prisma/schema.prisma:620`, `gigs/[id]/suspend/route.ts:70` | čteno | Enum hodnota i API endpoint přítomny. | — |
| RBAC-65 | Admin akce `unpublish_gig` musí být podporována | ✅ | `prisma/schema.prisma:621`, `gigs/[id]/unpublish/route.ts:57` | čteno | Enum hodnota i API endpoint přítomny. | — |
| RBAC-66 | Admin akce `restrict_project` musí být podporována | ✅ | `prisma/schema.prisma:623`, `projects/[id]/restrict/route.ts:64` | čteno | Enum hodnota i API endpoint přítomny. | — |
| RBAC-67 | Admin akce `restore_project` musí být podporována | ✅ | `prisma/schema.prisma:624`, `projects/[id]/restore/route.ts:56` | čteno | Enum hodnota i API endpoint přítomny. | — |
| RBAC-68 | Admin akce `hold_payout` musí být podporována | ✅ | `prisma/schema.prisma:625`, `payouts/[id]/hold/route.ts:60-83` | čteno | Enum hodnota i API endpoint přítomny. Nastaví `blockReason = "admin_hold"`, `heldAt`, `heldByActorId`. | — |
| RBAC-69 | Admin akce `release_payout` musí být podporována | ✅ | `prisma/schema.prisma:626`, `payouts/[id]/release/route.ts:110-131` | čteno | Enum hodnota i API endpoint přítomny. Pokud je Connect onboarding kompletní, vytvoří Stripe Transfer okamžitě; jinak přejde do `scheduled`. | — |
| RBAC-70 | Každá admin akce musí ukládat: actor, target object, timestamp, reason code a volitelnou interní poznámku | 🟡 | `prisma/schema.prisma:636-651` (model `AdminAction`), `audit/route.ts:7-17` | čteno | Model ukládá `actorId`, `actionType`, `targetType`, `targetId`, `reasonCode`, `internalNote`, `createdAt`. **Mezera:** `reasonCode` je v modelu volitelný (`String?`) a u akčních endpointů pro projekty (`restrict`, `restore`) a gigy (`suspend`, `unpublish`, `restore`) také volitelný — `reasonCode || null` bez validace povinnosti. Pouze `suspend_account` a `unsuspend_account` vyžadují `reasonCode` povinně. PRD §8.6 a RBAC-70 nespecifikuje povinnost, ale konzistence je nejistá. Timestamp je implicitně `@default(now())`. | — |
| ⚠️ AUTH-01 | (Technický nález) Konzistence autentizačního vzoru v admin action endpointech | ⚠️ | `users/[id]/suspend/route.ts:3,14` (`getAuthUser`), `gigs/[id]/suspend/route.ts:3,20` (`getCurrentUser`), `payouts/[id]/hold/route.ts:3,20` (`getCurrentUser`) vs. `audit/route.ts:4` (`withAdmin`), `users/route.ts:4` (`withAdmin`) | čteno | **Nekonzistence authorizačního vzoru:** GET endpointy (list routes) používají kompozitní wrapper `withAdmin` z `src/lib/admin.ts`; action POST endpointy (suspend, unpublish, restrict, hold, release, kyc) implementují autorizaci inlinovaně pomocí `getCurrentUser` nebo `getAuthUser` + manuální `if (user.role !== "admin")`. Funkčně ekvivalentní (obě cesty ověřují `role === "admin"`), ale nesourodé — zvyšuje riziko přehlédnutí při budoucích refaktorech. PRD §10 Security vyžaduje "server-side authorization for all sensitive operations" — splněno, ale doporučuje se sjednotit na `withAdmin`. | — |

---

## Souhrn

| Status | Počet řádků |
|--------|-------------|
| ✅ Splněno | 14 |
| 🟡 Částečně / upozornění | 1 |
| ❌ Nesplněno | 0 |
| ⚠️ Technický nález (mimo R-IDs) | 1 |
| **Celkem** | **16** |

### Klíčová zjištění

1. **Všech 6 PRD §8.6 požadavků (R-8.6-01 až R-8.6-06) je implementováno** — lookup pro všechny entity, suspend/unsuspend účtu, gig unpublish/suspend, project restrict/restore, audit trail viewer s CSV exportem, KYC + payout review.

2. **Všech 8 admin action types (RBAC-62 až RBAC-69) má** odpovídající Prisma enum hodnotu, API endpoint a transakční audit záznam.

3. **RBAC-70 (audit fields)** — model je kompletní, ale `reasonCode` není povinný u action endpointů pro projekt a gig akce; pouze user suspend/unsuspend vyžadují `reasonCode` validací. Pokud záměr je požadovat reason code u všech akci, je potřeba doplnit validaci.

4. **⚠️ Nekonzistentní auth vzor** — 9 action POST endpointů používá inline `getCurrentUser`/`getAuthUser` + manuální role check místo sdíleného `withAdmin` wrapperu. Funkčně správné, ale zvyšuje maintenance risk.

5. **Admin overview (`admin/page.tsx`)** nemá odkaz na `/admin/gigs` — sekce Gigs chybí v navigačním přehledu, ačkoli stránka `admin/gigs/page.tsx` existuje. Drobný UX gap, nikoli bezpečnostní problém.
