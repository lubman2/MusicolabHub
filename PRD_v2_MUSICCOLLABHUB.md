# MusicCollabHub - Product Requirements Document (PRD) v2

**Version:** 2.1  
**Status:** Draft after red-team decisions  
**Target Release Window:** 6-8 months  
**Source inputs:** `Pre-PRD_MUSICCOLLABHUB.md`, `PRD_Clarification_Spec_MUSICCOLLABHUB.md`

---

## 1. Product Overview

MusicCollabHub is a secure collaboration workspace for music creators that combines project file management, collaborator feedback, contributor split records, and a later attached hiring flow.

The MVP is not a DAW replacement, not a live co-editing system, and not a royalty ingestion platform. The first customer-ready release focuses on helping creators manage remote collaboration around music assets. Marketplace hiring remains part of the product direction, but it is defined as Stream 2 and is not launch-blocking for the initial release.

### Core product thesis
Music creators need one place to:
- organize project files and versions
- invite collaborators with clear permissions
- exchange structured feedback
- hire external talent when internal collaborators are insufficient
- record contributor roles and ownership splits

---

## 2. Problem Statement

Independent artists, producers, and engineers often coordinate work across cloud drives, chat tools, email, DAW exports, and ad hoc spreadsheets. This creates fragmentation in:
- file storage and version visibility
- collaborator permissions
- feedback tracking
- hiring workflows
- contributor and split record-keeping

The result is lost context, unclear ownership, duplicated files, and operational friction during collaboration.

---

## 3. Goals and Non-Goals

### Goals
- Enable a creator to launch and manage a music collaboration project in one workspace
- Support secure file upload, organization, and snapshot-based version history
- Support collaborator invitations with role-based permissions
- Support project, file, and version-level commenting
- Support ownership split creation and contributor confirmation workflows
- Support subscriptions using Stripe infrastructure

### Non-Goals
- Live DAW synchronization
- Real-time co-editing of music sessions
- AI audio processing
- Marketplace as a launch-blocking requirement for the first customer-ready release
- Public review and rating systems
- Complex dispute automation
- External royalty ingestion from Spotify, Apple Music, or distributors
- Royalty accounting or monthly royalty payout infrastructure

---

## 4. MVP Definition

### In scope
- account creation and onboarding
- creator profiles and portfolio
- project creation and metadata
- file upload and storage
- snapshot-based project versioning
- collaborator invitations and membership roles
- commenting and activity logging
- notification events
- subscription checkout
- ownership split records and confirmation workflow
- internal admin/support tooling

### Stream 2, not launch-blocking
- gig draft, publish, browse, apply, and accept flows
- Stripe Connect onboarding
- marketplace payments and payouts for hired talent
- hired talent handoff into project collaboration

### Out of scope
- waveform-first feedback as a required UX baseline
- chat and messaging systems beyond application note/comments
- milestone engine
- formal escrow engine
- automated revision rounds
- rights verification or legal validation of split claims

---

## 5. Primary Personas

### Project Owner / Creator
Primary paying user.
- creates projects
- uploads and manages files
- invites collaborators
- creates gigs
- manages ownership splits
- pays subscription

### Collaborator
Invited participant inside a project.
- reviews files
- comments on work
- may upload or publish versions if granted editor rights

### Marketplace Talent
Freelancer discoverable through marketplace workflows.
- maintains portfolio
- browses gigs
- applies to gigs
- can become hired collaborator

### Admin / Support
Internal operational user.
- reviews disputes and abuse reports
- suspends content or accounts
- reviews payment/payout status

---

## 6. User Value Proposition

For creators:
- one workspace for project assets, team coordination, and talent sourcing

For collaborators:
- clear access model and feedback context without fragmented tooling

For hired talent:
- direct path from discovery to a controlled project handoff and payout

---

## 7. Core User Flows

### 7.1 Signup and onboarding
User signs up, verifies email, completes onboarding, and receives an active account and profile.

### 7.2 Create project
Creator creates a new project with minimal metadata and receives an active project workspace.

### 7.3 Upload files
Owner or editor uploads supported files to the project. Files become available in the project context and can later be included in a published version snapshot.

### 7.4 Invite collaborator
Owner sends an invitation to an existing or new user, assigns a role, and the invitee joins the project after acceptance.

### 7.5 Comment on work
Authorized collaborators create comment threads on a project, file, or version.

### 7.6 Publish gig
Creator creates a gig draft under an existing project, fills in required fields, and publishes it to the marketplace.

### 7.7 Apply to gig
Marketplace talent submits an application to a published gig.

### 7.8 Hire collaborator
Buyer accepts one application, closes or expires the others, and starts a controlled handoff of the accepted talent into the collaboration workflow.

### 7.9 Define ownership split
Owner records contributors, roles, and percentages, then submits the split for contributor confirmation.

### 7.10 Payment and payout
User completes subscription checkout or marketplace payment flow, and the platform reconciles payment and payout states through Stripe and Stripe Connect. For marketplace work, payout is released on buyer approval or auto-released after 7 days from delivery unless explicitly held.

---

## 8. Functional Requirements

## 8.1 Project Hub

### Supported file types
- `.mp3`
- `.wav`
- `.aiff`
- `.zip`
- `.pdf`
- `.txt`
- `.docx`
- `.png`
- `.jpg`

### Upload model
- multi-file batch upload in UI
- per-file processing in backend
- file-level errors must not fail the entire batch

### Versioning model
- versions are named snapshots
- no git-like merge logic in MVP
- version includes author, timestamp, changelog, and file list
- only owner and editor can publish versions

