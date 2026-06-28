# MusicCollabHub – Requirement Index

**Účel:** kanonický seznam požadavků pro PRD conformance audit.  
**Verze zdrojových dokumentů:** PRD v2.1, Decision Log (current), Red Team Matrix, Role Lifecycle Tables.  
**Stav:** žádné statusy ani mapování kódu – pouze ID a text požadavku.

---

## R-8.1 – Project Hub (PRD §8.1)

| ID | Požadavek | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| R-8.1-01 | Systém musí podporovat upload souborů typu `.mp3` | PRD §8.1 – Supported file types |
| R-8.1-02 | Systém musí podporovat upload souborů typu `.wav` | PRD §8.1 – Supported file types |
| R-8.1-03 | Systém musí podporovat upload souborů typu `.aiff` | PRD §8.1 – Supported file types |
| R-8.1-04 | Systém musí podporovat upload souborů typu `.zip` | PRD §8.1 – Supported file types |
| R-8.1-05 | Systém musí podporovat upload souborů typu `.pdf` | PRD §8.1 – Supported file types |
| R-8.1-06 | Systém musí podporovat upload souborů typu `.txt` | PRD §8.1 – Supported file types |
| R-8.1-07 | Systém musí podporovat upload souborů typu `.docx` | PRD §8.1 – Supported file types |
| R-8.1-08 | Systém musí podporovat upload souborů typu `.png` | PRD §8.1 – Supported file types |
| R-8.1-09 | Systém musí podporovat upload souborů typu `.jpg` | PRD §8.1 – Supported file types |
| R-8.1-10 | UI musí umožnit hromadný upload více souborů najednou (multi-file batch upload) | PRD §8.1 – Upload model |
| R-8.1-11 | Backend musí zpracovávat soubory individuálně (per-file processing) | PRD §8.1 – Upload model |
| R-8.1-12 | Chyba jednoho souboru v dávce nesmí způsobit selhání celé dávky | PRD §8.1 – Upload model |
| R-8.1-13 | Verze jsou pojmenované snapshoty (named snapshots) | PRD §8.1 – Versioning model |
| R-8.1-14 | V MVP se neimplementuje git-like merge logika | PRD §8.1 – Versioning model |
| R-8.1-15 | Každá verze musí obsahovat: autora, časové razítko, changelog a seznam souborů | PRD §8.1 – Versioning model |
| R-8.1-16 | Publikovat verze může pouze owner a editor | PRD §8.1 – Versioning model |
| R-8.1-17 | Komentáře jsou plain-text vlákna (comment threads) | PRD §8.1 – Commenting model |
| R-8.1-18 | Komentáře mohou cílit na projekt, soubor nebo verzi | PRD §8.1 – Commenting model |
| R-8.1-19 | Waveform komentáře s časovým razítkem nejsou v MVP povinné | PRD §8.1 – Commenting model |
| R-8.1-20 | Real-time model je pouze lightweight event delivery (polling, refresh, optimistic UI nebo WebSocket pro komentáře/pozvánky/publikaci verze) | PRD §8.1 – Real-time model |
| R-8.1-21 | Live sync editace není součástí MVP | PRD §8.1 – Real-time model |

---

## R-8.2 – Permissions (PRD §8.2)

| ID | Požadavek | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| R-8.2-01 | Projektové role jsou: Owner, Editor, Commenter, Viewer | PRD §8.2 |
| R-8.2-02 | V MVP může pozvánky ke spolupráci zasílat pouze owner | PRD §8.2 – Rules |
| R-8.2-03 | Spravovat ownership splity může pouze owner | PRD §8.2 – Rules |
| R-8.2-04 | Editor může nahrávat soubory a publikovat verze | PRD §8.2 – Rules |
| R-8.2-05 | Commenter má pouze přístup ke čtení a přidávání komentářů | PRD §8.2 – Rules |
| R-8.2-06 | Viewer má přístup pouze ke čtení | PRD §8.2 – Rules |
| R-8.2-07 | Soubory projektu jsou standardně soukromé (private by default) | PRD §8.2 – Rules |
| R-8.2-08 | Najatý talent (hired talent) ve výchozím stavu nezíská plný přístup k projektu | PRD §8.2 – Rules |
| R-8.2-09 | Owner musí explicitně udělit širší přístup k assetům najatému talentu, pokud je to potřeba | PRD §8.2 – Rules |

