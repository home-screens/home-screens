#!/usr/bin/env node
// kiosk.conf from config.json, for setup-system (lib/setup-system.sh).
//
// The app writes the same file after every config save (buildKioskConf in
// src/lib/kiosk.ts); this is the copy setup-system runs with no built app
// beside it, so the two cannot share code at runtime. The rule is a literal
// copy of resolveHubPanel there, and scripts/__tests__/kiosk-conf.test.ts
// holds the two to the same answer.
//
// Usage: node kiosk-conf.cjs <config.json>   prints the file's content
//
// CommonJS on purpose: the Pi runs it as a plain file with no bundler or
// transpiler, and the test requires it as one.
/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const fs = require('fs');

/** The four rotations kiosk.conf may carry; the file is sourced by bash. */
const TRANSFORMS = ['normal', '90', '180', '270'];

function pick() {
  for (let i = 0; i < arguments.length; i++) {
    if (arguments[i] != null) return arguments[i];
  }
  return undefined;
}

function okNum(n) {
  return typeof n === 'number' && isFinite(n) && Math.abs(n) <= 100;
}

/** kiosk.conf content for a config.json object, trailing newline included. */
function buildKioskConf(c) {
  const s = c.settings || {};
  // The screen plugged into this machine: the display that /display renders
  // once a displays list exists (main, else the first), each field falling
  // back to the global.
  const ds = Array.isArray(c.displays) ? c.displays : [];
  const hub = ds.filter(function (d) { return d && d.id === 'main'; })[0] || ds[0] || {};
  const hs = hub.settings || {};
  const w = pick(hub.displayWidth, hs.displayWidth, s.displayWidth) || 0;
  const h = pick(hub.displayHeight, hs.displayHeight, s.displayHeight) || 0;
  let t = pick(hub.displayTransform, hs.displayTransform, s.displayTransform);
  if (TRANSFORMS.indexOf(t) === -1) t = 'normal';
  const mw = Math.max(w, h);
  const mh = Math.min(w, h);
  const lines = [];
  if (mw && mh) lines.push('DISPLAY_MODE="' + mw + 'x' + mh + '"');
  if (t !== 'normal') lines.push('DISPLAY_TRANSFORM="' + t + '"');
  // Six numbers that replace the touch matrix labwc-rc.sh picks from the
  // rotation. With a displays list the hub display owns it outright: unset
  // there means follow the rotation.
  const m = ds.length ? hub.touchMatrix : s.touchMatrix;
  if (Array.isArray(m) && m.length === 6 && m.every(okNum)) {
    lines.push('TOUCH_MATRIX="' + m.map(function (n) { return String(Number(n.toFixed(6))); }).join(' ') + '"');
  }
  // kiosk.conf is sourced by bash, so the variant is written only when it is a plain word.
  if (typeof s.piVariant === 'string' && /^[a-z0-9-]+$/.test(s.piVariant)) lines.push('PI_VARIANT="' + s.piVariant + '"');
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
  process.stdout.write(buildKioskConf(config));
}

module.exports = { buildKioskConf };
