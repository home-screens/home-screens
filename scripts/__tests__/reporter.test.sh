#!/usr/bin/env bash
# Smoke-test scripts/reporter.sh in "dry-run" mode — it should assemble a
# payload and print it to stdout instead of POSTing when REPORTER_DRY_RUN=1.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not installed — skipping reporter test"
  exit 0
fi

echo "Test 1: dry-run emits valid JSON with required keys"
out=$(REPORTER_DRY_RUN=1 \
     HOME_SCREENS_DISPLAY_ID=main \
     HOME_SCREENS_HUB_URL=http://localhost:3000 \
     bash reporter.sh)
echo "$out" | jq -e '.displayId == "main"' >/dev/null || { echo "FAIL: missing displayId"; exit 1; }
echo "$out" | jq -e '.hwStats | has("cpuCores")'   >/dev/null || { echo "FAIL: missing cpuCores"; exit 1; }
echo "$out" | jq -e '.hwStats | has("reportedAt")' >/dev/null || { echo "FAIL: missing reportedAt"; exit 1; }
echo "$out" | jq -e '.hwStats.cpuCores | type == "number"' >/dev/null || { echo "FAIL: cpuCores not a number"; exit 1; }

echo "Test 2: cpuTempC is null on non-Pi hosts (no /sys/class/thermal)"
# On macOS and non-Pi Linux, /sys/class/thermal does not exist. Assert the
# reporter emits null instead of crashing or emitting "".
if [[ ! -r /sys/class/thermal/thermal_zone0/temp ]]; then
  echo "$out" | jq -e '.hwStats.cpuTempC == null' >/dev/null || {
    echo "FAIL: expected cpuTempC=null on host without thermal zone"; exit 1; }
fi

echo "All reporter tests passed."