---

## R-8.3 – Marketplace (PRD §8.3)

| ID | Požadavek | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| R-8.3-01 | Systém musí umožnit vytvoření draftu gigu pod existujícím projektem | PRD §8.3 – Marketplace scope |
| R-8.3-02 | Systém musí umožnit publikaci gigu | PRD §8.3 – Marketplace scope |
| R-8.3-03 | Systém musí umožnit procházení a filtrování gigů | PRD §8.3 – Marketplace scope |
| R-8.3-04 | Systém musí umožnit odeslání přihlášky na gig (submit application) | PRD §8.3 – Marketplace scope |
| R-8.3-05 | Systém musí umožnit přijetí uchazeče (accept applicant) | PRD §8.3 – Marketplace scope |
| R-8.3-06 | Po přijetí uchazeče musí systém provést handoff s omezeným přístupem ke spolupráci | PRD §8.3 – Marketplace scope |
| R-8.3-07 | Marketplace neobsahuje recenze a hodnocení | PRD §8.3 – Marketplace exclusions |
| R-8.3-08 | Marketplace neobsahuje milestone workflows | PRD §8.3 – Marketplace exclusions |
| R-8.3-09 | Marketplace neobsahuje automatizované centrum pro spory | PRD §8.3 – Marketplace exclusions |
| R-8.3-10 | Marketplace neobsahuje systém revizních kol | PRD §8.3 – Marketplace exclusions |
| R-8.3-11 | Marketplace je Stream 2 a není podmínkou prvního customer-ready release | PRD §8.3 – Delivery model |
| R-8.3-12 | Každý gig musí patřit pod existující projekt | PRD §8.3 – Delivery model |
| R-8.3-13 | Profil pro marketplace musí obsahovat: headline, bio, skills, genres, price range a až 10 pracovních ukázek nebo odkazů | PRD §8.3 – Portfolio |

---

## R-8.4 – Payments (PRD §8.4)

| ID | Požadavek | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| R-8.4-01 | Předplatné funguje modelem trial → placené plány (bez trvalého free tieru po skončení trialu) | PRD §8.4 – Subscription billing |
| R-8.4-02 | Neúspěšná platba přesune uživatele do stavu `past_due` | PRD §8.4 – Subscription billing |
| R-8.4-03 | Po uplynutí grace period může být blokován upload nových souborů, projektů a publikace gigů | PRD §8.4 – Subscription billing |
| R-8.4-04 | Platby na marketplace jsou vybírány přes Stripe | PRD §8.4 – Marketplace payments |
| R-8.4-05 | Výplaty (payouts) jsou směrovány přes Stripe Connect | PRD §8.4 – Marketplace payments |
| R-8.4-06 | Platformový poplatek (platform fee) je stržen při úspěšné platbě | PRD §8.4 – Marketplace payments |
| R-8.4-07 | Výplata je uvolněna na základě schválení kupujícím nebo automaticky 7 dní po dodání | PRD §8.4 – Marketplace payments |
| R-8.4-08 | Admin/support může pozastavit výplatu (hold) před jejím uvolněním | PRD §8.4 – Marketplace payments |

---

## R-8.5 – Ownership and Contributor Records (PRD §8.5)

| ID | Požadavek | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| R-8.5-01 | Owner vytváří draft splitu | PRD §8.5 – Split workflow |
| R-8.5-02 | V prvním customer-ready release jsou splity pouze na úrovni projektu (ne track-level) | PRD §8.5 – Split workflow |
| R-8.5-03 | Celkový split musí dávat 100 % před odesláním | PRD §8.5 – Split workflow |
| R-8.5-04 | Přispěvatelé s nenulovým podílem musí split potvrdit | PRD §8.5 – Split workflow |
| R-8.5-05 | Potvrzené splity nelze editovat přímo (in place) | PRD §8.5 – Split workflow |
| R-8.5-06 | Změny splitu vyžadují novou revizi, která nahrazuje předchozí | PRD §8.5 – Split workflow |
| R-8.5-07 | Systém je záznamy o přispěvatelích a potvrzením – nikoli ingestion royalties ani právním vymáháním | PRD §8.5 – MVP positioning |

