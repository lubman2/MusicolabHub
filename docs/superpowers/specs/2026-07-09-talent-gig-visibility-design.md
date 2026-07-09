# Talent-side gig visibility + „Zakázky" hub — design

**Datum:** 2026-07-09 · **Schválil:** owner (chat) · **Původ:** produkční testování — najatý talent ztrácí přístup ke gigu, na který se hlásil.

## Problém

Účast na gigu dnes není samostatný pojem — viditelnost gigů je odvozená jen ze statusu gigu a vlastnictví projektu. Důsledky (ověřeno na kódu, stav k master@5f54606):

1. Přijetím přihlášky se gig překlopí na `hired` → zmizí z Marketplace (`/api/gigs` filtruje `status: "published"`) a **detail `/gigs/[id]` vrací 404 všem kromě ownera** (`loadVisibleGig`: `!isOwner && status !== "published"` → null) — včetně právě najatého talenta.
2. Najatý talent se stává členem projektu (commenter), ale na Gigs tabu projektu vidí jen `published` gigy (`/api/projects/[id]/gigs`: ne-owner → `status: "published"`) — **svůj hired gig nevidí ani tam**.
3. **Neexistuje žádný přehled „moje přihlášky / moje zakázky"** — žádná stránka ani API (`GET /api/hires` kolekce neexistuje, applications jsou čitelné jen per-gig). Stránka `/hires/[id]` — kde talent klikí „Mark work as started" a „Submit delivery" — je dosažitelná jen znalostí URL (accept flow přesměruje buyera, ne talenta).
4. Notifikace gig/hire rodiny nikam neodkazují (bell naviguje jen `split_confirmation` — mechanismus z PR #171).
5. Výplata talentovi proběhne bez jakékoli in-app notifikace (žádný payout NotificationType neexistuje).

## Koncepční princip

**Participant gigu** = owner projektu (zadavatel/buyer), globální admin, autor přihlášky (aplikant), najatý talent (Hire.talentId). Participant svůj gig **nikdy neztrácí z dohledu** — bez ohledu na status gigu (`hired`, `closed`, `cancelled`) a nezávisle na členství v projektu. Účast na gigu je samostatný vztah vedle project-membershipu; membership vzniklý hirem je vedlejší efekt, ne náhrada.

Pro ne-participanty se nic nemění: nepublished gigy jsou 404 (žádný nový únik informací).

## Řešení — pět částí

### 1. Participant visibility gigu

- `src/app/gigs/[id]/page.tsx` (`loadVisibleGig`) + příslušné gig API: gig je viditelný, když `status === "published"` (dnes) **nebo** viewer je participant (owner/admin/aplikant/najatý talent — lookup přes GigApplication.applicantId a Hire.talentId).
- `GET /api/projects/[id]/gigs`: ne-owner member vidí `published` + gigy, kde je participant.
- Gig detail pro participanty ukazuje status badge i pro nepublished stavy; najatému talentovi a buyerovi navíc odkaz na `/hires/{hireId}`.
- Detail gigu v ne-published stavu skryje apply formulář (přihlašování jen na published — beze změny).

### 2. Kolekční API

- `GET /api/hires?role=talent|buyer&page=&limit=` — hires přihlášeného uživatele v dané roli. Položka: id, status, agreedFee/currency, gig {id, title}, project {id, title}, protistrana {id, email, displayName}, createdAt/updatedAt, payment/payout stavová zkratka (existující selecty z `/api/hires/[id]` zúžit, žádná nová data). Řazení `updatedAt desc`, stránkování dle konvence versions API.
- `GET /api/applications?role=applicant&status=` — moje přihlášky (id, status, proposedFee, coverNote zkráceně, gig {id,title,status}, project title, createdAt). Owner-side seznam per-gig zůstává na gig detailu (beze změny).
- Obě auth-required (401), bez subscription gate (čtení).

### 3. Stránka `/hires` — „Zakázky"

- Nová položka hlavní navigace: Projekty · Marketplace · **Zakázky** · Nastavení (`nav.tsx`).
- Client page dle konvencí (viz versions/splits stránky): dvě záložky **„Jako talent"** / **„Jako zadavatel"** (výchozí talent; prázdné role → empty state s odkazem na Marketplace resp. na projekty).
- Talent tab: sekce **Přihlášky** (pending/withdrawn/rejected, odkaz na gig) a **Zakázky** (hire karty: gig title → `/hires/{id}`, projekt, buyer, fee, status badge, CTA hint dle fáze — Start/Odevzdat; samotné akce zůstávají na hire detailu).
- Buyer tab: zrcadlově (talent jméno, CTA hint Schválit u `delivered`).
- Texty česky, styling dle existujících utility konvencí.

### 4. Prokliky z notifikací

Rozšířit `notification-bell.tsx` mapování (mechanismus z PR #171) o:
- `sourceType === "hire"` → `/hires/{sourceId}`
- `sourceType === "gig"` → `/gigs/{sourceId}`
- `sourceType === "gig_application"` → cíl dle dat: u notifikací pro buyera (application_received) vede na gig; emitery se upraví tak, aby posílaly `sourceType: "gig"` + gigId, resp. `"hire"` + hireId tam, kde je cílem zakázka (accepted → hire). Zpětná kompatibilita: staré řádky s neznámým sourceType zůstávají mark-read-only.
- **Nahrazuje issue #173** (zavřít s odkazem sem).

### 5. Payout notifikace

- Migrace: `NotificationType` += `hire_payout_released`, `hire_payout_failed` (jen enum, žádná data migrace).
- `src/lib/payout-release.ts`: po úspěšném transferu `createNotification` talentovi („Výplata za … odeslána", sourceType `"hire"`), po fallbacku na `scheduled` informativní variantu; admin release route totéž (sdílet přes lib, kde to jde bez refactoru admin routy).
- Bell proklik na `/hires/{id}` (pokryto částí 4).

## Mimo rozsah

Dashboard widgets, earnings/výplatní přehledy, filtry a historie (varianta „talent workspace" — případný budoucí epic). Změny money-flow, hire stavového stroje a apply flow. Viditelnost cizích gigů pro běžné členy projektu nad rámec published (vědomě zachováno).

## Akceptační kritéria (souhrn)

- AC-1: Najatý talent otevře detail svého gigu ve stavu `hired` i `closed` (žádný 404) a vidí na něm odkaz na svou zakázku.
- AC-2: Talent vidí svůj hired gig na Gigs tabu projektu; ostatní členové ho nevidí.
- AC-3: `/hires` zobrazuje přihlášenému uživateli jeho přihlášky a zakázky v obou rolích; položka je v hlavní navigaci.
- AC-4: Kliknutí na gig/hire notifikaci v bellu naviguje na relevantní stránku (a označí přečtené).
- AC-5: Po auto-release i buyer-approval výplatě přijde talentovi notifikace s proklikem na zakázku.
- AC-6: Ne-participant na nepublished gigu dál dostává 404 (regrese nulová) — pokrýt testem.

## Rozpad na issues

1. **feat: participant visibility gigů** (část 1; AC-1, AC-2, AC-6)
2. **feat: kolekční API /api/hires + /api/applications** (část 2)
3. **feat: stránka Zakázky (/hires) + navigace** (část 3; AC-3; závisí na 2)
4. **feat: notifikační prokliky gig/hire rodiny** (část 4; AC-4; supersedes #173)
5. **feat: payout notifikace talentovi** (část 5; AC-5; závisí na 4 jen měkce)
