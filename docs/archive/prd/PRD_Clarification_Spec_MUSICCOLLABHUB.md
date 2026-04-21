# MusicCollabHub - PRD Clarification Spec

**Source draft:** `Pre-PRD_MUSICCOLLABHUB.md`  
**Purpose:** uzavřít rozhodnutí blokující rozpad do epiků, stories a delivery plánu  
**Recommendation:** tento dokument použít jako podklad pro `PRD v2`

---

## 1. MVP Boundary

### Doporučené rozhodnutí
První release slice je **collaboration hub + jednoduchý marketplace hiring flow**. Není to plnohodnotný audio collaboration editor ani royalty platforma. Cílem MVP je ověřit, že hudební tvůrci:

1. založí projekt,
2. bezpečně nasdílí soubory,
3. pozvou collaboratora,
4. předají si feedback,
5. pokud chtějí, najdou nebo najmou externího talentu,
6. zadají ownership split jako evidenci dohody.

### Co musí být v MVP bez debat
- autentizace, účet a základní onboarding
- vytvoření projektu a správa projektu
- upload a storage souborů
- verzování projektu na úrovni release snapshotů
- collaborator invitations a role-based permissions
- komentáře k projektu a souborům
- activity log a notifikace
- profil uživatele a portfolio
- create/browse/apply/accept flow pro gigy
- Stripe checkout pro subscription
- Stripe Connect pro marketplace payouty
- evidence ownership splitů

### Co je explicitně mimo MVP
- DAW live sync
- AI stem separation
- waveform-level timestamped comments jako povinný základ
- real-time collaborative editing audia
- chat
- reviews a ratings
- dispute automation
- royalty ingestion ze Spotify/Apple
- automatické monthly royalty payouts
- escrow s komplexním release workflow
- invoices/tax document automation mimo standardní Stripe výstupy

### Primární cíl první verze
Primárně **collaboration hub**, sekundárně **marketplace acquisition/use-case extension**. Marketplace v MVP nesmí zablokovat dodání collaboration core.

### Demo-ready vs customer-ready
- `demo-ready`: založení projektu, upload, invite collaboratora, komentáře, vytvoření gigu
- `customer-ready`: vše z demo-ready plus billing, access control, audit log, lifecycle stavy, email notifikace, základní support/admin operace, bezpečný storage model

---

## 2. Personas

### Primární uživatel v MVP
`Project Owner / Creator`
- producent, songwriter, beatmaker nebo indie artist
- zakládá projekt
- nahrává soubory
- zve collaborateory
- zadává gig
- platí subscription

### Sekundární uživatelé
`Collaborator`
- mix engineer, vocalist, instrumentalist, producer-for-hire
- dostane invite do projektu nebo se přihlásí na gig

`Talent Marketplace User`
- freelancer s portfoliem
- prochází gigy a aplikuje se

### Kdo platí
- subscription platí `Project Owner`
- marketplace fee je stržená z transakce mezi buyerem a hired talentem

### Kdo vytváří projekt
- pouze registrovaný uživatel s aktivním účtem
- ve free trial nebo free tier může být limitován počtem aktivních projektů

### Kdo je hired collaborator
- uživatel, který byl:
  - pozván přímo do projektu, nebo
  - přijat přes gig flow

### Admin/support role v MVP
Ano, ale pouze interní.
- `Admin`: správa účtů, gigů, projektů, payout statusů
- `Support`: read-heavy operace, ruční zásahy do abuse/dispute/suspension flow

---

## 3. Core User Flows

## 3.1 Vytvoření účtu a onboardingu
- Spouštěč: návštěvník chce založit účet
- Hlavní kroky:
  1. zadá email/password nebo použije social login
  2. ověří email
  3. vybere roli/use case: creator, collaborator, both
  4. doplní display name, genres, skills
  5. systém vytvoří profil a prázdné portfolio
- Výsledek: aktivní účet a dokončený onboarding
- Failure:
  - email už existuje
  - neověřený email blokuje create project a apply na gig
  - nedokončený onboarding omezuje marketplace viditelnost profilu

