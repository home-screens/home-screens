#!/usr/bin/env bash
# Exercise scripts/dev/nightly-version.sh against a scratch tag history. The
# version a nightly gets must name the next version cut from main, and sort
# above every release, beta, candidate, hotfix and earlier nightly, or the
# test-builds channel ranks an older build newest.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/dev/nightly-version.sh"
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
newest_tag() { # newest first by semver, the order the update check sees
  git -c versionsort.suffix=-alpha -c versionsort.suffix=-beta -c versionsort.suffix=-dev -c versionsort.suffix=-rc \
    tag -l 'v*' --sort=-v:refname | head -n 1
}
nightly() { # $1 = label, $2 = date stamp, $3 = expected version; tags it and checks it ranks newest
  commit "work for $2"
  expect "$1" "$(decide "$2")" "$3"
  git tag "$3"
  expect "$1 ranks newest" "$(newest_tag)" "$3"
}

echo "Test 1: a release moves nightlies to the next minor"
git tag v1.12.2
expect "after v1.12.2" "$(decide 20260901)" "v1.13.0-dev.20260901"
git tag v1.13.0-dev.20260901

echo "Test 2: nothing new since the last nightly skips, FORCE builds"
expect "same commit" "$(decide 20260902)" "build=false"
forced="$(FORCE=true NIGHTLY_STAMP=20260902 bash "${SCRIPT}" 2>/dev/null | sed -n 's/^version=//p')"
expect "forced same commit" "${forced}" "v1.13.0-dev.20260902"

echo "Test 3: a second build on the same day gets a .2 suffix"
commit "work"
expect "same day again" "$(decide 20260901)" "v1.13.0-dev.20260901.2"

echo "Test 4: a beta keeps nightlies on its own version, ranked above it"
git tag v1.13.0-beta.0
nightly "after v1.13.0-beta.0" 20260905 "v1.13.0-dev.20260905"
git tag v1.13.0-beta.1
nightly "after v1.13.0-beta.1" 20260906 "v1.13.0-dev.20260906"

echo "Test 5: a candidate moves nightlies to the next minor, since dev sorts below rc"
git tag v1.13.0-rc.0
nightly "after v1.13.0-rc.0" 20260908 "v1.14.0-dev.20260908"

echo "Test 6: the release keeps them there"
git tag v1.13.0
nightly "after v1.13.0" 20260910 "v1.14.0-dev.20260910"

echo "Test 7: so does a hotfix of it"
git tag v1.13.1
nightly "after v1.13.1" 20260912 "v1.14.0-dev.20260912"

echo "Test 8: a hotfix beta does not pull nightlies back below the next minor"
git tag v1.13.2-beta.0
nightly "after v1.13.2-beta.0" 20260914 "v1.14.0-dev.20260914"

echo "Test 9: the next beta keeps nightlies on its version"
git tag v1.14.0-beta.0
nightly "after v1.14.0-beta.0" 20260920 "v1.14.0-dev.20260920"

echo "Test 10: a new major beta moves them to it"
git tag v2.0.0-beta.0
nightly "after v2.0.0-beta.0" 20260925 "v2.0.0-dev.20260925"

echo "All nightly-version tests passed"
