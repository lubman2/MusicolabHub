# MusicCollabHub - Red Team Matrix

**Purpose:** oponentní review nad rozhodnutími s největším scope, delivery a risk dopadem  
**Input docs:** `PRD_v2_MUSICCOLLABHUB.md`, `Role_Lifecycle_Tables_MUSICCOLLABHUB.md`  
**Rule:** neřešíme “co ještě přidat”, ale “co návrh rozbije, pokud je předpoklad chybný”

---

## How to Use This Document

Pro každé rozhodnutí:
- `Current assumption`: co teď dokumenty implicitně nebo explicitně říkají
- `Red-team challenge`: proč může být ten předpoklad špatně
- `What breaks if wrong`: co se rozbije v produktu, delivery nebo economics
- `Cheaper alternative`: levnější nebo bezpečnější varianta
- `Recommendation`: co uzamknout před backlogem

---

## 1. Is Marketplace Really MVP Stream 1?

### Current assumption
Marketplace hiring flow je in-scope pro MVP spolu s collaboration hubem, billingem, payouts a admin toolingem.

Relevant references:
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:63)
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:72)
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:74)
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:221)

### Red-team challenge
Tohle nejsou “dvě příbuzné feature oblasti”, ale dva skoro samostatné produkty:
- collaboration workspace
- transaction marketplace with payouts

Každý z nich má vlastní:
- activation funnel
- operations burden
- trust/safety požadavky
- support load
- product metrics

Riziko je, že marketplace bude emocionálně “strategicky důležitý”, ale execution-wise rozbije MVP focus.

### What breaks if wrong
- delivery se rozdělí na dva kritické workstreamy
- tým nebude vědět, co může bezpečně odložit
- support a compliance scope se nafouknou dřív, než bude potvrzený core value of collaboration hub
- zpoždění marketplace části zablokuje launch celé verze

### Cheaper alternative
Udělati marketplace jako `MVP Stream 2`, ne `Stream 1`.

Stream 1:
- project hub
- file/version/comments
- collaborator invites
- ownership records
- subscription

Stream 2:
- gigs
- applications
- hire
- payment + payout

### Recommendation
Před backlogem uzamknout jednu z těchto variant:

Option A:
`Marketplace is MVP Stream 1 and launch-blocking.`

Option B:
`Marketplace is MVP Stream 2 and not required for initial customer-ready launch.`

Doporučení red teamu:
`Option B`, pokud cílem není primárně ověřit marketplace liquidity.

---

## 2. Must Every Gig Be Attached to a Project?

### Current assumption
Dokumenty předpokládají handoff do collaboration workflow, ale neříkají jasně, kdy a jak vzniká projektový kontext.

Relevant references:
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:157)
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:227)
- [Role_Lifecycle_Tables_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/Role_Lifecycle_Tables_MUSICCOLLABHUB.md:136)

### Red-team challenge
Pokud gig může existovat bez projektu, je to jednodušší pro marketplace funnel, ale otevírá to zásadní otázky:
- kdy se vytvoří project workspace
- kdy se řeší permissions
- kdy se poprvé sdílí assety
- co přesně dostane hired talent po acceptu

Pokud gig musí být navázaný na projekt od začátku, je to čistší pro collaboration, ale zvyšuje tření pro create gig flow.

### What breaks if wrong
Bez explicitního rozhodnutí se rozpadne:
- datový model
- onboarding
- permissions
- UX handoff po hire
- acceptance criteria pro marketplace a project hub

### Cheaper alternative
Zavést tvrdé pravidlo:

Variant 1:
`Every gig must belong to an existing project.`

Variant 2:
`Gig may exist standalone; project is created only on hire.`

### Recommendation
Red-team doporučení:
`Variant 1` pro MVP.

Proč:
- jednodušší permissions
- jednodušší asset scoping
- jednodušší hire handoff
- menší prostor pro nejasnosti v access modelu

Cena za to:
- create gig flow bude o něco těžší

Ale je to levnější než navrhovat dva různé lifecycle modely.

---

## 3. What Exactly Triggers Payout Release?

### Current assumption
Payout release je zatím otevřený mezi:
- buyer approval
- timed release

Relevant references:
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:252)
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:255)
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:415)
- [Role_Lifecycle_Tables_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/Role_Lifecycle_Tables_MUSICCOLLABHUB.md:219)

