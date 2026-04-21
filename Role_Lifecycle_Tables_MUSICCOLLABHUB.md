# MusicCollabHub - Role and Lifecycle Tables

**Purpose:** referenční tabulky pro product, design, backend a QA  
**Source:** `PRD_v2_MUSICCOLLABHUB.md`

---

## 1. Project Roles

| Capability | Owner | Editor | Commenter | Viewer | Admin |
|------------|-------|--------|-----------|--------|-------|
| View project | yes | yes | yes | yes | yes |
| Download permitted files | yes | yes | yes | yes | yes |
| Upload files | yes | yes | no | no | yes |
| Publish version | yes | yes | no | no | yes |
| Edit project metadata | yes | yes | no | no | yes |
| Add comment | yes | yes | yes | no | yes |
| Delete own recent comment | yes | yes | yes | no | yes |
| Moderate comments | yes | no | no | no | yes |
| Invite collaborator | yes | no | no | no | yes |
| Change member role | yes | no | no | no | yes |
| Remove collaborator | yes | no | no | no | yes |
| View ownership split | yes | limited | no default | no | yes |
| Manage ownership split | yes | no | no | no | yes |
| Delete published file/version | yes | no | no | no | yes |
| Suspend project access | no | no | no | no | yes |

### Notes
- `limited` for editor split visibility means only where explicitly allowed by product rules.
- `Admin` is an internal role and not part of normal customer-facing project membership.
- hired talent should enter with restricted access by default, not full project access by default.
- broader asset access requires an explicit owner grant and should be audit logged.

---

## 2. Invitation Lifecycle

| State | Description | Entered by | Exit conditions |
|-------|-------------|------------|-----------------|
| `pending` | invite was created and is awaiting action | owner/admin | accepted, revoked, expired |
| `accepted` | recipient accepted and membership was created | recipient/system | membership removed later |
| `revoked` | sender or admin invalidated invite | owner/admin | terminal |
| `expired` | invite exceeded validity window | system | terminal |

### Rules
- only owner can create project invites in MVP
- invite acceptance must create membership with the assigned role
- revoked and expired invites are not reusable

---

## 3. Project Lifecycle

| State | Description |
|-------|-------------|
| `active` | project is available for collaboration |
| `archived` | project is closed for active work but retained for access/history |
| `suspended` | admin-restricted project due to abuse, dispute, or compliance action |
| `deleted_soft` | project is pending permanent removal within retention window |

### Rules
- most user-created projects begin in `active`
- archive is owner action
- suspend is admin action
- soft delete preserves auditability during retention window

---

## 4. Project Version Lifecycle

| State | Description |
|-------|-------------|
| `draft` | uploaded files or metadata changes not yet published as a version |
| `published` | immutable version snapshot visible in history |
| `superseded` | older published version that is no longer current |
| `deleted_soft` | version hidden but retained during retention/audit window |

### Rules
- only owner and editor can publish
- publish serializes the current draft snapshot into a stable version
- a newly published version marks the previous current version as `superseded`

---

## 5. Comment Thread Lifecycle

| State | Description |
|-------|-------------|
| `open` | thread is active and accepts replies |
| `resolved` | thread is considered handled and is read-only or deprioritized by UI |
| `deleted_soft` | thread removed from normal UI but retained for audit/moderation |

### Rules
- commenter, editor, and owner can create threads
- only authorized users can reply
- owner/admin may resolve or moderate

---

## 6. Gig Lifecycle

| State | Description | Main owner |
|-------|-------------|------------|
| `draft` | gig exists but is not public | buyer |
| `published` | gig is visible and accepting applications | buyer |
| `applied` | at least one application exists | system-derived/business state |
| `hired` | one applicant was accepted | buyer/system |
| `in_progress` | work is underway | buyer + hired talent |
| `delivered` | talent marked the work as delivered | hired talent |
| `approved` | buyer accepted delivery | buyer |
| `closed` | financial and workflow completion state | system |
| `cancelled` | gig was cancelled before completion | buyer/admin |
| `suspended` | admin restricted visibility or activity | admin |

### Rules
- `applied` may be implemented as a derived state rather than a persisted one
- only published gigs accept applications
- every gig belongs to an existing project
- after `hired`, new applications are closed

---

## 7. Gig Application Lifecycle

