import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Chromium kiosk flag parity.
 *
 * The kiosk browser is launched from four places, and only one of them can
 * source lib/common.sh at runtime: kiosk-launcher-display.sh ships to spokes
 * on its own (see KIOSK_BUNDLE_FILES), and upgrade.sh emits the hub launcher
 * as a heredoc, so both carry literal flag lists. They have drifted before —
 * --remote-debugging-port went missing from the display-only launcher, which
 * is the flag that lets a deploy reload the page over CDP instead of killing
 * and relaunching the browser.
 *
 * This test is what makes that drift loud: the literal lists must match the
 * CHROMIUM_KIOSK_FLAGS / CHROMIUM_KIOSK_PI_FLAGS arrays in common.sh exactly.
 * Add a flag there and the copies fail until they are updated too.
 */

const SCRIPTS = path.join(process.cwd(), 'scripts');

function read(rel: string): string {
  return readFileSync(path.join(SCRIPTS, rel), 'utf-8');
}

/** Pull a `NAME=( ... )` bash array literal out of a script. */
function bashArray(source: string, name: string): string[] {
  const match = source.match(new RegExp(`^${name}=\\(\\n([\\s\\S]*?)^\\)`, 'm'));
  if (!match) throw new Error(`array ${name} not found`);
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** Every `--flag` token in a block of shell text. */
function flagsIn(block: string): string[] {
  return block.match(/--[a-z0-9-]+(?:=[^\s\\'"]*)?/g) ?? [];
}

/**
 * The `exec chromium \` … continuation block starting at `fromIndex`, i.e.
 * every line up to and including the first one that does not end in a
 * backslash.
 */
function chromiumInvocation(source: string, fromIndex = 0): string {
  const start = source.indexOf('exec chromium \\', fromIndex);
  if (start === -1) throw new Error('no `exec chromium \\` invocation found');
  const lines = source.slice(start).split('\n');
  const block: string[] = [];
  for (const line of lines) {
    block.push(line);
    if (!line.trimEnd().endsWith('\\')) break;
  }
  return block.join('\n');
}

const common = read('lib/common.sh');
const BASE_FLAGS = bashArray(common, 'CHROMIUM_KIOSK_FLAGS');
const PI_FLAGS = bashArray(common, 'CHROMIUM_KIOSK_PI_FLAGS');
/** The `--app=` target is per-launcher; everything else must be canonical. */
const APP_FLAG = /^--app=/;

function kioskFlagsOf(block: string): string[] {
  return flagsIn(block).filter((f) => !APP_FLAG.test(f));
}

describe('common.sh flag arrays', () => {
  it('are non-empty and disjoint', () => {
    expect(BASE_FLAGS.length).toBeGreaterThan(0);
    expect(PI_FLAGS.length).toBeGreaterThan(0);
    expect(BASE_FLAGS.filter((f) => PI_FLAGS.includes(f))).toEqual([]);
  });

  it('includes the CDP port a deploy needs to reload the page', () => {
    expect(BASE_FLAGS).toContain('--remote-debugging-port=9222');
  });
});

describe('literal chromium invocations match common.sh', () => {
  it('kiosk-launcher-display.sh (display-only spoke launcher)', () => {
    const flags = kioskFlagsOf(chromiumInvocation(read('kiosk-launcher-display.sh')));
    expect([...flags].sort()).toEqual([...BASE_FLAGS, ...PI_FLAGS].sort());
  });

  it('upgrade.sh generated hub launcher heredoc', () => {
    const flags = kioskFlagsOf(chromiumInvocation(read('upgrade.sh')));
    expect([...flags].sort()).toEqual([...BASE_FLAGS, ...PI_FLAGS].sort());
  });

  it('upgrade.sh reload-browser relaunch fallback', () => {
    const flags = bashArray(read('upgrade.sh').replace(/^ +/gm, ''), 'RELAUNCH_FLAGS');
    expect([...flags].sort()).toEqual([...BASE_FLAGS, ...PI_FLAGS].sort());
  });
});

describe('scripts that can source common.sh use the arrays, not copies', () => {
  it('start-display.sh expands CHROMIUM_KIOSK_FLAGS and hardcodes nothing', () => {
    const source = read('start-display.sh');
    expect(source).toContain('"${CHROMIUM_KIOSK_FLAGS[@]}"');
    // Deliberately base flags only: --ozone-platform=wayland fails on a dev box.
    expect(source).not.toContain('"${CHROMIUM_KIOSK_PI_FLAGS[@]}"');
    const chromiumLine = source.split('\n').find((l) => l.startsWith('chromium ')) ?? '';
    expect(kioskFlagsOf(chromiumLine)).toEqual([]);
  });

  it('start-display.sh clears crash state via the shared helper', () => {
    expect(read('start-display.sh')).toContain('clear_chromium_crash_state');
    expect(read('start-display.sh')).not.toContain('exited_cleanly');
  });
});

describe('prefs-cleanup copies match clear_chromium_crash_state', () => {
  const SED = 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/';
  const PURGE = 'rm -rf "${HOME}/.config/chromium/Default/Sessions" 2>/dev/null || true';

  it('common.sh defines the canonical helper', () => {
    expect(common).toContain('clear_chromium_crash_state()');
    expect(common).toContain(SED);
    expect(common).toContain(PURGE);
  });

  // Both of these run with no lib/ beside them, so they must inline the body.
  it.each(['kiosk-launcher-display.sh', 'upgrade.sh'])('%s inlines the same body', (file) => {
    // upgrade.sh emits its copy inside a single-quoted heredoc, so `'` in the
    // sed program is escaped as '"'"' — unescape before comparing.
    const source = read(file).replaceAll(`'"'"'`, "'");
    expect(source).toContain(SED);
    expect(source).toContain(PURGE);
  });
});
