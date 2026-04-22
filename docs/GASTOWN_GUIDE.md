# Gas Town (`gt`) v projektu MusicolabHub

Tahle příručka je praktický návod pro práci s Gas Town (`gt`) v tomto konkrétním repozitáři.

## 1. Co je `gt`

`gt` není součást běhu aplikace MusicolabHub.

Je to samostatný CLI orchestrátor pro práci s AI agenty nad git repozitářem. Umí hlavně:

- spravovat agent workspaces ("rigs")
- rozdělovat práci agentům
- komunikovat s běžícími agent sessions
- držet workflow nad issues/beads

Pro samotné spuštění aplikace MusicolabHub `gt` nepotřebuješ.

## 2. Co platí právě teď v tomhle repu

Aktuální stav v `/Users/lubman/Sites/MusicolabHub`:

- `gt` je nainstalované v systému
- repozitář používá `bd` / beads pro issue tracking
- v [.claude/settings.json](/Users/lubman/Sites/MusicolabHub/.claude/settings.json:1) jsou Claude hooks, které při startu session spouští `bd prime`
- tenhle adresář ale momentálně **není inicializovaný jako Gas Town workspace / rig**

To je ověřené tímto příkazem:

```bash
gt status
```

Výsledek je:

```text
Error: not in a Gas Town workspace
```

Praktický důsledek:

- `gt` tady teď nic automaticky neřídí
- žádný agent pro tenhle projekt neběží jen tím, že je `gt` nainstalované
- nemusíš mu dávat žádné vstupy, dokud z tohohle repa neuděláš GT rig

## 3. Jak poznáš, jestli `gt` něco v projektu dělá

Používej tenhle rychlý check:

```bash
command -v gt
gt status
gt prime
```

Interpretace:

- `command -v gt` vrátí cestu k binárce: `gt` je nainstalované
- `gt status` nebo `gt prime` hlásí `not in a Gas Town workspace`: projekt není zapojený do GT
- `gt status` ukáže stav town/rig/agentů: projekt už v GT běží

## 4. Co je v projektu už připravené

Reálně je připravené jen tohle:

- beads workflow přes `bd`
- Claude hook na `bd prime`

To znamená:

- projekt je připravený pro AI-assisted workflow přes `bd`
- projekt zatím není připravený pro Gas Town multi-agent orchestration

## 5. Kdy `gt` dává smysl použít

`gt` má smysl ve chvíli, kdy chceš:

- rozdělit víc beadů mezi víc agentů
- mít persistentní agent sessions nad projektem
- posílat agentům práci a zprávy bez ručního copy-paste
- mít rig-level workflow nad jedním nebo více repozitáři

Pokud jen pracuješ sám v jednom agentovi, většinou ti stačí:

```bash
bd ready
bd show <id>
bd update <id> --claim
```

## 6. Doporučený režim pro tento projekt dnes

Pro dnešní stav projektu doporučuju:

1. používat běžně `bd`
2. `gt` ignorovat, dokud vědomě nechceš multi-agent setup
3. pokud chceš GT zprovoznit, udělat to jako samostatný krok a nejdřív ověřit, že to opravdu chceš

Jinými slovy: `gt` teď není něco, co bys musel obsluhovat při běžné práci na MusicolabHub.

## 7. Pokud chceš `gt` pro MusicolabHub opravdu zapnout

Pozor: tohle je setup krok, ne běžná práce.

### 7.1 Inicializace rigu

V kořeni repa:

```bash
gt init
```

Podle `gt init --help` to vytvoří standardní GT strukturu, typicky:

- `polecats/`
- `witness/`
- `refinery/`
- `mayor/`

A zároveň doplní `.git/info/exclude`.

### 7.2 Start GT služeb

Po inicializaci:

```bash
gt start
```

To podle helpu spouští hlavní GT koordinátory:

- Deacon
- Mayor

Další části se spouštějí lazy nebo přes `gt start --all`.

### 7.3 Kontrola zdraví

Po startu:

```bash
gt doctor
gt status
```

Použití:

- `gt doctor` kontroluje konfiguraci a chybějící soubory
- `gt status` ukáže, jestli town/rig skutečně běží

## 8. Základní workflow s `gt` pro tento projekt

Jakmile bude MusicolabHub inicializovaný jako GT rig, dává smysl tenhle základ:

### Varianta A: chceš vidět připravenou práci

```bash
gt ready
```

To ukáže ready beads napříč town/rig prostředím.

Poznámka: v tomhle projektu už jsou issue vedené přes beads, takže `gt` se opře právě o ně.

### Varianta B: chceš zobrazit detail issue

```bash
gt show MusicolabHub-003
```

`gt show` je nadstavba nad `bd show`.

### Varianta C: chceš poslat práci agentovi

Nejdůležitější příkaz je:

```bash
gt sling <bead-id> [target]
```

Příklady pro tento projekt po zprovoznění rigu:

```bash
gt sling MusicolabHub-003
gt sling MusicolabHub-003 crew
gt sling MusicolabHub-003 <nazev-rigu>
```

Prakticky:

- bez targetu přislinguješ práci sobě / aktuálnímu agentovi
- `crew` cílí crew worker v aktuálním rigu
- target rig může auto-spawnout polecat workera

Když chceš předat i instrukci:

```bash
gt sling MusicolabHub-003 crew --args "prepare implementation plan and inspect prisma schema dependencies"
```

### Varianta D: chceš agentovi napsat zprávu

Použij:

```bash
gt nudge <target> "message"
```

Příklad:

```bash
gt nudge witness "Check worker health in MusicolabHub rig"
```

Tohle je komunikační vrstva. Nepoužívá se místo issue, ale vedle issue.

### Varianta E: chceš pracovat s poštou mezi agenty

```bash
gt mail inbox
gt mail send
```

To je užitečné až ve chvíli, kdy v GT opravdu běží více agentů.

## 9. Co od tebe `gt` typicky potřebuje jako vstup

Dokud není projekt GT workspace:

- nic

Po inicializaci projektu typicky zadáváš:

- jaký bead se má řešit
- kterému agentovi nebo workerovi se má přidělit
- případně krátké instrukce v `--args` nebo zprávě

Typické vstupy tedy nejsou "data pro aplikaci", ale "pracovní pokyny pro agenty".

## 10. Nejkratší odpověď na tvoji otázku

Pro MusicolabHub dnes platí:

- `gt` je u tebe nainstalované
- tenhle repozitář ale zatím není GT workspace
- `gt` tu teď nic neprovádí samo od sebe
- tvoje běžná práce má jet přes `bd`, ne přes `gt`
- `gt` začne být relevantní až tehdy, když tenhle repozitář vědomě inicializuješ pomocí `gt init`

## 11. Doporučené příkazy pro rychlou orientaci

### Bezpečné diagnostické minimum

```bash
command -v gt
gt status
gt doctor
gt init --help
gt sling --help
```

### Běžná práce na projektu bez GT

```bash
bd ready
bd show <id>
bd update <id> --claim
```

### První krok, pokud se rozhodneš GT opravdu zapnout

```bash
gt init
gt start
gt doctor
gt status
```