## 3.2 Založení projektu
- Spouštěč: přihlášený creator klikne na `Create Project`
- Hlavní kroky:
  1. zadá název projektu
  2. zvolí typ projektu: single, EP, album, custom
  3. doplní popis, žánr, případně tempo/key metadata
  4. systém vytvoří prázdný project shell
- Výsledek: projekt ve stavu `active`
- Failure:
  - user překročil limit plánu
  - billing issue blokuje další projekty

## 3.3 Upload souborů
- Spouštěč: owner/editor otevře projekt a nahraje soubory
- Hlavní kroky:
  1. vybere soubory
  2. upload proběhne do storage
  3. backend uloží metadata a zařadí soubory do aktuální verze draftu
  4. user může publishnout novou verzi snapshotu
- Výsledek: soubory jsou dostupné v projektu
- Failure:
  - nepodporovaný formát
  - soubor je moc velký
  - upload timeout/network fail
  - dedupe/hash check označí stejný soubor

## 3.4 Pozvání collaboratora
- Spouštěč: owner chce přizvat dalšího člověka
- Hlavní kroky:
  1. zadá email nebo vybere existujícího usera
  2. zvolí roli
  3. systém odešle invite
  4. příjemce invite přijme
- Výsledek: collaborator získá přístup k projektu
- Failure:
  - user neexistuje a invite email se nedoručí
  - invite expiruje
  - owner nemá oprávnění zvát

## 3.5 Komentování feedbacku
- Spouštěč: collaborator otevře projekt nebo konkrétní soubor
- Hlavní kroky:
  1. vybere file/thread context
  2. přidá komentář
  3. případně mentionne dalšího usera
  4. systém uloží thread a notifikuje relevantní členy
- Výsledek: vznikne komentářový thread
- Failure:
  - user má jen view access
  - soubor nebo verze byly mezitím archivovány

## 3.6 Publikace gigu
- Spouštěč: owner chce najít externí talent
- Hlavní kroky:
  1. založí gig draft
  2. vyplní title, description, budget, category, deadline
  3. zvolí visibility a počet hire slots
  4. publikuje gig
- Výsledek: gig je searchable v marketplace
- Failure:
  - chybí povinná pole
  - user nemá aktivní billing

## 3.7 Přihlášení na gig
- Spouštěč: talent najde gig
- Hlavní kroky:
  1. otevře gig detail
  2. odešle application s message, cenou nebo potvrzením budgetu
  3. buyer obdrží notif
- Výsledek: application ve stavu `submitted`
- Failure:
  - user není onboarding-complete
  - user už aplikoval
  - gig je closed/cancelled

## 3.8 Přijetí collaboratora
- Spouštěč: buyer vybere kandidáta
- Hlavní kroky:
  1. otevře applications
  2. vybere kandidáta
  3. potvrdí hire
  4. systém vytvoří marketplace contract record
  5. hired user dostane přístup do projektu nebo nového linked projektu
- Výsledek: application `accepted`, ostatní `rejected` nebo `expired`
- Failure:
  - payment authorization fail
  - gig byl mezitím uzavřen

## 3.9 Nastavení ownership splitu
- Spouštěč: owner chce zapsat dohodu contributorů
- Hlavní kroky:
  1. vybere track nebo projekt
  2. přidá contributors a role
  3. zadá procenta
  4. systém validuje součet 100 %
  5. odešle split k potvrzení
- Výsledek: split `pending_confirmation` nebo `confirmed`
- Failure:
  - součet není 100 %
  - contributor není přiřazen k projektu
  - contributor split odmítne

## 3.10 Platba / payout
- Spouštěč: user aktivuje subscription nebo buyer platí hired talent
- Hlavní kroky:
  1. Stripe checkout / payment intent
  2. systém uloží payment status
  3. při marketplace flow se částka rozdělí na platform fee a payout balance
  4. payout proběhne přes Stripe Connect dle pravidel hold period
