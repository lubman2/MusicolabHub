# MusicCollabHub - Decision Log

**Purpose:** explicit log of product decisions locked before epic and issue breakdown  
**Status:** current

---

## Locked Decisions

### 2026-04-22 - Marketplace priority
Decision:
- `Marketplace = Stream 2, not launch-blocking`

Why:
- collaboration hub is a coherent product without marketplace
- marketplace introduces additional payments, payouts, support, and trust/safety complexity

Impact:
- launch-critical scope is collaboration-first
- marketplace can ship after initial customer-ready release

### 2026-04-22 - Gig to project binding
Decision:
- `Every gig belongs to an existing project`

Why:
- simplifies permissions
- simplifies asset scoping
- simplifies hire handoff

Impact:
- no standalone gig lifecycle for MVP/Stream 2
- project context exists before gig publication

### 2026-04-22 - Payout release policy
Decision:
- `Payout release = buyer approval OR auto-release after 7 days from delivery`

Why:
- gives buyer a control point
- prevents indefinite talent wait time
- creates a predictable support rule

Impact:
- payout lifecycle must support review window and hold states
- support/admin can block payout before release

### 2026-04-22 - Hired talent asset access
Decision:
- `Restricted access by default; broader asset access requires explicit owner grant`

Why:
- protects private assets
- reduces asset leakage risk
- preserves privacy-by-default positioning

Impact:
- hire acceptance does not automatically imply full project access
- access grants must be explicit and audit logged

### 2026-04-22 - Ownership split granularity
Decision:
- `Project-level splits only for the first customer-ready release`

Why:
- keeps the data model and confirmation workflow manageable
- avoids track-level complexity in the initial delivery

Impact:
- no track-level split records in the first release
- track-level granularity remains a later extension

### 2026-04-22 - Post-trial plan model
Decision:
- `Trial -> paid only`

Why:
- keeps billing and access enforcement simpler
- avoids long-term free hosting of large audio assets

Impact:
- no permanent free tier after trial
- read access may remain, but creation/upload/publish actions require paid status
