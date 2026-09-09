#!/usr/bin/env bash
# Exercise scripts/nightly-version.sh against a scratch tag history. The
# version a nightly gets must sort above every release, candidate, hotfix
# and earlier nightly, or the test-builds channel ranks an older build newest.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/nightly-version.sh"
REPO="$(mktemp -d)"
trap 'rm -rf "${REPO}"' EXIT

cd "${REPO}"
git init -q
git -c user.email=t@example.com -c user.name=t commit -q --allow-empty -m init
commit() { git -c user.email=t@example.com -c user.name=t commit -q --allow-empty -m "$1"; }

decide() { # $1 = date stamp; prints the version= value or "build=false"
  local out
  out="$(NIGHTLY_STAMP="$1" bash "${SCRIPT}" 2>/dev/null)"
  if grep -q '^build=false$' <<< "${out}"; then echo "build=false"; else sed -n 's/^version=//p' <<< "${out}"; fi
}
expect() { # $1 = label, $2 = got, $3 = want
  if [ "$2" != "$3" ]; then echo "FAIL: $1: got '$2', want '$3'"; exit 1; fi
  echo "ok: $1 -> $2"
}

echo "Test 1: one patch above the newest release"
git tag v1.12.2
expect "after v1.12.2" "$(decide 20260901)" "v1.12.3-dev.20260901"
git tag v1.12.3-dev.20260901

echo "Test 2: nothing new since the last nightly skips, FORCE builds"
expect "same commit" "$(decide 20260902)" "build=false"
forced="$(FORCE=true NIGHTLY_STAMP=20260902 bash "${SCRIPT}" 2>/dev/null | sed -n 's/^version=//p')"
expect "forced same commit" "${forced}" "v1.12.3-dev.20260902"

echo "Test 3: a second build on the same day gets a .2 suffix"
commit "work"
expect "same day again" "$(decide 20260901)" "v1.12.3-dev.20260901.2"

echo "Test 4: a candidate of an unreleased minor moves nightlies to the next minor"
git tag v1.13.0-rc.0
expect "after v1.13.0-rc.0" "$(decide 20260905)" "v1.14.0-dev.20260905"
git tag v1.14.0-dev.20260905

echo "Test 5: the stable shipping does not pull nightlies back below the last one"
commit "more work"
git tag v1.13.0
expect "after v1.13.0 with nightlies at 1.14.0" "$(decide 20260910)" "v1.14.0-dev.20260910"
git tag v1.14.0-dev.20260910

echo "Test 6: a hotfix of that release does not either"
commit "hotfix"
git tag v1.13.1
expect "after v1.13.1" "$(decide 20260912)" "v1.14.0-dev.20260912"
git tag v1.14.0-dev.20260912

echo "Test 7: the next candidate moves nightlies up again"
commit "next"
git tag v1.14.0-rc.0
expect "after v1.14.0-rc.0" "$(decide 20260920)" "v1.15.0-dev.20260920"
git tag v1.15.0-dev.20260920

echo "Test 8: every nightly sorted above the release tags it followed"
# The order the update check would see: newest first by semver.
sorted="$(git -c versionsort.suffix=-alpha -c versionsort.suffix=-beta -c versionsort.suffix=-dev -c versionsort.suffix=-rc \
  tag -l 'v*' --sort=-v:refname | head -n 1)"
expect "newest tag overall" "${sorted}" "v1.15.0-dev.20260920"

echo "All nightly-version tests passed"