- Výsledek: payment `succeeded`, payout `scheduled` nebo `paid`
- Failure:
  - karta odmítnuta
  - KYC incomplete
  - payout account není onboarded

---

## 4. Project Hub

### Podporované typy souborů v MVP
- audio preview/export: `.mp3`, `.wav`, `.aiff`
- compressed project package: `.zip`
- document/reference: `.pdf`, `.txt`, `.docx`
- image assets: `.png`, `.jpg`

### Nepodporované v MVP
- nativní DAW parsing a semantic understanding souborů
- live plugin/session sync

### Limity uploadu
- per file: `2 GB`
- per project total soft limit: `20 GB` v základním plánu
- batch upload: ano, ale zpracování je per-file

### Upload model
- UI podporuje multi-file batch upload
- backend zpracovává každý soubor zvlášť
- selhání jednoho souboru nesmí shodit celý batch

### Co je verze projektu
Verze je **pojmenovaný snapshot sady souborů a metadat**. Nejde o git-like diff model.

Každá verze obsahuje:
- název verze
- autor verze
- timestamp
- seznam souborů
- release note / changelog text

### Kdo může přidat novou verzi
- `Owner`
- `Editor`
- `Commenter` ne
- `Viewer` ne

### Conflict při paralelní práci
- MVP neřeší merge
- poslední publishnutá verze je platná reference
- paralelní uploady jsou povoleny
- publish snapshotu je serializovaný action point
- při publishi systém upozorní, pokud od otevření obrazovky vznikla novější verze

### Komentáře
- MVP comments jsou `plain text thread comments`
- comment může být navázaný na:
  - projekt,
  - konkrétní soubor,
  - konkrétní verzi
- timestamped waveform comments jsou `nice to have`, ne hard dependency MVP

### Real-time vs refresh
- MVP: notifikace + polling/refresh + optimistic UI
- WebSocket jen pro lightweight collaboration events:
  - new comment
  - invite accepted
  - version published
- ne pro live audio sync

---

## 5. Permissions

### Projektové role
- `Owner`
- `Editor`
- `Commenter`
- `Viewer`
- `Admin` mimo běžný projektový model

### Oprávnění podle role

| Akce | Owner | Editor | Commenter | Viewer |
|------|-------|--------|-----------|--------|
| View project | ano | ano | ano | ano |
| Upload file | ano | ano | ne | ne |
| Publish version | ano | ano | ne | ne |
| Add comment | ano | ano | ano | ne |
| Invite collaborator | ano | volitelně ne v MVP | ne | ne |
| Edit project metadata | ano | ano | ne | ne |
| Manage split | ano | ne | ne | ne |
| View split | ano | ano | ne default | ne |
| Delete files/comments | ano | omezeně | ne | ne |

### View / Comment / Edit význam
- `view`: číst projekt, stáhnout povolené soubory, vidět activity feed
- `comment`: totéž plus zakládat a odpovídat ve threadech
- `edit`: totéž plus upload, metadata edit, publish verze

### Může editor zvát další lidi?
Ne v MVP. Zvaní je pouze owner action. Snižuje to bezpečnostní a billing komplexitu.

### Může collaborator vidět financial/split info?
- hired collaborator přes marketplace: ne default
- explicitně přidaný contributor ve splitu: ano, ale jen relevantní split record

### Mazání
- soubory a verze maže pouze owner
- editor může smazat své nepublishnuté uploady
- komentář:
  - autor může smazat svůj komentář do 15 minut
  - owner může moderovat komentáře v projektu

---

## 6. Marketplace

### Scope MVP
MVP je **end-to-end lightweight hiring flow**, ne jen job board.

Obsahuje:
- create draft gig
- publish gig
- browse/search gigs
- apply
- shortlist/accept
- payment capture
- collaborator access handoff

Neobsahuje:
- public reviews a ratings
- milestone engine
- dispute center
- revision rounds automation

### Portfolio
Portfolio je součást user profilu a obsahuje:
- headline
- bio
- skills
- genres
- price range
- 1 až 10 audio sample links nebo uploaded previews
- odkazy na externí práci