---

## R-8.6 – Admin and Support (PRD §8.6)

| ID | Požadavek | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| R-8.6-01 | Interní nástroje musí umožnit vyhledání uživatelů, projektů, gigů, plateb a výplat | PRD §8.6 |
| R-8.6-02 | Interní nástroje musí umožnit pozastavení účtu (account suspension) | PRD §8.6 |
| R-8.6-03 | Interní nástroje musí umožnit zrušení publikace nebo pozastavení gigu | PRD §8.6 |
| R-8.6-04 | Interní nástroje musí umožnit omezení přístupu k projektu | PRD §8.6 |
| R-8.6-05 | Interní nástroje musí poskytovat viditelnost audit trailu | PRD §8.6 |
| R-8.6-06 | Interní nástroje musí umožnit kontrolu stavu výplat a KYC | PRD §8.6 |

---

## AC – Acceptance Criteria (PRD §13)

| ID | Požadavek | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| AC-01 | Vytváření projektu musí fungovat end-to-end (happy path, edge case, failure state, auditability) | PRD §13 |
| AC-02 | Upload souborů s ukládáním a persistencí metadat musí fungovat end-to-end | PRD §13 |
| AC-03 | Pozvání a přijetí spolupracovníka musí fungovat end-to-end | PRD §13 |
| AC-04 | Vytvoření komentáře s autorizací musí fungovat end-to-end | PRD §13 |
| AC-05 | Vytvoření a potvrzení ownership splitu musí fungovat end-to-end | PRD §13 |
| AC-06 | Reconciliace stavu předplatného (subscription payment state reconciliation) musí fungovat end-to-end | PRD §13 |
| AC-07 | Každá launch-critical schopnost musí mít pokrytý happy path | PRD §13 – Each capability must include |
| AC-08 | Každá launch-critical schopnost musí mít pokryté edge case handling | PRD §13 – Each capability must include |
| AC-09 | Každá launch-critical schopnost musí mít pokryté failure state handling | PRD §13 – Each capability must include |
| AC-10 | Každá launch-critical schopnost musí být auditovatelná | PRD §13 – Each capability must include |
| AC-11 | Stream 2: publikace gigu a jeho discovery musí fungovat end-to-end | PRD §13 – Stream 2 acceptance block |
| AC-12 | Stream 2: přihláška na gig a hire handoff musí fungovat end-to-end | PRD §13 – Stream 2 acceptance block |
| AC-13 | Stream 2: reconciliace stavu marketplace platby a výplaty musí fungovat end-to-end | PRD §13 – Stream 2 acceptance block |

---

## SEC – Red Team Matrix Scenarios (Red_Team_Matrix_MUSICCOLLABHUB.md)

| ID | Požadavek / scénář | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| SEC-01 | Marketplace musí být klasifikován jako Stream 2 (ne Stream 1 / launch-blocking) – jinak delivery scope exploduje na dva kritické workstreamy | Red Team §1 – Recommendation |
| SEC-02 | Každý gig musí patřit pod existující projekt – bez tohoto pravidla se rozpadne datový model, permissions a UX handoff po hire | Red Team §2 – Recommendation |
| SEC-03 | Politika uvolnění výplaty musí být explicitně uzamčena: schválení kupujícím NEBO automatické uvolnění po 7 dnech od dodání | Red Team §3 – Recommendation |
| SEC-04 | Najatý talent musí dostat ve výchozím stavu omezený přístup (Commenter nebo Viewer); širší přístup vyžaduje explicitní udělení ze strany ownera | Red Team §4 – Recommendation |
| SEC-05 | Před zápisem backlogu musí být uzamčeny všechny čtyři rozhodnutí: marketplace scope, gig-to-project binding, payout release policy, hired talent asset access default | Red Team §6 |

---

## RBAC – Role Lifecycle Tables Rules / Transitions (Role_Lifecycle_Tables_MUSICCOLLABHUB.md)

