# Zombie Session Cleanup

## Problem

Gas Town polecats sometimes leave behind stale lock files and session state when they crash or are forcibly terminated. These "zombie sessions" prevent new polecats from being spawned with the same name and waste system resources.

## Symptoms

1. **Idle sessions** - Polecat marked as "done" but has session last activity > 30 minutes
2. **Lock conflicts** - `gt polecat sling` fails with "session already running" for a polecat that isn't actually running
3. **Orphaned lock files** - Lock files in `.runtime/locks/` for polecats not in `gt polecat list`

## Detection

### 1. List all lock files
```bash
ls -lh /Users/lubman/gt/<rig>/.runtime/locks/polecat-*.lock
```

### 2. List active polecats
```bash
gt polecat list <rig> --json
```

### 3. Compare
Lock files that don't have a corresponding active polecat are zombies.

### 4. Check session age
For active polecats with "done" state:
```bash
stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" \
  /Users/lubman/gt/<rig>/polecats/<name>/<project>/.runtime/session_id
```

If last modified > 30 minutes ago and state is "idle" or "done", it's a zombie.

## Cleanup

### Manual cleanup

**For lock file zombies:**
```bash
# Verify polecat is NOT in gt polecat list
gt polecat list <rig>

# Remove lock file
rm /Users/lubman/gt/<rig>/.runtime/locks/polecat-<name>.lock
```

**For stuck sessions:**
```bash
# Force nuke the polecat (removes worktree, session, locks)
gt polecat nuke <rig>/<name> --force
```

**For "session already running" errors:**
```bash
# Nuke first, then re-sling
gt polecat nuke <rig>/<name> --force
gt polecat sling <rig>/<name> <issue-id>
```

## Prevention

1. **Proper shutdown** - Always use `gt done` to exit cleanly
2. **Witness monitoring** - Witness should periodically check for zombies
3. **Lock file TTL** - Consider adding timestamp-based lock expiry

## Automation Opportunity

Create a `gt zombie cleanup` command that:
1. Lists all lock files
2. Cross-references with active polecats
3. Prompts to remove orphaned locks
4. Checks session ages and offers to nuke idle sessions

## Current Status

As of 2026-04-24:
- Found 13 lock files in MusicolabHub rig
- Only 3 active polecats (jasper, obsidian, quartz)
- 10 zombie lock files from Apr 22 (2+ days old):
  - onyx, pearl, opal, topaz, pool, flint, ruby, jade, amber, garnet
