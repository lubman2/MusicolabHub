# Fáze 1 — Audit shody s PRD (Design / Spec)

**Datum:** 2026-06-28
**Stav:** návrh ke schválení
**Autor:** plánováno společně (uživatel + Claude)

---

## 0. Kontext a zařazení

Projekt MusicCollabHub byl z velké části postaven paralelními AI agenty (Gas Town
„polecats"). Kód pokrývá všech 12 epiců (MVP 00–09 i Stream 2 10–12), ale s typickými
důsledky swarm-vývoje: nekonzistentní vzory, možné duplicity, mezery a neověřené hrany.
Projekt byl odpojen od Gas Town/beads/Dolt a primárním nástrojem je nyní **GitHub**.

Tato práce je **Fáze 1** z dohodnutého třífázového plánu:

1. **Fáze 1 — Audit shody s PRD** (tento dokument): diagnostika, read-only mapování
   reality kódu proti zadávací dokumentaci. Nic nemění, jen zjišťuje stav.
2. **Fáze 2 — Konsolidace** (samostatný spec později): opravy bugů, sjednocení vzorů,
   odstranění duplicit/mrtvého kódu, dotažení „částečně" požadavků. Řízeno nálezy z Fáze 1.
3. **Fáze 3 — Launch-readiness gate** (samostatný spec později): ověření, že MVP rozsah
   je kompletní a nasaditelný.

Pořadí je řízeno závislostí: konsolidaci ani posouzení launche nelze rozumně provést,
dokud audit nedá mapu toho, co v kódu reálně je a kde jsou mezery.

---

## 1. Cíl Fáze 1

Vytvořit **úplný, doložený obraz shody** implementace se zadávací dokumentací napříč
všemi 12 epicy a zároveň **akceschopný backlog** mezer pro Fázi 2.

Audit je **read-only** vůči produkčnímu kódu. Jediné, co vzniká, jsou: report (Markdown)
a GitHub issues. Runtime ověření kritických flow může spouštět aplikaci/testy, ale nemění
zdrojový kód.

---

## 2. Záběr a baseline

### 2.1 Pokrytí
Všech 12 epiců:
- **MVP (launch-blocking, epicy 00–09):** auth & onboarding, profily/portfolio, projekty,
  soubory, verzování, members/role, komentáře/aktivita, notifikace, subscriptions, splits,
  admin/support.
- **Stream 2 (NEblokuje launch, epicy 10–12):** gigs (discovery/apply/accept), Stripe
  Connect onboarding, marketplace platby/payouty, handoff najatých do kolaborace.

### 2.2 Baseline (proti čemu se měří)
- `PRD_v2_MUSICCOLLABHUB.md` — **§8 Functional Requirements** (8.1 Project Hub, 8.2
  Permissions, 8.3 Marketplace, 8.4 Payments, 8.5 Ownership/Contributor, 8.6 Admin) a
  **§13 Acceptance Criteria Summary**. Jako kontext slouží i §3 Goals/Non-Goals, §4 MVP,
  §9 Data/State Model, §10 Non-Functional, §11 Legal/Compliance.
- `Decision_Log_MUSICCOLLABHUB.md` — závazná rozhodnutí, která upřesňují/override PRD.
- `Red_Team_Matrix_MUSICCOLLABHUB.md` — bezpečnostní a abuse scénáře (autorizace, únik dat,
  zneužití flow).
- `Role_Lifecycle_Tables_MUSICCOLLABHUB.md` — RBAC stavy rolí a přechody (zdroj pravdy pro
  permission audit).

### 2.3 Statusy nálezů
Každý požadavek dostane jeden status:
- ✅ **hotovo** — implementováno a (kde relevantní) ověřeno.
- 🟡 **částečně** — část chybí nebo je neúplná.
- ❌ **chybí** — žádná implementace.
- ⚠️ **odchyluje se** — implementováno jinak, než PRD/podpůrné docs předepisují.

---

## 3. Metodika a úrovně důkazu

### 3.1 Statický audit (všude)
Pro každý požadavek se najde a posoudí odpovídající kód:
- vrstvy: API route (`src/app/api/**/route.ts`), datový model (`prisma/schema.prisma`),
  doménová logika (`src/lib/**`), UI stránka (`src/app/**/page.tsx`).
- posouzení: přítomnost + zjevná správnost čtením kódu.
- **každý nález nese důkaz** = odkaz `soubor:řádek`.

### 3.2 Runtime ověření (kritické flow)
Reálně se spustí a ověří nejrizikovější toky, kde statická analýza nestačí:
1. **Auth** — signup, email verifikace, login, session, logout, password reset.
2. **Stripe platby** — checkout session, webhook handler (idempotence, grace period),
   subscription stav, trial expiry.
3. **Splits konfirmace** — vytvoření draftu → submit → confirm/reject → supersede.
4. **RBAC vynucení** — server-side authorizace dle `Role_Lifecycle_Tables` (ne jen UI
   skrývání); pokus o přístup přes roli, která nemá mít právo.
5. **Přístup k souborům** — presigned upload/download URL, access control na soubory verzí.

Využije se `E2E_TEST_MODE`, `test/` API routes a `TESTING.md` / `e2e/happy-path.spec.ts`.

### 3.3 Záznam úrovně ověření
Každý nález nese úroveň: **čteno** (statika) nebo **spuštěno** (runtime). Tam, kde runtime
infra chybí, se použije **neověřeno-runtime** místo blokace auditu.

---

## 4. Struktura provádění

### 4.1 Paralelní audit po epicech
Audit se rozfázuje **fan-outem subagentů — 1 epic = 1 agent**. Každý agent:
- dostane výřez PRD/podpůrných docs relevantní pro svůj epic + mapu kódu,
- vrátí **strukturované nálezy** (status, požadavek, důkaz `soubor:řádek`, mezera, návrh
  issue) v jednotném formátu.

### 4.2 Runtime + sjednocení (hlavní vlákno)
Po fan-outu provedu já:
- runtime ověření kritických flow (§3.2),
- sjednocení nálezů do jednoho reportu,
- **deduplikaci proti existujícím otevřeným GitHub issues** — viz §5.3.

### 4.3 Sekce pro podpůrné docs
Vedle §8/§13 vzniknou tři průřezové sekce:
- **Security** (z `Red_Team_Matrix`),
- **RBAC/permissions** (z `Role_Lifecycle_Tables`),
- **Decisions conformance** (z `Decision_Log`).

---

## 5. Výstupy

### 5.1 Conformance report
Soubor: `docs/audit/PRD_Conformance_Audit_2026-06-28.md`

Struktura:
- **Executive summary** — počty statusů po epicech, top rizika, launch-blocking mezery.
- **Sekce po §8.1–8.6** — tabulka `Požadavek │ Status │ Důkaz (soubor:řádek) │ Úroveň
  (čteno/spuštěno) │ Mezera │ Issue#`.
- **Sekce §13 Acceptance Criteria** — stejná tabulka, kritérium po kritériu.
- **Průřezové sekce:** Security (Red Team), RBAC (Role Lifecycle), Decisions (Decision Log).
- **Appendix:** seznam založených issues a smířených existujících issues.

### 5.2 GitHub issues
Pro každý akceschopný ❌ / 🟡 / ⚠️ nález:
- **Title:** `[epic-XX] <stručný popis mezery>`.
- **Labely:** `epic-XX` + typ (`bug` pro odchylky/defekty, `feature` pro chybějící
  funkce, `task` pro dotažení) + priorita (`p0`–`p3`; launch-blocking = `p0`/`p1`).
- **Body:** odkaz na sekci reportu, citace PRD/podpůrného docs, důkaz v kódu, navrhovaný
  fix/akceptační kritérium.

### 5.3 Deduplikace proti existujícím issues
Repo už má ~80 otevřených issues (#1–#92 backlog) + #114 „Review epic breakdown against
PRD v2" + bugy #123–126. Audit:
- **nezakládá duplicity** — před založením issue se hledá existující odpovídající,
- existující relevantní issue **propojí** (odkaz v reportu) místo nového,
- #114 se použije jako střešní/tracking issue auditu (komentář s odkazem na report).

---

## 6. Předpoklady a rizika

- **Runtime ověření vyžaduje funkční `.env`** (DATABASE_URL na dev DB, Stripe test klíče,
  S3/AWS, SMTP). Mitigace: `E2E_TEST_MODE` + `test/` routes; chybějící infra → část nálezů
  označena „neověřeno-runtime", audit se neblokuje.
- **Subjektivita u „⚠️ odchyluje se"** — mitigace: každý takový nález nese citaci PRD i
  kódu, aby byl nezávisle posouditelný.
- **Velikost záběru** — 12 epiců × více vrstev. Mitigace: paralelizace po epicech,
  jednotný formát nálezů.
- **Drift PRD vs realita** — některé „odchylky" mohou být záměrné dle `Decision_Log`;
  proto je Decision Log součástí baseline, ne jen PRD.

---

## 7. Akceptační kritéria Fáze 1 (kdy je audit hotový)

- [ ] Report `docs/audit/PRD_Conformance_Audit_2026-06-28.md` existuje a pokrývá **všech**
      šest podsekcí §8 + §13 + tři průřezové sekce.
- [ ] **Každý** požadavek §8/§13 má přiřazený status a (mimo ❌) důkaz `soubor:řádek`.
- [ ] Kritické flow (§3.2) mají úroveň „spuštěno" nebo doloženo „neověřeno-runtime" s důvodem.
- [ ] Pro každý akceschopný ❌/🟡/⚠️ existuje GitHub issue **nebo** odkaz na existující.
- [ ] Žádné duplicitní issues vůči stávajícímu backlogu.
- [ ] Executive summary jasně vyjmenovává launch-blocking mezery (MVP epicy 00–09).
- [ ] Report i issues commitnuty/založeny a pushnuty.

---

## 8. Mimo záběr (explicitně)

- **Žádné opravy kódu** — ty patří do Fáze 2 (konsolidace).
- **Žádný refaktoring** — jen se zaznamená jako nález/issue.
- **Hloubkový bezpečnostní pentest** nad rámec Red Team Matrix scénářů.
- **Posouzení launch-readiness** jako rozhodnutí — to je Fáze 3.
