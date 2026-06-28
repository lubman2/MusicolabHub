# Epic-03 — File Management & Storage: PRD Conformance Audit

**Baseline:** PRD v2 §8.1 (file-related rows only)  
**Requirement source:** `docs/audit/requirement-index.md` — IDs `R-8.1-01` through `R-8.1-12` (file upload, storage, listing, download, multi-file batch, soft-delete). Versioning/commenting/real-time rows (`R-8.1-13`–`R-8.1-21`) are **out of scope** for this epic.  
**Scope also covers:** `RBAC-02`, `RBAC-03`, `RBAC-14` (role-gated file upload/download/delete); `R-8.4-03` (subscription gate on upload); `AC-02` (upload E2E); `SEC` §10 (private-by-default, signed access).  
**Audit date:** 2026-06-28  
**Auditor note:** read-only — no code changed.

---

## Findings

| ID | Požadavek | Status | Důkaz (soubor:řádek) | Úroveň | Mezera / poznámka | Issue# |
|----|-----------|--------|----------------------|--------|-------------------|--------|
| R-8.1-01 | Systém musí podporovat upload souborů `.mp3` | ✅ | `src/app/api/projects/[id]/files/upload-url/route.ts:13` (`"audio/mpeg"`) + `src/components/file-upload.tsx:18` | čteno | Plně implementováno; MIME + extension validation shodné. | — |
| R-8.1-02 | Systém musí podporovat upload souborů `.wav` | ✅ | `upload-url/route.ts:14-16` (aliasy `audio/wav`, `audio/wave`, `audio/x-wav`) + `file-upload.tsx:19-21` | čteno | Tři MIME aliasy pokryty. | — |
| R-8.1-03 | Systém musí podporovat upload souborů `.aiff` | ✅ | `upload-url/route.ts:17-18` (`audio/aiff`, `audio/x-aiff`) + `file-upload.tsx:22-23` | čteno | Dva MIME aliasy pokryty. | — |
| R-8.1-04 | Systém musí podporovat upload souborů `.zip` | ✅ | `upload-url/route.ts:19-20` (`application/zip`, `application/x-zip-compressed`) + `file-upload.tsx:24-25` | čteno | Dva MIME aliasy pokryty. | — |
| R-8.1-05 | Systém musí podporovat upload souborů `.pdf` | ✅ | `upload-url/route.ts:21` + `file-upload.tsx:26` | čteno | Plně implementováno. | — |
| R-8.1-06 | Systém musí podporovat upload souborů `.txt` | ✅ | `upload-url/route.ts:22` + `file-upload.tsx:27` | čteno | Plně implementováno. | — |
| R-8.1-07 | Systém musí podporovat upload souborů `.docx` | ✅ | `upload-url/route.ts:23` + `file-upload.tsx:28` | čteno | Plně implementováno. | — |
| R-8.1-08 | Systém musí podporovat upload souborů `.png` | ✅ | `upload-url/route.ts:24` + `file-upload.tsx:29` | čteno | Plně implementováno. | — |
| R-8.1-09 | Systém musí podporovat upload souborů `.jpg` | ✅ | `upload-url/route.ts:25` + `file-upload.tsx:30` | čteno | Plně implementováno; `.jpeg` alias také přítomen. | — |
| R-8.1-10 | UI musí umožnit hromadný upload více souborů najednou | ✅ | `file-upload.tsx:54-73` (`handleFiles` iteruje `FileList`) + `file-upload.tsx:219` (`<input multiple>`) + `page.tsx:219` (`<FileUpload>`) | čteno | Drag-and-drop i file picker podporují výběr více souborů; každý soubor spouští samostatný `uploadFile()`. | — |
| R-8.1-11 | Backend musí zpracovávat soubory individuálně (per-file) | ✅ | `upload-url/route.ts:38-149` (jedno volání = jeden soubor) + `confirm/route.ts:7-123` (jedno potvrzení = jeden soubor) | čteno | Každý soubor prochází vlastní sekvencí `POST /upload-url` → S3 PUT → `POST /confirm`; žádné batch-endpointy na straně serveru. | — |
| R-8.1-12 | Chyba jednoho souboru v dávce nesmí způsobit selhání celé dávky | ✅ | `file-upload.tsx:68-73` (`newFiles.forEach` → `uploadFile` bez `await` v iteraci) + `file-upload.tsx:148-158` (per-file `catch` → jen daný index dostane stav `"error"`) | čteno | Selhání jednoho souboru nastavuje pouze jeho vlastní stav na `error`; ostatní soubory v dávce pokračují. | — |
| RBAC-03 | Soubory mohou nahrávat pouze Owner, Editor a Admin | ⚠️ | `upload-url/route.ts:106-118` (`isOwner \|\| isEditor`); Admin bypass chybí v tomto route; `src/lib/subscription.ts:56-65` (admin bypass jen v `withActiveSubscription`) | čteno | Route nepoužívá `withActiveSubscription`; admin role není samostatně zkontrolována v upload-url route. Admin uživatel bez membership dostane 403 Forbidden (stejně jako Commenter/Viewer). Nekonzistentní s ostatními routes. | — |
| RBAC-02 | Owner, Editor, Commenter, Viewer mohou stahovat soubory | ❌ | `[fileId]/route.ts:29-39` (GET — přístup omezen na `isOwner \|\| isEditor`); Commenter a Viewer dostávají 403 | čteno | PRD §8.2 a RBAC-02 uvádějí, že Commenter i Viewer mají read-only přístup. Download URL je generován jen pro `isOwner \|\| isEditor`. Commenter a Viewer jsou blokováni. | — |
| RBAC-14 | Publikovaný soubor nebo verzi může smazat pouze Owner a Admin | 🟡 | `[fileId]/route.ts:127-128` (`project.ownerId !== user.id` → 403 = Owner-only) | čteno | Jen Owner může smazat soubor (soft-delete). Admin role není explicitně zkontrolována; Admin bez ownership dostane 403. Mezera: Admin by měl mít také oprávnění, ale tento gap je funkčně méně kritický protože Admin má vlastní admin routes. | — |
| R-8.4-03 | Upload souborů může být blokován po uplynutí grace period u `past_due` předplatného | ❌ | `upload-url/route.ts:38-149` — žádný import ani volání `withActiveSubscription`; `src/lib/subscription.ts:45-123` (middleware existuje, ale není použito) | čteno | Middleware `withActiveSubscription("write", ...)` existuje v `src/lib/subscription.ts`, avšak **není aplikován** na `POST /upload-url` ani `POST /confirm`. Uživatel s `past_due`+prošlou grace period může nahrávat soubory bez omezení. | — |
| AC-02 | Upload souborů s ukládáním a persistencí metadat musí fungovat end-to-end | ✅ | `upload-url/route.ts:121-148` (create `ProjectFile` → set `s3Key` → return presigned URL) + `confirm/route.ts:98-122` (HeadObject → update status → `logActivity`) + `prisma/schema.prisma:217-238` (`ProjectFile` model) | čteno | Kompletní flow: metadata-first zápis do DB, presigned S3 PUT, HeadObject verifikace, status update na `ready`, activity log. Metadata persistována ihned při zahájení uploadu. | — |
| SEC (§10) | Soubory jsou soukromé; přístup přes signed URL nebo ekvivalent | ✅ | `src/lib/s3.ts:114-124` (`generatePresignedDownloadUrl`, default 1 hodina) + `[fileId]/route.ts:78-79` (URL generována pouze pro `status === "ready"`) | čteno | S3 objekty jsou přístupny pouze přes presigned GET URL s expirací 1 hodiny; žádné veřejné URL. | — |
| SEC (§10) | Soft delete pro projektová data (30 dní) | ✅ | `prisma/schema.prisma:214` (`deleted_soft` enum) + `prisma/schema.prisma:228` (`deletedAt DateTime?`) + `[fileId]/route.ts:170-182` (update `status = "deleted_soft"`, `deletedAt = now`) | čteno | Soft-delete implementován; komentář v route zmiňuje 30denní retention okno s oddělenou cleanup úlohou. Samotná cleanup úloha (S3 fyzické smazání) nebyla nalezena v tomto rozsahu auditu. | — |
| SEC (§10) | Server-side autorizace pro všechny citlivé operace | 🟡 | `upload-url/route.ts:44-47` (auth check) + `[fileId]/route.ts:113-116` (auth check) + `files/route.ts:12-14` (auth check) | čteno | Auth check přítomen ve všech routes. Avšak role-granularita pro čtení/download je chybná (Commenter/Viewer blokováni — viz RBAC-02). | — |

---

## Shrnutí

| Status | Počet |
|--------|-------|
| ✅ Splněno | 13 |
| 🟡 Částečně splněno | 2 |
| ❌ Nesplněno | 2 |
| ⚠️ Varování / nekonzistence | 1 |
| **Celkem** | **18** |

### Kritické mezery

1. **RBAC-02 / R-8.2 — Blokovaný download pro Commenter a Viewer** (`[fileId]/route.ts:29-39`): GET souboru i listing souborů (`files/route.ts:27-38`) jsou omezeny jen na Owner/Editor. Commenter a Viewer (kteří mají dle PRD read-only přístup) dostávají HTTP 403.

2. **R-8.4-03 — Chybějící subscription gate na upload** (`upload-url/route.ts`): Middleware `withActiveSubscription("write", ...)` existuje ale není aplikován. Uživatelé s `past_due` předplatným a prošlou grace period mohou stále nahrávat soubory.
