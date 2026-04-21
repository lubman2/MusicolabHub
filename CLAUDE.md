# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
npm install
npm run dev        # dev server
npm run build      # production build
npm run lint       # ESLint
npm test           # Jest / Vitest
```

## Architecture Overview

MusicCollabHub — SaaS platforma pro hudební spolupráci (GitHub for music production).

- **Frontend:** Next.js (React) + Web Audio API + Tailwind
- **Backend:** Next.js API routes + Prisma ORM
- **DB:** PostgreSQL
- **Storage:** AWS S3 (DAW soubory, stemy)
- **Real-time:** WebSocket
- **Platby:** Stripe (subscriptions + marketplace provize)

Klíčové domény: Project Management, Marketplace, Royalty Tracking.

## Conventions & Patterns

- TypeScript strict mode
- Prisma pro DB schéma a migrace (`prisma/`)
- Komponenty v `src/components/`, stránky v `src/pages/`
- API routes v `src/pages/api/`

## Vault

Projektová knowledge: `/Users/lubman/AI/Lubmanova AI KnowledgeBase/20_Projects/MusicCollabHub/`