### Commenting model
- comments are plain text threads
- comments can target project, file, or version
- timestamped waveform comments are not required in MVP

### Real-time model
- lightweight event delivery only
- acceptable channels: polling, refresh, optimistic UI, or WebSocket events for comments/invites/version publication
- no live sync editing

## 8.2 Permissions

Project roles:
- Owner
- Editor
- Commenter
- Viewer

Rules:
- only owner can invite collaborators in MVP
- only owner manages splits
- editor can upload and publish versions
- commenter can read and comment only
- viewer has read-only access
- project files are private by default
- hired talent does not receive full project access by default
- owner must explicitly grant broader asset access after hire when needed

## 8.3 Marketplace

Marketplace scope:
- create gig draft under an existing project
- publish gig
- browse and filter gigs
- submit application
- accept applicant
- hand off restricted collaborator access

Marketplace exclusions:
- reviews and ratings
- milestone workflows
- automated dispute center
- revision round system

### Delivery model
- marketplace is `Stream 2`
- marketplace is not launch-blocking for the first customer-ready release
- every gig belongs to an existing project

### Portfolio
Each marketplace-capable profile includes:
- headline
- bio
- skills
- genres
- price range
- up to 10 work samples or links

## 8.4 Payments

### Subscription billing
- trial followed by paid plans only
- no permanent free tier after trial
- failed payments move user into `past_due`
- new uploads/projects/gig publication can be blocked after grace period

### Marketplace payments
- payment collected through Stripe
- payout routed through Stripe Connect
- platform fee deducted on successful payment
- payout released on buyer approval or auto-released 7 days after delivery
- admin/support may place a payout hold before release

## 8.5 Ownership and Contributor Records

### Split workflow
- owner creates split draft
- split is project-level only in the first customer-ready release
- split must total 100% before submission
- contributors with non-zero allocation must confirm
- confirmed splits cannot be edited in place
- changes require a new revision that supersedes the previous one

### MVP positioning
This is a contributor record and confirmation system, not a royalty ingestion or legal enforcement system.

## 8.6 Admin and Support

Internal tooling must support:
- lookup of users, projects, gigs, payments, and payouts
- account suspension
- gig unpublish/suspension
- project access restriction
- audit trail visibility
- payout/KYC state review

---

## 9. Data and State Model Principles

The system must be implemented around explicit stateful domain objects rather than implicit UI assumptions.

Critical stateful objects:
- Project
- ProjectMember
- ProjectFile
- ProjectVersion
- Invitation
- CommentThread
- Comment
- Gig
- GigApplication
- SplitRecord
- SplitConfirmation
- Subscription
- PaymentRecord
- PayoutRecord

---

## 10. Non-Functional Requirements

### Capacity
- target project size: `1-10 GB`
- maximum file size: `2 GB`
- typical files per project: `20-200`
- target active projects supported in MVP architecture: `1,000`

### Performance
- project detail load `p95 < 2.5s`
- comment create `p95 < 1s`
- gig search first render `p95 < 2s`
- uploaded file metadata visible within `5s` after completion

### Security
- private-by-default projects and files
- signed file access or equivalent secure asset delivery
- server-side authorization for all sensitive operations
- encryption at rest
- email verification for sensitive flows
- admin action auditing

### Reliability
- daily database backups
- storage durability/versioning where applicable
- soft delete for project metadata for `30 days`

---

## 11. Legal and Compliance Principles

- users are responsible for rights to uploaded content
- users are responsible for ownership claims they submit
- MusicCollabHub records contributor-declared agreements but does not verify legal correctness
- contributor consent must be explicit in split confirmation and hire acceptance flows
- project content is private by default
- MVP must support minimum GDPR workflows for delete/export requests

---

## 12. Success Metrics

### Product KPIs
- signup to onboarding completion rate
- onboarding completion to first project creation rate
- project creation to first file upload rate
- project creation to first collaborator invite rate
- trial to paid conversion
- 30-day retained active creators

### Stream 2 KPIs
- published gig to first application rate
- application to hire conversion
- delivered to payout completion rate

### Activation metric
Creator is activated when, within 7 days of signup, they:
- create a project
- upload at least one file
- invite at least one collaborator

---

## 13. Acceptance Criteria Summary

The first customer-ready release is done only when the following launch-critical capabilities are functional end-to-end:
- project creation
- file upload with storage and metadata persistence
- collaborator invitation and acceptance
- comment creation with authorization
- ownership split creation and confirmation
- subscription payment state reconciliation

Each capability must include:
- happy path support
- edge case handling
- failure state handling
- auditability

### Stream 2 acceptance block
Marketplace Stream 2 is done only when the following capabilities are functional end-to-end:
- gig publish and discovery
- gig application and hire handoff
- marketplace payment and payout state reconciliation

---

## 14. Key Risks

### Technical risk
Audio collaboration can expand rapidly into DAW-specific complexity.

Mitigation:
- keep the MVP centered on files, versions, and comments

### Marketplace risk
Liquidity may be weak in early stages.

Mitigation:
- treat marketplace as Stream 2, not as a launch dependency for the first customer-ready release

### Legal risk
Users may over-interpret split records as verified legal rights.

Mitigation:
- clear product copy and TOS language distinguishing record-keeping from legal adjudication

### Security risk
Private music assets are highly sensitive.

Mitigation:
- strong asset authorization model and audit trail from day one

---

## 15. Open Review Questions

These are intentionally left open for the next review round:
- No launch-critical open questions currently locked in PRD scope.
