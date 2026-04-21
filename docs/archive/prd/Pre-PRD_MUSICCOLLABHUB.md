#Checklist pro upřesnění PRD

Níže je krátký PRD clarification checklist pro founder/product review. Cíl je uzavřít jen to, co blokuje rozpad do epiků a
  issues.

  1. MVP Boundary

  - Jaký je skutečný první release slice?
  - Co musí být v MVP bez debat?
  - Co je explicitně mimo MVP, i když je to v PRD zmíněné?
  - Je cíl první verze collaboration hub, marketplace, nebo oboje?
  - Co je “demo-ready” a co je “customer-ready”?

  2. Personas

  - Kdo je primární uživatel v MVP?
  - Kdo je sekundární uživatel?
  - Kdo platí?
  - Kdo vytváří projekt?
  - Kdo je hired collaborator?
  - Má existovat admin / support role už v MVP?

  3. Core User Flows
  U každého flow doplň:

  - spouštěč,
  - hlavní kroky,
  - výsledek,
  - error/failure stav.

  Nutné flows:

  - vytvoření účtu a onboardingu
  - založení projektu
  - upload souborů
  - pozvání collaboratora
  - komentování feedbacku
  - publikace gigu
  - přihlášení na gig
  - přijetí collaboratora
  - nastavení ownership splitu
  - platba / payout

  4. Project Hub

  - Jaké typy souborů MVP podporuje?
  - Jak velké soubory mohou být nahrány?
  - Je upload per-file nebo per-project batch?
  - Co je “version” projektu?
  - Kdo může přidat novou verzi?
  - Jak se řeší conflict při paralelní práci?
  - Jsou comments plain text, nebo timestamped?
  - Pokud timestamped: nad čím přesně? waveform, player timeline, nebo jen manuální čas?
  - Je real-time nutný, nebo stačí notifikace + refresh?

  5. Permissions

  - Jaké role existují uvnitř projektu?
  - Co přesně znamená view, comment, edit?
  - Může editor zvát další lidi?
  - Může collaborator vidět financial/split info?
  - Kdo může mazat soubory, verze, komentáře?

  6. Marketplace

  - Je MVP jen job board, nebo end-to-end hiring flow?
  - Musí být v MVP reviews a ratings?
  - Jak se vytváří portfolio?
  - Kdo může publikovat gig?
  - Může jeden user být buyer i talent?
  - Jak vypadá lifecycle gigu?
      - draft
      - published
      - applied
      - hired
      - in progress
      - delivered
      - approved
      - closed
      - cancelled
  - Jsou revision rounds součástí MVP?
  - Jak se řeší dispute?

  7. Payments

  - Jak fungují subscriptions?
  - Jaké jsou plány a limity?
  - Co se stane po neúspěšné platbě?
  - Marketplace payment:
      - escrow ano/ne?
      - commission kdy se strhává?
      - payout kdy se uvolní?
      - refunds/cancellations jak?
  - Potřebujeme Stripe Connect?
  - Jak řešíme VAT / invoices / tax docs?

  8. Ownership Splits

  - Je MVP jen evidence splitů, nebo i enforcement workflow?
  - Kdo může split vytvořit?
  - Kdo ji musí potvrdit?
  - Dá se split po potvrzení změnit?
  - Co se stane, když součet není 100 %?
  - Je split per project, nebo per song/track?
  - Je split sheet jen export, nebo závazný workflow?

  9. Royalty Tracking

  - Je skutečně součást MVP?
  - Pokud ano, je to:
      - jen dashboard nad ručně zadanými daty,
      - nebo integrace na Spotify/Apple?
  - Pokud integrace není MVP, přejmenuj feature, aby nevypadala jako hotový royalty ingestion systém.
  - Co přesně znamená “monthly payouts”?

  10. Non-Functional Requirements

  - Cílová velikost a počet uploadů na projekt?
  - Cílový počet současně aktivních projektů v MVP?
  - Jak rychlé mají být:
      - upload,
      - project open,
      - comment create,
      - gig search?
  - Jaká audit trace je povinná?
  - Jaká je požadovaná úroveň bezpečnosti pro soukromé audio assets?
  - Potřebujeme backup/restore a retention policy?

  11. Legal / Compliance

  - Jaký je minimální copyright/TOS model?
  - Kdo nese odpovědnost za ownership claims?
  - Potřebujeme explicitní souhlasy contributorů?
  - Má být obsah privátní by default?
  - Je potřeba GDPR export/delete flow už v MVP?

  12. Admin / Support

  - Potřebuje tým admin dashboard?
  - Jak support řeší:
      - dispute,
      - payout issue,
      - abuse report,
      - copyright complaint?
  - Má admin možnost suspendovat gig, účet, projekt?

  13. Analytics

  - Jaké jsou MVP product KPIs?
  - Jaké eventy se musí trackovat od day 1?
  - Minimum:
      - signup completed
      - project created
      - file uploaded
      - collaborator invited
      - comment added
      - gig created
      - gig applied
      - hire accepted
      - split created
      - payment succeeded
  - Co je activation metric?

  14. Acceptance Criteria
  Pro každý feature blok doplň:

  - co přesně musí fungovat,
  - co je edge case,
  - co je failure case,
  - jak se pozná done.

  Použil bych jednoduchou šablonu:

  - Given
  - When
  - Then

  Doporučený výstup po review
  Po zodpovězení checklistu bych z toho udělal 4 artefakty:

  1. PRD v2
  2. MVP boundary doc
  3. role + lifecycle tables
  4. epic backlog seed


