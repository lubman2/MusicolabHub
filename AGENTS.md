# Agent Instructions

This project uses **GitHub** as the primary development tool. Issues, the
backlog (epics + tasks), and pull requests all live on GitHub.

## Issue Tracking — GitHub Issues

The full backlog lives in GitHub Issues, labelled by epic (`epic-00` … `epic-12`),
type (`feature`, `task`), priority (`p0`–`p3`), and stream (`stream-2`).

```bash
gh issue list                         # Open work
gh issue list --label epic-03         # Work in a given epic
gh issue view <number>                # Issue details
gh issue create --title "..." --body "..." --label task,epic-03,p2
gh issue close <number>               # Complete work
gh issue comment <number> --body "..."
```

Use GitHub Issues for ALL task tracking — do NOT reintroduce beads/bd, Dolt, or
markdown TODO lists.

## Git & Pull Request Workflow

1. Branch off `master` for any non-trivial change:
   ```bash
   git switch -c feat/<short-name>      # or fix/<short-name>
   ```
2. Make focused commits with clear messages. Reference the issue:
   ```bash
   git commit -m "feat: add X (#42)"
   ```
3. Run quality gates before pushing (see below).
4. Push and open a PR:
   ```bash
   git push -u origin HEAD
   gh pr create --fill
   ```
5. Link the PR to its issue ("Closes #42" in the PR body auto-closes on merge).

Small, low-risk fixes may go straight to `master` — branch + PR when the change
is substantial or worth review.

## Quality Gates

Run before pushing whenever code changed:

```bash
npm run lint
npm run build        # or the project's test command, if present
```

## Session Completion

When ending a work session:

1. **File issues** for any remaining/follow-up work (`gh issue create`).
2. **Run quality gates** if code changed (lint, build/tests).
3. **Update issues** — close finished work, comment on in-progress items.
4. **Push to remote**:
   ```bash
   git pull --rebase
   git push
   git status        # MUST show "up to date with origin"
   ```
5. **Verify** — all changes committed AND pushed.

Work is not complete until `git push` succeeds.

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on
confirmation prompts. `cp`, `mv`, and `rm` may be aliased to `-i` (interactive)
mode on some systems.

```bash
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

Other commands that may prompt:
- `scp` — use `-o BatchMode=yes`
- `ssh` — use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` — use `-y`
- `brew` — use `HOMEBREW_NO_AUTO_UPDATE=1`
