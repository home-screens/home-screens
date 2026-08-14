#!/usr/bin/env bash
# End-to-end test for scripts/kiosk-update.sh against a local fixture server.
#
# The updater's whole value is that it fails safe: a hub that is down, a
# corrupt download, or a broken script must all leave the display running
# exactly what it was running before. Those are the cases worth testing, so
# most of what follows is failure paths.
set -euo pipefail

cd "$(dirname "$0")/.."   # scripts/
SCRIPTS_DIR="$(pwd)"
FIXTURES="${SCRIPTS_DIR}/__tests__/fixtures"

for tool in jq python3 sha256sum; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "${tool} not installed — skipping kiosk-update test"
    exit 0
  fi
done

WORK="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  [ -n "${SERVER_PID}" ] && kill "${SERVER_PID}" 2>/dev/null || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

APP_DIR="${WORK}/app"
STATE="${WORK}/state"
STAGE="${WORK}/stage"
mkdir -p "${APP_DIR}/scripts" "${APP_DIR}/data" "${APP_DIR}/share" "${STATE}"

# Pick a free port so parallel CI jobs don't collide.
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"

cat > "${APP_DIR}/data/kiosk.conf" <<EOF
DISPLAY_URL="http://127.0.0.1:${PORT}/display/testpi"
BACKEND_URL="http://127.0.0.1:${PORT}"
DISPLAY_ID="testpi"
EOF

install -m 0755 "${SCRIPTS_DIR}/kiosk-update.sh" "${APP_DIR}/scripts/kiosk-update.sh"
UPDATER="${APP_DIR}/scripts/kiosk-update.sh"

# Pre-existing files, so we can prove they survive a failed update and get
# moved aside (not deleted) on a successful one.
echo '#!/usr/bin/env bash' > "${APP_DIR}/scripts/kiosk-launcher.sh"
echo 'echo OLD-LAUNCHER' >> "${APP_DIR}/scripts/kiosk-launcher.sh"
chmod +x "${APP_DIR}/scripts/kiosk-launcher.sh"
echo '<html>OLD SPLASH</html>' > "${APP_DIR}/share/connecting.html"

# --- Fixture bundle helpers -------------------------------------------------

# build_bundle <version> [launcher-body]
# Writes state/bundle.tar.gz and state/manifest.json with a matching digest.
build_bundle() {
  local version="$1"
  local launcher_body="${2:-echo NEW-LAUNCHER}"

  rm -rf "${STAGE}"
  mkdir -p "${STAGE}/share" "${STAGE}/system"

  printf '#!/usr/bin/env bash\n%s\n' "${launcher_body}" > "${STAGE}/kiosk-launcher-display.sh"
  printf '#!/usr/bin/env bash\n# updater v%s\nexit 0\n' "${version}" > "${STAGE}/kiosk-update.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${STAGE}/kiosk-update-install.sh"
  printf '<html>NEW SPLASH %s</html>\n' "${version}" > "${STAGE}/share/connecting.html"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${STAGE}/system/reporter.sh"

  ( cd "${STAGE}" && tar -czf "${STATE}/bundle.tar.gz" . )
  write_manifest "${version}" "$(sha256sum "${STATE}/bundle.tar.gz" | cut -d' ' -f1)" "false"
}

write_manifest() {
  jq -n --arg v "$1" --arg s "$2" --argjson r "$3" \
    '{version: $v, sha256: $s, restartAdvised: $r, files: []}' > "${STATE}/manifest.json"
}

stamp() { cat "${APP_DIR}/data/kiosk-bundle.version" 2>/dev/null || echo ""; }

fail() { echo "FAIL: $*" >&2; exit 1; }

# --- Start the fixture hub --------------------------------------------------
build_bundle "2.0.0"
python3 "${FIXTURES}/kiosk-bundle-server.py" "${PORT}" "${STATE}" &
SERVER_PID=$!
for _ in $(seq 1 50); do
  curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/api/display/kiosk-bundle?display=testpi&manifest=1" \
    >/dev/null 2>&1 && break
  sleep 0.1