| ID | Požadavek / pravidlo | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| RBAC-01 | Owner, Editor, Commenter, Viewer a Admin mají přístup k zobrazení projektu | Role Lifecycle §1 – Project Roles |
| RBAC-02 | Owner, Editor a Admin mohou stahovat povolené soubory; Commenter a Viewer také | Role Lifecycle §1 – Project Roles |
| RBAC-03 | Soubory mohou nahrávat pouze Owner, Editor a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-04 | Verze mohou publikovat pouze Owner, Editor a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-05 | Metadata projektu mohou editovat pouze Owner, Editor a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-06 | Komentáře mohou přidávat Owner, Editor, Commenter a Admin (Viewer nikoliv) | Role Lifecycle §1 – Project Roles |
| RBAC-07 | Vlastní nedávný komentář mohou smazat Owner, Editor, Commenter a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-08 | Komentáře může moderovat pouze Owner a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-09 | Spolupracovníky může pozvat pouze Owner a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-10 | Roli člena může měnit pouze Owner a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-11 | Spolupracovníka může odebrat pouze Owner a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-12 | Ownership split může zobrazit Owner (plně) a Editor (omezeně, pouze kde to pravidla explicitně povolují) | Role Lifecycle §1 – Project Roles |
| RBAC-13 | Ownership split může spravovat pouze Owner a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-14 | Publikovaný soubor nebo verzi může smazat pouze Owner a Admin | Role Lifecycle §1 – Project Roles |
| RBAC-15 | Přístup k projektu může pozastavit pouze Admin | Role Lifecycle §1 – Project Roles |
| RBAC-16 | Najatý talent musí nastoupit s omezeným přístupem (ne plný project access) | Role Lifecycle §1 – Notes |
| RBAC-17 | Širší přístup k assetům vyžaduje explicitní udělení ownerem a musí být logováno do audit trailu | Role Lifecycle §1 – Notes |
| RBAC-18 | Pozvánku může vytvořit pouze Owner (v MVP) | Role Lifecycle §2 – Invitation Lifecycle Rules |
| RBAC-19 | Přijetí pozvánky musí vytvořit membership s přiřazenou rolí | Role Lifecycle §2 – Invitation Lifecycle Rules |
| RBAC-20 | Odvolaná (revoked) a prošlá (expired) pozvánka není znovupoužitelná | Role Lifecycle §2 – Invitation Lifecycle Rules |
| RBAC-21 | Stav projektu `active`: projekt je dostupný pro spolupráci | Role Lifecycle §3 – Project Lifecycle |
| RBAC-22 | Stav projektu `archived`: projekt je uzavřen pro aktivní práci, ale zachován pro přístup a historii | Role Lifecycle §3 – Project Lifecycle |
| RBAC-23 | Stav projektu `suspended`: admin zablokoval přístup z důvodu zneužití, sporu nebo compliance | Role Lifecycle §3 – Project Lifecycle |
| RBAC-24 | Stav projektu `deleted_soft`: projekt čeká na trvalé smazání v rámci retention okna | Role Lifecycle §3 – Project Lifecycle |
| RBAC-25 | Archivaci projektu provádí owner; pozastavení provádí admin; soft delete zachovává auditability | Role Lifecycle §3 – Project Lifecycle Rules |
| RBAC-26 | Verze `draft`: nahraná data nebo metadata dosud nepublikována jako verze | Role Lifecycle §4 – Project Version Lifecycle |
| RBAC-27 | Verze `published`: immutabilní snapshot viditelný v historii | Role Lifecycle §4 – Project Version Lifecycle |
| RBAC-28 | Verze `superseded`: starší publikovaná verze, která již není aktuální | Role Lifecycle §4 – Project Version Lifecycle |
| RBAC-29 | Verze `deleted_soft`: verze skryta, ale zachována pro retention/audit okno | Role Lifecycle §4 – Project Version Lifecycle |
| RBAC-30 | Publikovat může pouze Owner a Editor; publikace serializuje aktuální draft do stabilní verze; nově publikovaná verze označí předchozí jako `superseded` | Role Lifecycle §4 – Project Version Lifecycle Rules |
| RBAC-31 | Komentářové vlákno `open`: vlákno je aktivní a přijímá odpovědi | Role Lifecycle §5 – Comment Thread Lifecycle |
| RBAC-32 | Komentářové vlákno `resolved`: vlákno je považováno za vyřízené, read-only nebo UI deprioritized | Role Lifecycle §5 – Comment Thread Lifecycle |
| RBAC-33 | Komentářové vlákno `deleted_soft`: vlákno odstraněno z normálního UI, ale zachováno pro audit/moderaci | Role Lifecycle §5 – Comment Thread Lifecycle |
| RBAC-34 | Vlákna mohou vytvářet Commenter, Editor a Owner; pouze autorizovaní uživatelé mohou odpovídat; Owner/Admin mohou vlákna řešit nebo moderovat | Role Lifecycle §5 – Comment Thread Lifecycle Rules |
| RBAC-35 | Stav gigu `draft`: gig existuje, ale není veřejný | Role Lifecycle §6 – Gig Lifecycle |
| RBAC-36 | Stav gigu `published`: gig je viditelný a přijímá přihlášky | Role Lifecycle §6 – Gig Lifecycle |
| RBAC-37 | Stav gigu `hired`: jeden uchazeč byl přijat | Role Lifecycle §6 – Gig Lifecycle |
| RBAC-38 | Stav gigu `delivered`: talent označil práci za dodanou | Role Lifecycle §6 – Gig Lifecycle |
| RBAC-39 | Stav gigu `approved`: kupující přijal dodání | Role Lifecycle §6 – Gig Lifecycle |
| RBAC-40 | Stav gigu `closed`: finanční a workflow stav dokončení | Role Lifecycle §6 – Gig Lifecycle |
| RBAC-41 | Stav gigu `cancelled` nebo `suspended` musí být podporován | Role Lifecycle §6 – Gig Lifecycle |
| RBAC-42 | Přihlášky přijímají pouze publikované gigy; po hire se nové přihlášky uzavírají; každý gig patří pod existující projekt | Role Lifecycle §6 – Gig Lifecycle Rules |
| RBAC-43 | Jeden talent nesmí mít více aktivních přihlášek na stejný gig | Role Lifecycle §7 – Gig Application Lifecycle Rules |
| RBAC-44 | Přijetí přihlášky musí převést konkurující přihlášky do stavu `rejected` nebo `expired` | Role Lifecycle §7 – Gig Application Lifecycle Rules |
| RBAC-45 | Hire/Delivery lifecycle: stav `awaiting_start` – přihláška přijata, čeká se na handoff | Role Lifecycle §8 – Hire / Delivery Lifecycle |
| RBAC-46 | Hire/Delivery lifecycle: stav `delivered` – práce odeslána talentem | Role Lifecycle §8 – Hire / Delivery Lifecycle |
| RBAC-47 | Hire/Delivery lifecycle: stav `approved` – kupující schválil dodání | Role Lifecycle §8 – Hire / Delivery Lifecycle |
| RBAC-48 | Přijatý talent musí začínat s omezeným přístupem, dokud owner explicitně nerozšíří oprávnění | Role Lifecycle §8 – Hire / Delivery Lifecycle Rules |
| RBAC-49 | Split lifecycle: submit je blokován, dokud celkový podíl není 100 % | Role Lifecycle §9 – Ownership Split Lifecycle Rules |
| RBAC-50 | Split lifecycle: první customer-ready release podporuje pouze project-level split záznamy | Role Lifecycle §9 – Ownership Split Lifecycle Rules |
| RBAC-51 | Split lifecycle: pouze Owner vytváří nebo odesílá split | Role Lifecycle §9 – Ownership Split Lifecycle Rules |
| RBAC-52 | Split lifecycle: potvrzený split nelze editovat přímo; revize vytvářejí nové záznamy | Role Lifecycle §9 – Ownership Split Lifecycle Rules |
| RBAC-53 | Potvrzení splitu vyžadují pouze přispěvatelé s nenulovým podílem | Role Lifecycle §10 – Split Confirmation Lifecycle Rules |
| RBAC-54 | Stav rodičovského splitu musí agregovat stavy dětských potvrzení | Role Lifecycle §10 – Split Confirmation Lifecycle Rules |
| RBAC-55 | Subscription lifecycle: `past_due` může zachovat read přístup, ale blokuje nové vytváření | Role Lifecycle §11 – Subscription Lifecycle Rules |
| RBAC-56 | Subscription lifecycle: po trialu musí uživatel přejít na placený plán pro zachování schopností vytváření/uploadu | Role Lifecycle §11 – Subscription Lifecycle Rules |
| RBAC-57 | Stripe je zdrojem pravdy pro billing události; backend je zdrojem pravdy pro vynucování product access | Role Lifecycle §11 – Subscription Lifecycle Rules |
| RBAC-58 | Marketplace payment lifecycle: webhook události musí rekoncilovat finální stav | Role Lifecycle §12 – Marketplace Payment Lifecycle Rules |
| RBAC-59 | Marketplace payment lifecycle: platform fee musí být navázán na úspěšnou platbu | Role Lifecycle §12 – Marketplace Payment Lifecycle Rules |
| RBAC-60 | Payout lifecycle: blocking reasons zahrnují neúplné Stripe Connect onboarding, nevyřízené KYC, neschválenou platbu, nevypršené 7-denní review okno a compliance/support hold | Role Lifecycle §13 – Payout Lifecycle |
| RBAC-61 | Payout lifecycle: výplata může být uvolněna okamžitě na schválení kupujícím NEBO automaticky 7 dní po stavu `delivered`, pokud neexistuje hold | Role Lifecycle §13 – Payout Lifecycle Rules |
| RBAC-62 | Admin akce `suspend_account` musí být podporována | Role Lifecycle §14 – Admin Action Types |
| RBAC-63 | Admin akce `unsuspend_account` musí být podporována | Role Lifecycle §14 – Admin Action Types |
| RBAC-64 | Admin akce `suspend_gig` musí být podporována | Role Lifecycle §14 – Admin Action Types |
| RBAC-65 | Admin akce `unpublish_gig` musí být podporována | Role Lifecycle §14 – Admin Action Types |
| RBAC-66 | Admin akce `restrict_project` musí být podporována | Role Lifecycle §14 – Admin Action Types |
| RBAC-67 | Admin akce `restore_project` musí být podporována | Role Lifecycle §14 – Admin Action Types |
| RBAC-68 | Admin akce `hold_payout` musí být podporována | Role Lifecycle §14 – Admin Action Types |
| RBAC-69 | Admin akce `release_payout` musí být podporována | Role Lifecycle §14 – Admin Action Types |
| RBAC-70 | Každá admin akce musí ukládat: actor, target object, timestamp, reason code a volitelnou interní poznámku | Role Lifecycle §14 – Audit requirement |

