# Beads Dashboard

Local visual dashboard over `.beads/issues.jsonl`.

This tool is intentionally isolated from the application source tree. It does not
live under `src/`, does not depend on the Next.js app runtime, and treats beads
as the only source of truth.

## What it shows

- summary counts for open, in progress, blocked, and closed work
- epic progress with task completion ratios
- scope split across `MVP Core`, `Ops`, `Stream 2`, and `Tooling`
- kanban board grouped by derived work state
- issue cards with epic, priority, dependencies, and dependents

## Run

```bash
python3 tools/beads-dashboard/server.py
```

Then open:

```text
http://127.0.0.1:8765
```

Optional flags:

```bash
python3 tools/beads-dashboard/server.py --host 0.0.0.0 --port 9000
```

## Notes

- The dashboard reads `.beads/issues.jsonl` directly on each request.
- `blocked` is derived from unresolved dependencies, not just the raw beads text output.
- If a task has a numeric prefix such as `05-03`, it is grouped under the matching
  epic code `EPIC-05` when present.
