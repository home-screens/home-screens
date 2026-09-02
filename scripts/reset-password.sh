#!/usr/bin/env bash
# Home Screens password reset.
#
# Installed as /usr/local/bin/home-screens-reset-password. Run it on the
# device (plug in a keyboard, or SSH in) when nobody can remember the editor
# password. It clears the stored password so Home Screens opens without one;
# a new password is set again from Settings > Security.
#
# Deliberately narrow: it touches only the password fields. The IP allowlist
# and the display token are preserved, matching what "Turn off the password"
# does in the editor, so a household running "no password, but LAN-only"
# keeps that setting.
#
# Configuration (env):
#   HS_DATA_DIR — data directory to operate on. Defaults to the standard
#                 install path, then ./data, so it also works from a checkout.
set -euo pipefail

DEFAULT_DATA_DIR="/opt/home-screens/current/data"

DATA_DIR="${HS_DATA_DIR:-}"
if [ -z "${DATA_DIR}" ]; then
  if [ -d "${DEFAULT_DATA_DIR}" ]; then
    DATA_DIR="${DEFAULT_DATA_DIR}"
  elif [ -d "./data" ]; then
    DATA_DIR="./data"
  else
    echo "Could not find the Home Screens data folder." >&2
    echo "Looked in ${DEFAULT_DATA_DIR} and ./data." >&2
    echo "Set HS_DATA_DIR to the right folder and run this again." >&2
    exit 1
  fi
fi

AUTH_FILE="${DATA_DIR}/auth.json"

if [ ! -f "${AUTH_FILE}" ]; then
  echo "There is no password set on this device — nothing to reset."
  echo "Open Home Screens in a browser and it will let you straight in."
  exit 0
fi

if [ ! -w "${AUTH_FILE}" ]; then
  echo "No permission to change ${AUTH_FILE}." >&2
  echo "Run this again with sudo, or as the user that installed Home Screens." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found, so this script cannot edit ${AUTH_FILE}." >&2
  echo "Deleting that file by hand also clears the password." >&2
  exit 1
fi

# Rewrite in place through a temp file in the same directory, so an
# interrupted write can never leave a half-written auth.json behind (the
# server treats a corrupt one as fatal rather than as "no password").
node - "${AUTH_FILE}" <<'NODE'
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
let state;
try {
  state = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  // A file we cannot parse is already unusable; replacing it wholesale is
  // both the reset and the repair.
  state = {};
}

// Same fields "Turn off the password" clears, and the same ones it keeps.
const next = {
  passwordHash: null,
  salt: null,
  cookieSecret: null,
  displayToken: null,
};
for (const key of ['ipAllowlist', 'ipBypassAuth', 'ipRestrictAccess']) {
  if (state[key] !== undefined) next[key] = state[key];
}

const tmp = path.join(path.dirname(file), `.auth.json.reset.${process.pid}`);
fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
fs.renameSync(tmp, file);
NODE

echo "Done. Home Screens no longer asks for a password."
echo "Open it in a browser, then set a new password in Settings > Security."