---

## DEC – Decision Log (Decision_Log_MUSICCOLLABHUB.md)

| ID | Požadavek / rozhodnutí | Zdroj (doc § / řádek) |
|----|-----------|------------------------|
| DEC-01 | Marketplace = Stream 2, není podmínkou launche (launch-blocking = false) | Decision Log – 2026-04-22 Marketplace priority |
| DEC-02 | Každý gig musí patřit pod existující projekt (no standalone gig lifecycle) | Decision Log – 2026-04-22 Gig to project binding |
| DEC-03 | Politika uvolnění výplaty: schválení kupujícím NEBO automatické uvolnění 7 dní po dodání | Decision Log – 2026-04-22 Payout release policy |
| DEC-04 | Payout lifecycle musí podporovat review window a hold stavy; support/admin může blokovat výplatu před uvolněním | Decision Log – 2026-04-22 Payout release policy – Impact |
| DEC-05 | Najatý talent má ve výchozím stavu omezený přístup; širší přístup k assetům vyžaduje explicitní udělení ownerem | Decision Log – 2026-04-22 Hired talent asset access |
| DEC-06 | Přijetí hire automaticky neznamená plný přístup k projektu; udělení přístupu musí být explicitní a auditně zaznamenané | Decision Log – 2026-04-22 Hired talent asset access – Impact |
| DEC-07 | Split záznamy jsou pouze na úrovni projektu v prvním customer-ready release; track-level granularita je pozdější rozšíření | Decision Log – 2026-04-22 Ownership split granularity |
| DEC-08 | Model předplatného je trial → placený pouze (no permanent free tier after trial); read přístup může zůstat, ale vytváření/upload/publish vyžadují placený status | Decision Log – 2026-04-22 Post-trial plan model |