### Kdo může publikovat gig
- onboarding-complete user
- s aktivním nebo trial subscription

### Buyer i talent v jednom účtu
Ano. Jeden účet může mít obě role.

### Lifecycle gigu v MVP
- `draft`: rozpracovaný, neveřejný
- `published`: veřejný, přijímá applications
- `applied`: interní mezistav; gig má alespoň jednu application
- `hired`: byl vybrán talent, další applications uzavřeny
- `in_progress`: spolupráce probíhá
- `delivered`: talent označil práci jako doručenou
- `approved`: buyer schválil dodání
- `closed`: finančně uzavřeno
- `cancelled`: zrušeno před uzavřením

### Revision rounds
Nejsou součástí MVP jako systémový workflow. Lze řešit komentáři a novými verzemi projektu.

### Dispute
V MVP ručně přes support ticket.

---

## 7. Payments

### Subscription model
Navržené plány:
- `Free Trial`: 14 dní, 1 aktivní projekt, omezený storage
- `Creator Basic`: €12/měsíc, 5 aktivních projektů, 50 GB storage
- `Creator Pro`: €29/měsíc, 25 aktivních projektů, 250 GB storage, vyšší marketplace visibility v budoucnu

### Co se stane po neúspěšné subscription platbě
- Stripe retry policy
- účet přejde do `past_due`
- grace period 7 dní
- po grace period:
  - blokace nových uploadů
  - blokace nových projektů a gig publish
  - read access k existujícím projektům zachován

### Marketplace payment model
- escrow: `ne v právním/službovém smyslu`, ale platform hold ano
- commission: strhává se při úspěšné platbě
- payout: uvolnění po buyer approval nebo automaticky po 7 dnech bez námitky
- refunds/cancellations:
  - před hire: plný refund buyerovi
  - po hire, před delivery: ručně přes support
  - po approval: refund jen support decision

### Stripe Connect
Ano, pro payout hired collaboratorům je v MVP potřeba.

### VAT / invoices / tax docs
- subscription invoices řeší Stripe
- marketplace tax/tax docs minimálně přes Stripe Connect capabilities
- vlastní daňový engine není součást MVP
- product copy musí jasně říkat, že user odpovídá za vlastní tax compliance tam, kde to Stripe nepokrývá

---

## 8. Ownership Splits

### Scope MVP
Pouze **evidence + confirmation workflow**, ne právní enforcement engine.

### Kdo může split vytvořit
- pouze `Owner`

### Kdo musí split potvrdit
- všichni contributors, kteří mají nenulový podíl

### Lze split po potvrzení změnit?
Ano, ale jen vytvořením nové revize splitu:
- starý split = `superseded`
- nový split = znovu `pending_confirmation`

### Co když součet není 100 %
- split nelze odeslat k potvrzení
- draft může být uložen i pod 100 %, ale ne confirmed

### Split per project nebo per song/track
- MVP podporuje:
  - `project-level split`
  - volitelně `track-level split`, pokud je projekt typu multi-track release

Pokud je tým omezen kapacitou, doporučení je dodat nejdřív pouze `project-level split`.

### Split sheet
- je to export i workflow record
- export do PDF je nice-to-have
- source of truth je aplikace a audit trail změn

---

## 9. Royalty Tracking

### Rozhodnutí
Není součást MVP jako skutečný ingestion/reporting systém.

### Přesné přejmenování feature pro MVP
Místo `Royalty Tracking` použít:
- `Ownership & Contributor Records`

### Co zůstává v MVP
- ownership splits
- contributor roles
- exportable split summary

### Co je mimo MVP
- Spotify/Apple integrace
- automatický earnings dashboard
- monthly payouts z royalties

### Co znamená “monthly payouts”
V MVP nic. Tento termín odstranit z PRD v2, protože evokuje hotový licenční a účetní systém.

---

## 10. Non-Functional Requirements

### Kapacitní předpoklady MVP
- cílová velikost projektu: typicky `1-10 GB`
- hard upper bound na projekt: `20 GB` Basic, vyšší dle plánu
- soubory na projekt: typicky `20-200`
- současně aktivní projekty v MVP: `1 000`