| State | Description |
|-------|-------------|
| `submitted` | application was sent by talent |
| `withdrawn` | talent withdrew the application |
| `accepted` | buyer selected this application |
| `rejected` | buyer or system rejected the application |
| `expired` | gig closed/cancelled before action on application |

### Rules
- one talent should not have multiple active applications to the same gig
- accepted application should force competing applications into rejected or expired

---

## 8. Hire / Delivery Lifecycle

| State | Description |
|-------|-------------|
| `awaiting_start` | application accepted, collaboration handoff pending |
| `in_progress` | hired user is actively working |
| `delivered` | work submitted by talent |
| `approved` | buyer approved the delivery |
| `cancelled` | workflow stopped before approval |

### Rules
- this lifecycle can be modeled inside gig state or as a dedicated contract object
- if modeled separately, it should still stay tightly coupled to payment and payout states
- accepted talent should start with restricted access until the owner explicitly broadens permissions

---

## 9. Ownership Split Lifecycle

| State | Description |
|-------|-------------|
| `draft` | split is incomplete or not yet submitted |
| `pending_confirmation` | all relevant contributors are asked to confirm |
| `partially_confirmed` | at least one contributor confirmed, but not all |
| `confirmed` | all required contributors confirmed |
| `rejected` | one or more contributors rejected the split |
| `superseded` | newer split revision replaced this one |

### Rules
- submit is blocked unless total share equals `100%`
- first customer-ready release supports project-level split records only
- only owner creates or submits split
- confirmed split cannot be edited in place
- revisions create new records

---

## 10. Split Confirmation Lifecycle

| State | Description |
|-------|-------------|
| `pending` | confirmation request sent to contributor |
| `confirmed` | contributor accepted allocation |
| `rejected` | contributor rejected allocation |
| `expired` | confirmation request timed out |

### Rules
- only contributors with non-zero share require confirmation
- parent split state should aggregate child confirmation states

---

## 11. Subscription Lifecycle

| State | Description |
|-------|-------------|
| `trialing` | user is in trial period |
| `active` | paid subscription is in good standing |
| `past_due` | payment failed and retry/grace flow is active |
| `canceled` | subscription was ended |
| `expired` | trial ended without conversion or access window ended |

### Rules
- `past_due` may retain read access while blocking new creation actions
- after trial, users must convert to paid to retain creation/upload capabilities
- Stripe is source of truth for billing events, backend is source of truth for product access enforcement

---

## 12. Marketplace Payment Lifecycle

| State | Description |
|-------|-------------|
| `requires_payment` | payment not yet initiated or completed |
| `processing` | payment in progress |
| `succeeded` | payment completed successfully |
| `failed` | payment failed |
| `refunded` | amount refunded fully or partially |
| `cancelled` | payment flow stopped before completion |

### Rules
- webhook events must reconcile final state
- platform fee should be tied to successful payment

---

## 13. Payout Lifecycle

| State | Description |
|-------|-------------|
| `blocked` | payout cannot proceed due to missing prerequisites |
| `scheduled` | payout approved for future release |
| `in_transit` | payout is being transferred |
| `paid` | payout completed |
| `failed` | payout failed |
| `reversed` | payout was reversed after issuance |

### Blocking reasons
- incomplete Stripe Connect onboarding
- KYC requirements outstanding
- payment not yet approved for release
- 7-day review window after delivery has not yet expired
- compliance or support hold

### Release rules
- payout may be released immediately on buyer approval
- payout auto-releases 7 days after `delivered` if no support/admin hold exists

---

## 14. Admin Action Types

| Action | Target | Typical reason |
|--------|--------|----------------|
| `suspend_account` | user | abuse, fraud, repeated violations |
| `unsuspend_account` | user | issue resolved |
| `suspend_gig` | gig | abuse, scam suspicion, policy violation |
| `unpublish_gig` | gig | manual moderation action |
| `restrict_project` | project | copyright complaint, dispute, policy issue |
| `restore_project` | project | complaint resolved |
| `hold_payout` | payout | dispute, KYC, fraud check |
| `release_payout` | payout | issue cleared |

### Audit requirement
Every admin action must store:
- actor
- target object
- timestamp
- reason code
- optional internal note

---

## 15. Recommended QA Focus Areas

- permissions are enforced server-side, not only in UI
- expired/revoked invites cannot be replayed
- published versions are immutable
- failed upload in a batch does not fail successful siblings
- payout state remains correct when webhook timing is delayed
- split revisions preserve full history
- suspended objects become inaccessible in the right surfaces
