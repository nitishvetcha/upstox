#!/usr/bin/env bash
# Runs the remaining approved options research slots, one round each, at their IST start times.
# A slot whose time has already passed is skipped, never run late. An authentication failure stops the schedule.
# No OAuth refresh, no token generation, no paper trading, no broker execution.
set -u
cd "$(dirname "$0")/.." || exit 1

TARGETS=(131500 135500 143500 151500)

for target in "${TARGETS[@]}"; do
  now=$(date +%H%M%S)
  if (( 10#$now >= 10#$target )); then
    echo "SKIPPED: $target — time already passed ($now)"
    continue
  fi
  while (( 10#$(date +%H%M%S) < 10#$target )); do
    sleep 10
  done

  echo "=== Research slot $target: $(date '+%Y-%m-%d %H:%M:%S %Z') ==="
  gate=$(node --env-file=.env.local scripts/check-research-token.ts 2>/dev/null)
  if [ $? -ne 0 ]; then
    echo "AUTH_STOP: no usable token at $target ($gate). Schedule stopped. Log in manually, then restart."
    exit 3
  fi
  echo "token gate: $gate"

  node --env-file=.env.local scripts/options-audit-research.ts round
  echo "=== Slot $target finished with exit $? ==="
done

echo "=== All remaining approved slots processed ==="