### Performance cíle
- upload init: do `2 s`
- metadata persistence po uploadu: do `5 s` po dokončení souboru
- open project detail: `p95 < 2.5 s`
- create comment: `p95 < 1 s`
- gig search result first render: `p95 < 2 s`

### Audit trace
Povinně logovat:
- login
- signup completion
- project create/update/archive
- file upload/delete
- version publish
- invite sent/accepted/revoked
- role change
- comment create/delete
- gig create/publish/cancel
- application submit/accept/reject
- split create/confirm/supersede
- payment status change
- payout status change

### Security
- private by default pro všechny projekty a soubory
- signed URLs pro file access
- server-side authorization na každém asset requestu
- encryption at rest přes cloud provider
- základní rate limiting, audit logging, email verification

### Backup / restore / retention
- daily DB backup
- object storage versioning tam, kde dává smysl
- soft delete 30 dní pro projekt metadata
- retention policy popsat v TOS/privacy

---

## 11. Legal / Compliance

### Minimální copyright/TOS model
- platform je collaboration a hiring infrastructure
- uživatel nese odpovědnost za obsah, oprávnění a claims
- platform má právo obsah odstranit/suspendovat při credible complaint

### Ownership claims odpovědnost
- nese ji user, ne platforma
- platforma pouze eviduje deklarované splits a confirmations

### Explicitní souhlasy contributorů
Ano. Potvrzení splitu a acceptance marketplace hire musí být explicitní action.

### Privacy default
Ano, obsah projektu je privátní by default.

### GDPR export/delete v MVP
Ano, minimálně:
- account delete request
- export základních account dat
- odstranění nebo anonymizace osobních údajů tam, kde to není blokováno accounting/legal retention

---

## 12. Admin / Support

### Admin dashboard v MVP
Ano, ale interní lightweight verze.

### Minimální admin capabilities
- vyhledat usera, projekt, gig, payment record
- suspendovat účet
- unpublish/suspendovat gig
- omezit přístup k projektu
- zobrazit payout/KYC status
- zobrazit audit trail

### Support use cases
- dispute: ruční ticket a interní decision log
- payout issue: kontrola Connect statusu a payment state
- abuse report: dočasná suspendace obsahu
- copyright complaint: takedown flow s audit záznamem

### Suspendace
Ano:
- účet
- gig
- projekt

---

## 13. Analytics

### MVP KPIs
- signup to onboarding completion rate
- onboarding completion to first project creation
- project creation to first upload
- project creation to first collaborator invite
- published gig to first application rate
- application to hire rate
- paid subscriber conversion rate
- monthly retained active creators

### Eventy od day 1
- `signup_started`
- `signup_completed`
- `email_verified`
- `onboarding_completed`
- `project_created`
- `project_archived`
- `file_upload_started`
- `file_uploaded`
- `version_published`
- `collaborator_invited`
- `collaborator_joined`
- `comment_added`
- `gig_created`
- `gig_published`
- `gig_applied`
- `gig_application_accepted`
- `split_created`
- `split_confirmed`
- `subscription_checkout_started`
- `payment_succeeded`
- `payment_failed`
- `connect_onboarding_started`
- `payout_paid`

### Activation metric
`Creator activation = user do 7 dní od signupu vytvoří projekt, nahraje alespoň 1 soubor a pozve alespoň 1 collaboratora`

---

## 14. Acceptance Criteria

## 14.1 Project creation
- Given přihlášený user s oprávněným plánem
- When založí nový projekt a vyplní povinná pole
- Then systém vytvoří projekt a otevře project detail

- Edge case: user přesáhl limit aktivních projektů
- Failure case: projekt se nevytvoří a user vidí jasný billing/limit error
- Done when: projekt lze vytvořit, zobrazit a auditovat

## 14.2 File upload
- Given owner nebo editor otevřel projekt
- When nahraje podporovaný soubor pod limitem
- Then soubor se uloží, zobrazí v seznamu a zaloguje se event