### Red-team challenge
Tohle není implementation detail. Je to jedna z nejdůležitějších business rules v celém marketplace.

Pokud zůstane otevřená, tým nemůže správně navrhnout:
- payment lifecycle
- payout lifecycle
- support operations
- cancellation/refund flows
- delivery confirmation UX

### What breaks if wrong
- payouty se budou chovat nekonzistentně
- support nebude vědět, kdy holdnout a kdy releasenout
- buyer a talent budou mít rozdílná očekávání
- právní copy může tvrdit něco jiného než reálný workflow

### Cheaper alternative
Vybrat jednu jednoduchou MVP policy:

Variant 1:
`Buyer approval required. No approval, no payout release.`

Variant 2:
`Timed release only. If not disputed within N days, payout is released automatically.`

Variant 3:
`Buyer approval OR automatic release after N days.`

### Recommendation
Red-team doporučení:
`Variant 3`, ale jen pokud support proces explicitně počítá s hold akcí.

Pro MVP to dává nejmenší reputační riziko:
- buyer má kontrolní moment
- talent má pojistku proti nekonečnému čekání

Nutné doplnit přesný parametr:
- `N = 7 days after delivery`

Bez přesného `N` to není rozhodnutí.

---

## 4. What Asset Access Does Hired Talent Actually Get?

### Current assumption
Projektové assety jsou private by default a permissions jsou role-based. Ale hired talent access model není přesně definovaný.

Relevant references:
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:145)
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:157)
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:217)
- [PRD_v2_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/PRD_v2_MUSICCOLLABHUB.md:318)
- [Role_Lifecycle_Tables_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/Role_Lifecycle_Tables_MUSICCOLLABHUB.md:12)
- [Role_Lifecycle_Tables_MUSICCOLLABHUB.md](/Users/lubman/Sites/MusicolabHub/Role_Lifecycle_Tables_MUSICCOLLABHUB.md:13)

### Red-team challenge
Tohle je pravděpodobně nejcitlivější trust otázka celého produktu.

Pokud hired talent po acceptu automaticky dostane plný project access:
- buyer může váhat použít marketplace
- privacy promise je oslabený
- riziko asset leakage roste

Pokud hired talent dostane jen preview access:
- marketplace spolupráce nemusí být prakticky použitelná

### What breaks if wrong
- security model
- permissions design
- file delivery UX
- trust conversion u buyerů
- support zátěž kolem “who saw/downloaded what”

### Cheaper alternative
MVP zavést explicitní asset access policy:

Variant 1:
`Hired talent is added as Editor to the full project.`

Variant 2:
`Hired talent is added to a scoped project workspace created for the gig.`

Variant 3:
`Hired talent gets Viewer/Commenter by default, owner must explicitly grant file upload/download scope.`

### Recommendation
Red-team doporučení:
`Variant 3` pro MVP.

Default:
- hired talent gets `Commenter` or restricted `Viewer`

Explicit escalation:
- owner must grant broader access before sensitive assets become downloadable

Proč:
- drží privacy promise
- snižuje reputační risk
- nutí systém mít jasný “access grant” moment

Cena:
- o něco více UX friction

Ale ten friction je levnější než security incident.

---

## 5. Decision Snapshot

Tady jsou red-team doporučení v nejkratší použitelné podobě:

| Decision | Red-team recommendation |
|----------|-------------------------|
| Marketplace in MVP | `Stream 2`, not launch-blocking |
| Gig-project relationship | Every gig belongs to an existing project |
| Payout release | Buyer approval or auto-release after 7 days |
| Hired talent asset access | Restricted by default, explicit escalation required |

---

## 6. What Must Be Locked Before Writing Issues

Bez těchto čtyř uzamčení vznikne backlog se špatným směrem:
- marketplace scope priority
- gig-to-project binding rule
- payout release policy with exact timing
- hired talent asset access default

Jakmile budou uzamčené, má smysl:
1. aktualizovat `PRD_v2`
2. aktualizovat `Role_Lifecycle_Tables`
3. teprve potom rozpadnout epiky a issues

---

## 7. Suggested Review Format

Pro další founder review použít ke každému bodu pouze tuto strukturu:

- `Decision`
- `Accept / reject / modify`
- `Why`
- `Operational consequence`

To review drží krátké a nutí skutečné rozhodnutí místo dalšího brainstormingu.