done

echo "Test 1: applies an update and reports exit 10"
rc=0; "${UPDATER}" --timeout 5 || rc=$?
[ "${rc}" -eq 10 ] || fail "expected exit 10, got ${rc}"
[ "$(stamp)" = "2.0.0" ] || fail "stamp not written (got '$(stamp)')"
grep -q 'NEW-LAUNCHER' "${APP_DIR}/scripts/kiosk-launcher.sh" \
  || fail "launcher was not replaced"
grep -q 'NEW SPLASH' "${APP_DIR}/share/connecting.html" \
  || fail "splash was not replaced"
[ -x "${APP_DIR}/scripts/kiosk-launcher.sh" ] || fail "launcher lost its exec bit"

echo "Test 2: the bundle launcher lands at kiosk-launcher.sh, not its repo name"
# ~/.bash_profile execs scripts/kiosk-launcher.sh on every Pi in the field, so
# installing under the repo filename would leave the display booting the old one.
[ ! -f "${APP_DIR}/scripts/kiosk-launcher-display.sh" ] \
  || fail "installed under the repo filename instead of the boot filename"

echo "Test 3: the previous files are kept for manual rollback"
grep -q 'OLD-LAUNCHER' "${APP_DIR}/scripts/.prev/kiosk-launcher.sh" \
  || fail ".prev does not hold the previous launcher"

echo "Test 4: the updater replaced itself, and did so last"
grep -q 'updater v2.0.0' "${APP_DIR}/scripts/kiosk-update.sh" \
  || fail "updater did not replace itself"
grep -q 'kiosk-update' "${APP_DIR}/scripts/.prev/kiosk-update.sh" \
  || fail ".prev does not hold the previous updater"

# The self-replacement above swapped in the fixture's stub updater. Put the
# real one back, or every test below would silently exercise the stub and
# pass for the wrong reason.
install -m 0755 "${SCRIPTS_DIR}/kiosk-update.sh" "${UPDATER}"

echo "Test 5: a second run with the same version is a no-op"
rc=0; "${UPDATER}" --timeout 5 || rc=$?
[ "${rc}" -eq 0 ] || fail "expected exit 0 on an up-to-date spoke, got ${rc}"

echo "Test 6: a checksum mismatch changes nothing"
build_bundle "3.0.0"
write_manifest "3.0.0" "$(printf '0%.0s' $(seq 1 64))" "false"
rc=0; "${UPDATER}" --timeout 5 || rc=$?
[ "${rc}" -eq 0 ] || fail "expected a soft exit 0 on checksum mismatch, got ${rc}"
[ "$(stamp)" = "2.0.0" ] || fail "stamp advanced despite a bad checksum"
grep -q 'NEW SPLASH 2.0.0' "${APP_DIR}/share/connecting.html" \
  || fail "files were touched despite a bad checksum"

echo "Test 7: a syntax error in a bundled script changes nothing"
build_bundle "4.0.0" 'if [ broken'
rc=0; "${UPDATER}" --timeout 5 || rc=$?
[ "${rc}" -eq 0 ] || fail "expected a soft exit 0 on a syntax error, got ${rc}"
[ "$(stamp)" = "2.0.0" ] || fail "stamp advanced despite a syntax error"
grep -q 'NEW SPLASH 2.0.0' "${APP_DIR}/share/connecting.html" \
  || fail "files were touched despite a syntax error"

echo "Test 8: a concurrent run is skipped rather than racing the staging dir"
# The nightly timer and the launcher-run check can genuinely overlap. Both
# stage into one fixed directory, so a second runner must stand down instead
# of deleting files out from under the first one's privileged helper.
mkdir -p "${APP_DIR}/data/.kiosk-update.lock"
build_bundle "5.0.0"
rc=0; "${UPDATER}" --timeout 5 || rc=$?
[ "${rc}" -eq 0 ] || fail "expected exit 0 while another run holds the lock, got ${rc}"
[ "$(stamp)" = "2.0.0" ] || fail "a locked-out run still applied an update"
rmdir "${APP_DIR}/data/.kiosk-update.lock"