- Edge case: batch upload s jedním chybným souborem
- Failure case: nepodporovaný formát nebo překročený limit vrátí file-level error
- Done when: úspěšný upload je dohledatelný v UI, DB i audit logu

## 14.3 Collaborator invite
- Given owner je v projektu
- When pošle invite validnímu emailu s vybranou rolí
- Then vznikne pending invite a odejde notifikace

- Edge case: invite jde existujícímu i novému userovi
- Failure case: expired/revoked invite nelze přijmout
- Done when: invited user po acceptu skutečně získá správná práva

## 14.4 Commenting
- Given user má comment nebo edit access
- When přidá komentář k projektu, verzi nebo souboru
- Then thread se uloží a relevantní členové dostanou notif

- Edge case: komentář k archivované verzi je read-only
- Failure case: viewer nemůže komentovat
- Done when: comment thread je perzistentní, autorizovaný a auditovaný

## 14.5 Gig publish
- Given onboarding-complete creator s aktivním billingem
- When publikuje validně vyplněný gig
- Then gig je dohledatelný v marketplace

- Edge case: user uloží draft bez publikace
- Failure case: chybějící povinná pole nebo billing fail blokují publish
- Done when: gig přechází mezi `draft` a `published` konzistentně

## 14.6 Gig application and hire
- Given published gig
- When talent odešle application a buyer ji přijme
- Then application se označí jako accepted a hired user dostane další instrukce/přístup

- Edge case: více applications na jeden gig
- Failure case: application na closed gig selže
- Done when: lifecycle application i gigu je auditovatelný a konzistentní

## 14.7 Ownership split
- Given owner má projekt a seznam contributorů
- When vytvoří split se součtem 100 % a odešle jej
- Then split přejde do `pending_confirmation`

- Edge case: contributor odmítne split
- Failure case: součet není 100 % a split nejde submitnout
- Done when: systém drží historii revizí a stav potvrzení po uživatelích

## 14.8 Payments
- Given user zahájí checkout nebo payout workflow
- When Stripe vrátí success status
- Then interní payment record se propíše do správného stavu

- Edge case: asynchronous webhook dorazí později než návrat uživatele z checkoutu
- Failure case: declined card nebo incomplete Connect onboarding blokuje další krok
- Done when: UI stav, backend stav a Stripe stav jsou konzistentní

---

## Doporučené artefakty po této specifikaci

### 1. PRD v2
Musí reflektovat tato rozhodnutí:
- marketplace je lightweight hiring flow
- royalty tracking se v MVP přejmenovává a de-scopeuje
- comments v MVP nejsou povinně timestamped waveform comments
- versioning je snapshot-based, ne merge-based

### 2. MVP boundary doc
Založit jako separátní dokument se 3 sloupci:
- `in MVP`
- `post-MVP`
- `open question / deferred decision`

### 3. Role + lifecycle tables
Samostatně popsat:
- project roles
- gig lifecycle
- application lifecycle
- split lifecycle
- payment/payout lifecycle

### 4. Epic backlog seed
Navržené epiky:
- Auth & Onboarding
- Profiles & Portfolio
- Project Hub Foundation
- File Upload & Storage
- Versioning & Activity Log
- Collaboration & Comments
- Invitations & Permissions
- Marketplace Gigs
- Applications & Hiring
- Billing & Subscription
- Marketplace Payments & Connect
- Ownership Splits
- Admin & Support
- Analytics & Audit

---

## Otevřená rozhodnutí, která ještě mohou chtít founder review

- Má MVP opravdu dodat `track-level splits`, nebo pouze `project-level`?
- Má editor mít právo zvát další collaborateory ve vyšším plánu, nebo nikdy?
- Má být buyer approval povinný pro payout release, nebo chceme auto-release vždy po fixní lhůtě?
- Má free tier existovat i po trialu, nebo jen trial -> paid?
- Má být marketplace navázaný vždy na projekt, nebo může existovat i bez navazujícího project hubu?