# MusicCollabHub - Product Requirements Document (PRD)

**Version:** 1.0  
**Status:** Ready for Development  
**Target Release:** 8 months  

---

## Executive Summary

MusicCollabHub is GitHub for music production—enabling remote collaboration on DAW projects. Revenue from creator subscriptions (€12-29/month) and 15% marketplace commission on collaboration projects (mixing, producing, remixing).

---

## Core Features (MVP)

### 1. Project Management
- **Cloud Project Hub**
  - Upload DAW project files (.zip, .mp3 stems)
  - Store multiple versions (version control)
  - Add collaborators with permission levels (view, comment, edit)
  - Real-time file preview (waveform, metadata)

- **Collaboration Tools**
  - Inline comments (tag timestamps: "0:45 - kick drum is too loud")
  - Change suggestions (propose mix changes)
  - Real-time sync notifications
  - Activity log (who changed what, when)

### 2. Marketplace (Phase 1 MVP - Simple)
- **Create Gigs**
  - "Mixing needed for 3 songs" (define scope, budget €50-500)
  - "Need female vocalist for pop chorus"
  - "Beat creation for lo-fi project"

- **Talent Discovery**
  - Filters (skill level, genre, price)
  - Portfolio (previous projects, audio samples)
  - Reviews & ratings

### 3. Royalty Tracking
- **Ownership Splits**
  - Define contributor roles (composer, producer, mixing engineer, etc.)
  - Set ownership percentages (automatically enforced)
  - Generate split sheets (standardized format)

- **Earnings Dashboard**
  - Track streaming royalties (Spotify, Apple Music, etc.)
  - View ownership by song/project
  - Monthly payouts (via Stripe)

---

## Technical Architecture

### Stack
- **Frontend:** React/Next.js + Web Audio API (waveform rendering)
- **Backend:** Node.js + PostgreSQL
- **Storage:** AWS S3 (project files, stems, master files)
- **Real-time:** WebSocket (collaboration events)
- **Audio Processing:** FFmpeg (stem separation), TensorFlow.js (AI features, phase 2)
- **Payment:** Stripe (marketplace, payouts)
- **APIs:** Spotify API (royalty data, phase 2)

### Key API Endpoints

```
# Projects
POST /api/projects (create)
GET /api/projects/{id}
PUT /api/projects/{id} (update)
POST /api/projects/{id}/collaborators (add)
GET /api/projects/{id}/versions (version history)

# Marketplace
POST /api/gigs (create gig)
GET /api/gigs (search/filter)
POST /api/gigs/{id}/apply (apply for gig)
POST /api/gigs/{id}/accept (hire collaborator)

# Comments & Feedback
POST /api/projects/{id}/comments (inline comment at timestamp)
GET /api/projects/{id}/comments
POST /api/projects/{id}/change-suggestions

# Royalties
POST /api/projects/{id}/ownership-split (define percentages)
GET /api/projects/{id}/earnings
POST /api/payouts (request payout)
```

---

## MVP Scope

### Must Have
- ✅ Project upload & storage (cloud)
- ✅ Collaborator management (permissions)
- ✅ Basic commenting system (no timestamps, phase 2)
- ✅ Portfolio profiles (show work samples)
- ✅ Gig creation (simple text + price)
- ✅ Marketplace job board (browsing + applying)
- ✅ Ownership split definition
- ✅ Payment processing (Stripe)

### Nice to Have
- 🎵 Waveform visualization (for feedback placement)
- 🔊 Audio player (preview tracks)
- 💬 Real-time chat (collaborators)

### Future (Post-MVP)
- 🤖 AI stem separation (automatically separate vocals, drums, etc.)
- 📊 Royalty tracking from Spotify/Apple Music
- 🎬 Video tutorials (music production best practices)
- 🌐 Integration with major DAWs (live project sync)

---

## Success Metrics

| Metric | Target M6 | Target M12 |
|--------|-----------|-----------|
| Creator signups | 2,000 | 10,000 |
| Active projects | 500 | 3,000 |
| Gig postings/month | 200 | 1,500 |
| Marketplace GMV | €50,000 | €400,000 |
| Subscription revenue | €15,000 | €100,000 |
| Churn rate | <8% | <5% |

---

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Complex tech (audio processing) | Start simple: file storage + comments, add audio features later |
| Low marketplace liquidity (no gigs) | Partner with music producers, seed first gigs ourselves |
| Copyright/royalty disputes | Clear TOS, ownership split verification, escrow for payments |
| DAW compatibility | Focus on universal formats (MP3, WAV stems), not DAW-specific |

