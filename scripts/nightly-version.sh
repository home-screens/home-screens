#!/usr/bin/env bash
# Decide whether to build a nightly from the current checkout, and which
# version it gets. Prints GitHub Actions output lines on stdout:
#
#   sha=<commit>
#   build=true|false
#   version=vX.Y.Z-dev.YYYYMMDD[.N]   (only when build=true)
#
# Progress and reasons go to stderr. Run from the repository root with every
# tag fetched. FORCE=true builds even when main has not moved since the last
# nightly. NIGHTLY_STAMP overrides today's date stamp (tests).
#
# Version shape: vX.Y.Z-dev.YYYYMMDD. The base X.Y.Z is the highest of:
#   - one patch above the newest release tag, or the next minor when the
#     newest tag is a candidate or beta: its version has not shipped and its
#     hotfixes are still to come, so v1.13.0-rc.1 gives v1.14.0-dev.*;
#   - the base of the previous nightly. Once the rc has pushed nightlies to
#     1.14.0-dev.*, the stable v1.13.0 shipping must not pull them back to
#     1.13.1-dev.*, or the update check would rank the older nightly newest.
# Together these keep every nightly above the release it follows, that
# release's candidates, every hotfix of it, and every nightly before it, so
# inside the test-builds channel "newest" is always the newest commit.
set -euo pipefail

FORCE="${FORCE:-false}"
STAMP="${NIGHTLY_STAMP:-$(date -u +%Y%m%d)}"

SHA="$(git rev-parse HEAD)"
echo "sha=${SHA}"

# Nothing new since the last nightly: skip, unless forced.
LAST_NIGHTLY="$(git -c versionsort.suffix=-dev tag -l 'v*-dev.*' --sort=-v:refname | head -n 1)"
if [ -n "${LAST_NIGHTLY}" ] && [ "$(git rev-list -n 1 "${LAST_NIGHTLY}")" = "${SHA}" ] && [ "${FORCE}" != "true" ]; then
  echo "main is still at ${LAST_NIGHTLY} (${SHA}); nothing to build" >&2
  echo "build=false"
  exit 0
fi

# The suffix config makes git sort v1.13.0-rc.1 below v1.13.0, so the head
# of the list is the newest by semver rather than by string.
NEWEST_TAG="$(git -c versionsort.suffix=-alpha -c versionsort.suffix=-beta -c versionsort.suffix=-rc \
  tag -l 'v*' --sort=-v:refname | grep -v -- '-dev\.' | head -n 1 || true)"
if [ -z "${NEWEST_TAG}" ]; then
  echo "::error::No release tag found to base the nightly version on" >&2
  exit 1
fi
CORE="${NEWEST_TAG#v}"
CORE="${CORE%%-*}"
IFS=. read -r MAJOR MINOR PATCH <<< "${CORE}"
case "${NEWEST_TAG}" in
  *-*) BASE="${MAJOR}.$(( MINOR + 1 )).0" ;;
  *)   BASE="${MAJOR}.${MINOR}.$(( PATCH + 1 ))" ;;
esac

# Never step below the previous nightly's base.
if [ -n "${LAST_NIGHTLY}" ]; then
  LAST_BASE="${LAST_NIGHTLY#v}"
  LAST_BASE="${LAST_BASE%%-*}"
  BASE="$(printf '%s\n%s\n' "${BASE}" "${LAST_BASE}" | sort -V | tail -n 1)"
fi

VERSION="v${BASE}-dev.${STAMP}"
N=2
while git rev-parse -q --verify "refs/tags/${VERSION}" >/dev/null; do
  VERSION="v${BASE}-dev.${STAMP}.${N}"
  N=$(( N + 1 ))
done

echo "Nightly ${VERSION} from ${SHA} (newest release tag ${NEWEST_TAG}, last nightly ${LAST_NIGHTLY:-none})" >&2
echo "build=true"
echo "version=${VERSION}"
