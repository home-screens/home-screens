#!/usr/bin/env bash
set -euo pipefail

# Release a new version: bumps package.json, generates release notes,
# commits, tags, and pushes.
#
# Usage:
#   ./scripts/release.sh patch       # 0.3.0 → 0.3.1
#   ./scripts/release.sh minor       # 0.3.0 → 0.4.0
#   ./scripts/release.sh major       # 0.3.0 → 1.0.0
#   ./scripts/release.sh prepatch    # 0.3.0 → 0.3.1-rc.0
#   ./scripts/release.sh preminor    # 0.3.0 → 0.4.0-rc.0
#   ./scripts/release.sh premajor    # 0.3.0 → 1.0.0-rc.0
#   ./scripts/release.sh prerelease  # 0.4.0-rc.0 → 0.4.0-rc.1
#   ./scripts/release.sh --no-push minor  # commit + tag, but don't push

NO_PUSH=false
BUMP=""

for arg in "$@"; do
  case "$arg" in
    --no-push) NO_PUSH=true ;;
    *) BUMP="$arg" ;;
  esac
done

if [[ -z "$BUMP" || ! "$BUMP" =~ ^(patch|minor|major|prepatch|preminor|premajor|prerelease)$ ]]; then
  echo "Usage: $0 [--no-push] <patch|minor|major|prepatch|preminor|premajor|prerelease>"
  exit 1
fi

# Ensure working tree is clean
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: uncommitted changes. Commit or stash first."
  exit 1
fi

# Run lint, tests, and typecheck in parallel — abort if any fail
echo "Running pre-release checks..."
FAIL=false
npm run lint    2>&1 | sed 's/^/  [lint] /'      &  PID_LINT=$!
npm test        2>&1 | sed 's/^/  [test] /'      &  PID_TEST=$!
npx tsc --noEmit 2>&1 | sed 's/^/  [types] /'    &  PID_TYPES=$!

wait $PID_LINT  || FAIL=true
wait $PID_TEST  || FAIL=true
wait $PID_TYPES || FAIL=true

if $FAIL; then
  echo "Pre-release checks failed. Fix the errors above before releasing."
  exit 1
fi
echo "All checks passed."

# Pre-release bumps use --preid rc (e.g., 0.4.0-rc.0)
PRE_ARGS=()
if [[ "$BUMP" == pre* ]]; then
  PRE_ARGS=(--preid rc)
fi

# Bump version in package.json without committing or tagging
npm version "$BUMP" --no-git-tag-version ${PRE_ARGS[@]+"${PRE_ARGS[@]}"}
NEXT_VERSION=$(node -p "require('./package.json').version")

echo "Preparing release v${NEXT_VERSION}..."

# Generate release notes via Claude CLI
if command -v claude &>/dev/null; then
  echo "Generating release notes..."
  mkdir -p RELEASE_NOTES
  echo "/draft-release-notes ${NEXT_VERSION}" \
    | claude -p --allowedTools 'Bash(git:*) Read Write' \
    || echo "Warning: release notes generation failed, continuing without them"
else
  echo "Skipping release notes (claude CLI not installed)"
fi

# Stage version bump and release notes
git add package.json
[ -f package-lock.json ] && git add package-lock.json
[ -d RELEASE_NOTES ] && git add RELEASE_NOTES/

# Commit and tag
git commit -m "release v${NEXT_VERSION}"
git tag -a "v${NEXT_VERSION}" -m "release v${NEXT_VERSION}"

TAG="v${NEXT_VERSION}"

if $NO_PUSH; then
  echo ""
  echo "Created ${TAG} (not pushed)."
  echo "  Inspect:  git log --oneline -1 && cat RELEASE_NOTES/${TAG}.md"
  echo "  Push:     git push origin main --follow-tags"
  echo "  Undo:     git tag -d ${TAG} && git reset --soft HEAD~1"
else
  git push origin main --follow-tags
  echo ""
  if [[ "$BUMP" == pre* ]]; then
    echo "Pre-released ${TAG}."
    echo "  Visible to devices on the pre-release update channel."
    echo "  Bump RC:      $0 prerelease"
    echo "  Promote:      $0 minor  (or patch/major)"
  else
    echo "Released ${TAG}. Deploy with:"
    echo "  ./scripts/deploy.sh"
  fi
fi
