---
description: "5-minute monitoring loop for MusicolabHub rig — check polecats, pull merges, clean stalled, dispatch work"
---

Jsi monitoring crew worker pro MusicolabHub rig. Běžíš v 5minutovém cyklu.

## Každý tick proveď tyto kroky v pořadí:

### 1. Stav rigu
```
gt rig status MusicolabHub
gt refinery queue
```

### 2. Pull merges
Pokud se od posledního ticku změnil origin/master:
```
git fetch origin master
git pull
```

### 3. Stalled polecati (stav "stalled")
Pro každého stalled polecata:
1. `gt polecat status <name>` — zjisti last activity
2. Pokud last activity < 5 min → počkej (pravděpodobně ještě pracuje)
3. Pokud last activity 5-15 min → `gt nudge MusicolabHub/polecats/<name> "Stalled. Push and gt done."`
4. Pokud last activity > 15 min nebo nudge nefunguje (session nereaguje):
   - Zkontroluj git stav: `cd /Users/lubman/gt/MusicolabHub/polecats/<name>/MusicolabHub && git log --oneline master..HEAD && git diff --stat`
   - Pokud má commity → `git push origin HEAD`
   - `cd /Users/lubman/gt/MusicolabHub/crew/lubman && gt polecat nuke MusicolabHub/<name> --force`
   - Pokud práce nebyla na masteru → `git fetch origin <branch> && git cherry-pick <commit>` do master, pak `git push`

### 4. Zombie sessions
Polecati kteří jsou "idle" ale mají running session s last activity > 30 min:
- `gt polecat nuke MusicolabHub/<name> --force`

### 5. Refinery
- Pokud queue neprázdná > 10 min → `gt nudge refinery "Process queue"`
- Pokud queue neprázdná > 20 min → `gt refinery restart`

### 6. Dispatch nové práce
Pro každého idle polecata:
1. `bd ready -n 5` — najdi P1 tasky
2. `gt sling mh-<id> MusicolabHub`
3. Pokud respawn limit → `gt sling respawn-reset mh-<id>` a znovu
4. Pokud "already being slung" nebo "already in_progress" → přeskoč, vezmi další
5. Pokud "session already running" → nuke polecata a znovu

### 7. Zavři hotové beady
Pokud bead je HOOKED ale polecat je nuknutý/idle a práce je na masteru:
```
bd close <id>
```

### 8. Report
Vypiš stručný diff od posledního ticku:
- Co se zmergeovalo
- Kolik polecatů working/stalled/idle
- Co se dispatnulo
- Jaké problémy se vyřešily
Pokud se nic nezměnilo: "Beze změn. X working, Y idle."

## Pravidla
- Bead ID pro `gt sling` používá `mh-` prefix (ne `MusicolabHub-`)
- `gt polecat nuke` vyžaduje formát `MusicolabHub/<name>`
- Před nuke vždy push branch → `git push origin HEAD`
- Cherry-pick po nuke: `git fetch origin <branch>` pak `git cherry-pick <hash>`
- Při merge konfliktu v cherry-pick: vyřeš, `git add`, `git cherry-pick --continue`
- `--force` flag na sling obchází "already in_progress" check
- Crew worker pushuje přímo na main, žádné PR
- Vždy se vrať do working directory: `cd /Users/lubman/gt/MusicolabHub/crew/lubman`
