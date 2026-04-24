#!/bin/bash
# Detect zombie Gas Town polecat sessions
# Usage: ./detect-zombie-sessions.sh <rig-name>

set -euo pipefail

RIG="${1:-}"
if [ -z "$RIG" ]; then
  echo "Usage: $0 <rig-name>"
  echo "Example: $0 MusicolabHub"
  exit 1
fi

RIG_PATH="$HOME/gt/$RIG"
if [ ! -d "$RIG_PATH" ]; then
  echo "Error: Rig '$RIG' not found at $RIG_PATH"
  exit 1
fi

LOCKS_DIR="$RIG_PATH/.runtime/locks"
if [ ! -d "$LOCKS_DIR" ]; then
  echo "No locks directory found at $LOCKS_DIR"
  exit 0
fi

echo "=== Zombie Session Detection for $RIG ==="
echo

# Get active polecats
echo "Active polecats:"
ACTIVE_JSON=$(gt polecat list "$RIG" --json 2>/dev/null || echo "[]")
echo "$ACTIVE_JSON" | jq -r '.[] | "  - \(.name) (\(.state))"'
ACTIVE_NAMES=$(echo "$ACTIVE_JSON" | jq -r '.[].name')
echo

# Check lock files
echo "Lock files:"
ZOMBIE_COUNT=0
for lock in "$LOCKS_DIR"/polecat-*.lock; do
  if [ ! -f "$lock" ]; then
    continue
  fi

  name=$(basename "$lock" .lock | sed 's/^polecat-//')
  mtime=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$lock" 2>/dev/null || echo "unknown")

  # Check if this polecat is active
  if echo "$ACTIVE_NAMES" | grep -qx "$name"; then
    echo "  ✓ $name (active, modified: $mtime)"
  else
    echo "  ✗ $name (ZOMBIE, modified: $mtime)"
    ZOMBIE_COUNT=$((ZOMBIE_COUNT + 1))
  fi
done

echo
if [ $ZOMBIE_COUNT -eq 0 ]; then
  echo "✓ No zombie sessions detected"
else
  echo "⚠ Found $ZOMBIE_COUNT zombie lock file(s)"
  echo
  echo "To clean up zombies manually:"
  echo "  rm $LOCKS_DIR/polecat-<name>.lock"
  echo
  echo "Or force nuke the polecat:"
  echo "  gt polecat nuke $RIG/<name> --force"
fi
