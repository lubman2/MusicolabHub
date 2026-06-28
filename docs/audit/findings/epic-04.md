# Audit Findings – Epic 04: Version Management

**Datum auditu:** 2026-06-28  
**Auditor:** Claude Code (read-only, bez úprav kódu)  
**Základní dokument:** PRD v2.1 §8.1 (Versioning model), Requirement Index (`docs/audit/requirement-index.md`)  
**Pokryté ID:** R-8.1-13 až R-8.1-16, RBAC-04, RBAC-14, RBAC-26 až RBAC-30  
**Zkoumané soubory:**
- `src/app/api/projects/[id]/versions/route.ts`
- `src/app/api/projects/[id]/versions/[versionId]/route.ts`
- `src/app/api/projects/[id]/versions/[versionId]/files/route.ts`
- `prisma/schema.prisma` (ř. 241–279)
- `src/app/projects/[id]/versions/page.tsx`
- `src/app/projects/[id]/versions/[versionId]/page.tsx`

---

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.1-13 | Verze jsou pojmenované snapshoty (named snapshots) | ✅ | `prisma/schema.prisma:255` – pole `name String`; `versions/route.ts:144` – validace povinného názvu; `versions/[versionId]/route.ts:53–61` – snapshot vrací jméno + soubory | čteno | Požadavek plně splněn: každá verze nese název, stav, autora, časové razítko a seznam souborů. | — |
| R-8.1-14 | V MVP se neimplementuje git-like merge logika | ✅ | `prisma/schema.prisma:251–269` – model neobsahuje žádné parent/merge relace; `versions/route.ts:173–199` – create pouze zakládá nový `draft` bez merge | čteno | Žádný merge mechanismus v kódu nenalezen. | — |
| R-8.1-15 | Každá verze musí obsahovat: autora, časové razítko, changelog a seznam souborů | ✅ | `prisma/schema.prisma:253–261` – pole `authorId`, `createdAt`, `publishedAt`, `changelog`, `files`; `versions/[versionId]/route.ts:53–91` – GET vrací author (s displayName/email), publishedAt, createdAt, changelog, files[] | čteno | Všechny čtyři prvky přítomny v DB modelu i API response. | — |
| R-8.1-16 | Publikovat verze může pouze owner a editor | ✅ | `versions/[versionId]/route.ts:165–176` – PATCH kontroluje `isOwner \|\| isEditor`; vrátí 403 pro ostatní role | čteno | Role check konzistentní s R-8.1-16. Admin role není explicitně zahrnut (viz RBAC-04 níže). | — |
| RBAC-04 | Verze mohou publikovat pouze Owner, Editor a Admin | 🟡 | `versions/[versionId]/route.ts:165–176` – PATCH povoluje owner a editor; `getAuthUser` nevrací platform-admin flag | čteno | Admin role v membership check chybí. Kód kontroluje pouze `isOwner \|\| isEditor`. Pokud Admin existuje jako projektová role nebo platform-wide role, není v PATCH autorizaci zahrnut. | — |
| RBAC-14 | Publikovaný soubor nebo verzi může smazat pouze Owner a Admin | 🟡 | `versions/[versionId]/route.ts:291–293` – DELETE povoluje pouze `project.ownerId === user.id`; Admin role není kontrolována | čteno | DELETE omezuje operaci striktně na project owner. Admin role (platform nebo projektová) není v autorizaci přítomna. | — |
| RBAC-26 | Verze `draft`: nahraná data nebo metadata dosud nepublikována | ✅ | `prisma/schema.prisma:244–249` – enum `VersionStatus` obsahuje `draft`; `versions/route.ts:174–180` – POST vytváří `status: "draft"` | čteno | Draft stav správně implementován jako výchozí při vytvoření. | — |
| RBAC-27 | Verze `published`: immutabilní snapshot viditelný v historii | ✅ | `versions/[versionId]/route.ts:196–225` – PATCH transakce nastaví `status: "published"` a `publishedAt`; `versions/[versionId]/files/route.ts:74–78` – soubory nelze přidávat k jiným než draft verzím | čteno | Immutabilita published verzí vynucena na API vrstvě (soubory jen do draft); publikace v transakci. | — |
| RBAC-28 | Verze `superseded`: starší publikovaná verze, která již není aktuální | ✅ | `prisma/schema.prisma:247` – enum obsahuje `superseded`; `versions/[versionId]/route.ts:197–200` – transakce nastaví všechny `published` na `superseded` před publikací nové | čteno | Supersede logika atomicky v jedné transakci. | — |
| RBAC-29 | Verze `deleted_soft`: skryta, ale zachována pro retention/audit okno | ✅ | `prisma/schema.prisma:248` – enum obsahuje `deleted_soft`; `versions/[versionId]/route.ts:321–333` – DELETE nastaví `status: "deleted_soft"` a `deletedAt`; `versions/route.ts:73–74` – filtr `deletedAt: null` skrývá smazané záznamy | čteno | Soft-delete správně implementován; `logActivity` voláno po smazání. | — |
| RBAC-30 | Publikovat může pouze Owner a Editor; publikace serializuje draft do stabilní verze; nová verze označí předchozí jako `superseded` | ✅ | `versions/[versionId]/route.ts:165–225` – všechny tři podmínky splněny: authz check, transakce supersede + publish, guard `version.status !== "draft"` | čteno | Plná shoda s RBAC-30. | — |
| — | UI: vytvoření draft verze (formulář / tlačítko „New Version") | ❌ | `src/app/projects/[id]/versions/page.tsx` – žádné tlačítko ani form pro vytvoření nové verze; neexistuje `versions/new/page.tsx`; komponenty neobsahují POST volání na `/api/projects/:id/versions` | čteno | API pro vytvoření draftu existuje (POST route.ts:121), ale UI vstupní bod chybí. Uživatel nemůže vytvořit verzi bez přímého API volání. Toto není samostatné R-8.1 ID, ale je implicitní součástí R-8.1-13 (named snapshots workflow). | — |
| — | UI: publikace verze (tlačítko „Publish" v detailu verze) | ❌ | `src/app/projects/[id]/versions/[versionId]/page.tsx` – stránka zobrazuje `publishedAt` metadata, ale neobsahuje žádné tlačítko ani `PATCH` fetch volání | čteno | API PATCH handler existuje (`versions/[versionId]/route.ts:142`), ale UI vůbec neumožňuje publikaci. Uživatel nemůže verzi publikovat bez přímého API volání. Implicitní součást R-8.1-16 / RBAC-30 UI delivery. | — |
| — | UI: soft-delete verze (tlačítko „Delete") | ❌ | `src/app/projects/[id]/versions/[versionId]/page.tsx` – žádný DELETE fetch ani tlačítko smazání | čteno | API DELETE handler existuje (`versions/[versionId]/route.ts:271`), ale UI jej nezpřístupňuje. Implicitní součást RBAC-29 UI delivery. | — |
| — | UI: připojení souborů k verzi (attach files flow) | ⚠️ | `src/app/projects/[id]/versions/[versionId]/page.tsx:183–191` – `BatchFileUpload` zobrazena pouze pro draft; komponenta uploaduje soubory do projektu, ale neexistuje krok „vybrat a připojit soubory k verzi" přes `/versions/:id/files` endpoint | čteno | `BatchFileUpload` nahraje soubory do projektu (file confirm flow), ale POST na `/api/projects/:id/versions/:versionId/files` (attach) nikde v UI nevolán. Soubory se k verzi nepřipojují automaticky po uploadu. PRD §8.1 vyžaduje „file list" jako součást verze (R-8.1-15). | — |

---

## Shrnutí

| Status | Počet |
|--------|-------|
| ✅ Implementováno | 8 |
| 🟡 Částečně / drobná mezera | 2 |
| ❌ Chybí | 3 |
| ⚠️ Varování (PRD citace + kód) | 1 |
| **Celkem** | **14** |

### Klíčové závěry

1. **Datová vrstva a API jsou solidní.** Všechny čtyři stavy verze (draft/published/superseded/deleted_soft), immutabilita published verzí, transakční supersede při publikaci a soft-delete s audit logem jsou správně implementovány.

2. **UI vrstva je neúplná (3× ❌).** Chybí: (a) formulář/tlačítko pro vytvoření draft verze, (b) tlačítko Publish v detailu verze, (c) tlačítko Delete. Uživatel nemůže provést celý versioning workflow bez přímého API volání.

3. **Attach-files flow je přerušen (⚠️).** API endpoint `/versions/:id/files` existuje a je funkční, ale UI ho nevolá. `BatchFileUpload` nahraje soubory do projektu, ale nepřipojí je k verzi – tím verze zůstává bez souborů po normálním UI workflow.

4. **Admin role v publish a delete (2× 🟡).** PATCH i DELETE autorizace zahrnují Owner a Editor, ale ne Admin roli (RBAC-04, RBAC-14). Pokud platform-admin nemá projektové členství, nemůže verze publikovat ani mazat přes normální API.