echo "Test 9: the lock is released after a normal run"
rc=0; "${UPDATER}" --timeout 5 || rc=$?
[ "${rc}" -eq 10 ] || fail "expected the update to apply once the lock cleared, got ${rc}"
[ ! -d "${APP_DIR}/data/.kiosk-update.lock" ] || fail "lock was left behind"
[ "$(stamp)" = "5.0.0" ] || fail "stamp did not advance (got '$(stamp)')"
install -m 0755 "${SCRIPTS_DIR}/kiosk-update.sh" "${UPDATER}"

echo "Test 10: a stale lock does not block updates forever"
mkdir -p "${APP_DIR}/data/.kiosk-update.lock"
# Backdate well past the 30-minute staleness threshold.
touch -t 200001010000 "${APP_DIR}/data/.kiosk-update.lock"
build_bundle "6.0.0"
rc=0; "${UPDATER}" --timeout 5 || rc=$?
[ "${rc}" -eq 10 ] || fail "a stale lock blocked the update (exit ${rc})"
[ "$(stamp)" = "6.0.0" ] || fail "stamp did not advance past a stale lock"
install -m 0755 "${SCRIPTS_DIR}/kiosk-update.sh" "${UPDATER}"

echo "Test 11: a partial apply does not stamp, so the next check retries"
# Point the updater at a privileged helper that exists but fails. The system
# half then can't be applied, and recording the new version anyway would
# strand the reporter and units until some later version bump.
FAKE_HELPER="${WORK}/fake-privileged.sh"
printf '#!/usr/bin/env bash\nexit 1\n' > "${FAKE_HELPER}"
chmod +x "${FAKE_HELPER}"
build_bundle "7.0.0"
sed "s#^PRIV_HELPER=.*#PRIV_HELPER=\"${FAKE_HELPER}\"#" "${SCRIPTS_DIR}/kiosk-update.sh" \
  > "${APP_DIR}/scripts/kiosk-update-partial.sh"
chmod +x "${APP_DIR}/scripts/kiosk-update-partial.sh"
# `sudo -n <helper>` is what actually fails here; on a host without passwordless
# sudo it fails for a different reason, which exercises the same branch.
rc=0; "${APP_DIR}/scripts/kiosk-update-partial.sh" --timeout 5 || rc=$?
[ "${rc}" -eq 10 ] || fail "expected exit 10 after a partial apply, got ${rc}"
[ "$(stamp)" = "6.0.0" ] || fail "stamp advanced despite the system half failing (got '$(stamp)')"
# The user-space half still landed — those files are the ones that matter most.
grep -q 'NEW SPLASH 7.0.0' "${APP_DIR}/share/connecting.html" \
  || fail "user-space files were not applied during a partial update"
install -m 0755 "${SCRIPTS_DIR}/kiosk-update.sh" "${UPDATER}"

echo "Test 12: an unreachable hub changes nothing"
kill "${SERVER_PID}" 2>/dev/null || true
wait "${SERVER_PID}" 2>/dev/null || true
SERVER_PID=""
rc=0; "${UPDATER}" --timeout 2 || rc=$?
[ "${rc}" -eq 0 ] || fail "expected exit 0 when the hub is down, got ${rc}"
[ "$(stamp)" = "6.0.0" ] || fail "stamp changed while the hub was down"

echo "Test 13: a Pi with no hub in kiosk.conf is left alone"
# This is the guard that keeps the updater inert if it ever lands on a hub Pi,
# whose kiosk.conf carries no BACKEND_URL/DISPLAY_ID.
: > "${APP_DIR}/data/kiosk.conf"
rc=0; "${UPDATER}" --timeout 2 || rc=$?
[ "${rc}" -eq 0 ] || fail "expected exit 0 with no hub configured, got ${rc}"

echo "All kiosk-update tests passed."
