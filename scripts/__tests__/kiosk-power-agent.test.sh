#!/usr/bin/env bash
# Behavioural test for scripts/kiosk-power-agent.sh against a stub wlopm and
# a file:// power-state endpoint.
#
# The agent's whole job is to never strand a panel dark, so most of what
# follows checks the ON paths: hub says on, hub goes silent, the agent dies.
set -euo pipefail

cd "$(dirname "$0")/.."   # scripts/
SCRIPTS_DIR="$(pwd)"

for tool in curl; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "${tool} not installed — skipping kiosk-power-agent test"
    exit 0
  fi
done

WORK="$(mktemp -d)"
AGENT_PID=""
WATCH_PID=""
cleanup() {
  [ -n "${AGENT_PID}" ] && kill "${AGENT_PID}" 2>/dev/null || true
  [ -n "${WATCH_PID}" ] && kill "${WATCH_PID}" 2>/dev/null || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

APP_DIR="${WORK}/app"
mkdir -p "${APP_DIR}/scripts" "${APP_DIR}/data" "${WORK}/bin"
install -m 0755 "${SCRIPTS_DIR}/kiosk-power-agent.sh" "${APP_DIR}/scripts/kiosk-power-agent.sh"

ARGV_LOG="${WORK}/wlopm.log"
LISTING="${WORK}/listing"
STATE="${WORK}/state.json"
: > "${ARGV_LOG}"
echo "HDMI-A-1 on" > "${LISTING}"
echo '{"power":"on"}' > "${STATE}"

# Stub wlopm: logs every invocation, and with no arguments prints whatever
# listing the test currently wants the compositor to report.
cat > "${WORK}/bin/wlopm" <<EOF
#!/usr/bin/env bash
if [ \$# -eq 0 ]; then cat "${LISTING}"; exit 0; fi
echo "\$*" >> "${ARGV_LOG}"
exit 0
EOF
chmod +x "${WORK}/bin/wlopm"

# The pid the agent watches; killing it is how the launcher's exit is simulated.
sleep 300 &
WATCH_PID=$!

PATH="${WORK}/bin:${PATH}" \
HS_POWER_STATE_URL="file://${STATE}" \
HS_POWER_POLL_SECONDS=0.2 \
  "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!

# wait_for <pattern> <count> <label>: poll the argv log until it holds at
# least <count> lines matching <pattern>.
wait_for() {
  local pattern="$1" count="$2" label="$3" i
  for i in $(seq 1 50); do
    if [ "$(grep -c -- "${pattern}" "${ARGV_LOG}" || true)" -ge "${count}" ]; then
      return 0
    fi
    sleep 0.1
  done
  echo "FAIL: ${label}"
  echo "--- wlopm argv log ---"; cat "${ARGV_LOG}"
  exit 1
}

count_of() {
  grep -c -- "$1" "${ARGV_LOG}" || true
}

echo "Test 1: asserts the panel on at startup"
wait_for '^--on \*$' 1 "expected an initial wlopm --on"

echo "Test 2: hub says off → panel off, once"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 1 "expected wlopm --off after the hub answered off"
echo "HDMI-A-1 off" > "${LISTING}"
sleep 1
[ "$(count_of '^--off \*$')" -eq 1 ] || { echo "FAIL: --off repeated while the output already reported off"; cat "${ARGV_LOG}"; exit 1; }

echo "Test 3: output flaps back on → off is re-asserted"
echo "HDMI-A-1 on" > "${LISTING}"
wait_for '^--off \*$' 2 "expected a second wlopm --off after the listing showed the output on"
echo "HDMI-A-1 off" > "${LISTING}"

echo "Test 4: hub says on → panel on"
echo '{"power":"on"}' > "${STATE}"
wait_for '^--on \*$' 2 "expected wlopm --on after the hub answered on"

echo "Test 5: hub goes silent while off → panel forced on after three failures"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 3 "expected wlopm --off before simulating hub silence"
rm -f "${STATE}"
wait_for '^--on \*$' 3 "expected wlopm --on after the hub went silent"

echo "Test 6: malformed answer counts as on"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 4 "expected wlopm --off before the malformed answer"
echo 'not json' > "${STATE}"
wait_for '^--on \*$' 4 "expected wlopm --on after a malformed answer"

echo "Test 7: the watched pid dying ends the agent and restores power"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 5 "expected wlopm --off before killing the watched pid"
kill "${WATCH_PID}" 2>/dev/null
wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""
for i in $(seq 1 50); do
  kill -0 "${AGENT_PID}" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "${AGENT_PID}" 2>/dev/null; then
  echo "FAIL: agent kept running after the watched pid exited"; exit 1
fi
AGENT_PID=""
wait_for '^--on \*$' 5 "expected wlopm --on from the EXIT trap"

echo "Test 7b: a termination signal ends the agent and restores power"
: > "${ARGV_LOG}"
echo '{"power":"off"}' > "${STATE}"
sleep 300 &
WATCH_PID=$!
PATH="${WORK}/bin:${PATH}" \
HS_POWER_STATE_URL="file://${STATE}" \
HS_POWER_POLL_SECONDS=0.2 \
  "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!
wait_for '^--off \*$' 1 "expected wlopm --off before sending TERM"
kill -TERM "${AGENT_PID}"
for i in $(seq 1 50); do
  kill -0 "${AGENT_PID}" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "${AGENT_PID}" 2>/dev/null; then
  echo "FAIL: agent kept running after SIGTERM"; exit 1
fi
wait "${AGENT_PID}" 2>/dev/null || true
AGENT_PID=""
# Exactly the startup --on and the trap's --on: a handler that merely
# returned would have polled again and switched the panel off a second time.
[ "$(count_of '^--off \*$')" -eq 1 ] || { echo "FAIL: --off re-issued after SIGTERM"; cat "${ARGV_LOG}"; exit 1; }
wait_for '^--on \*$' 2 "expected wlopm --on from the EXIT trap after SIGTERM"
kill "${WATCH_PID}" 2>/dev/null; wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""

echo "Test 8: no wlopm on PATH → waits without touching anything, and exits with the watched pid"
: > "${ARGV_LOG}"
sleep 300 &
WATCH_PID=$!
PATH="/usr/bin:/bin" HS_POWER_STATE_URL="file://${STATE}" HS_POWER_RETRY_SECONDS=0.2 \
  bash "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!
sleep 1
kill -0 "${AGENT_PID}" 2>/dev/null || { echo "FAIL: agent exited instead of waiting for wlopm"; exit 1; }
[ ! -s "${ARGV_LOG}" ] || { echo "FAIL: wlopm was called without being on PATH"; exit 1; }
kill "${WATCH_PID}" 2>/dev/null; wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""
for i in $(seq 1 50); do
  kill -0 "${AGENT_PID}" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "${AGENT_PID}" 2>/dev/null; then
  echo "FAIL: waiting agent kept running after the watched pid exited"; exit 1
fi
wait "${AGENT_PID}" 2>/dev/null || true
AGENT_PID=""
[ ! -s "${ARGV_LOG}" ] || { echo "FAIL: a waiting agent must not touch wlopm on exit"; exit 1; }

echo "Test 9: wlopm installed later → the waiting agent starts without a restart"
# The nightly update can install the package long after the launcher started
# this agent. A late PATH directory stands in for apt landing the binary.
LATE_BIN="${WORK}/late-bin"
mkdir -p "${LATE_BIN}"
: > "${ARGV_LOG}"
echo '{"power":"off"}' > "${STATE}"
echo "HDMI-A-1 on" > "${LISTING}"
sleep 300 &
WATCH_PID=$!
PATH="${LATE_BIN}:/usr/bin:/bin" HS_POWER_STATE_URL="file://${STATE}" \
HS_POWER_RETRY_SECONDS=0.2 HS_POWER_POLL_SECONDS=0.2 \
  bash "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!
sleep 0.6
[ ! -s "${ARGV_LOG}" ] || { echo "FAIL: wlopm was called before it existed"; exit 1; }
cp "${WORK}/bin/wlopm" "${LATE_BIN}/wlopm"
wait_for '^--on \*$' 1 "expected the startup --on once wlopm appeared"
wait_for '^--off \*$' 1 "expected --off from normal polling once wlopm appeared"
kill "${AGENT_PID}" 2>/dev/null; wait "${AGENT_PID}" 2>/dev/null || true
AGENT_PID=""
kill "${WATCH_PID}" 2>/dev/null; wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""

echo "All kiosk-power-agent tests passed."
